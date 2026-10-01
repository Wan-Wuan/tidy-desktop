import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { assertSender, assertPath } from '../ipcGuard'
import { readJsonFile, getDefaultConfig, ICONS_DIR, CONFIG_FILE } from '../config'
import { probeEverything, searchEverything } from '../fileSearch'
import {
  candidatePorts,
  detectEverything,
  detectEverythingPort,
  invalidateEverythingDetection,
  warmEverythingDetection
} from '../everythingDetect'
import type { Config, EverythingStatus, FileSearchResponse } from '../../shared/types'

/** 图标缓存文件名：16 位 hex + 扩展名，避免任意路径穿越。 */
const ICON_NAME_PATTERN = /^[0-9a-f]{1,64}\.[a-z0-9]+$/i

/* 已确认可用的 Everything 端口（60s 缓存）：避免每次按键都把候选端口扫一遍。
   ⚠️ 为什么需要「扫候选端口」而不是只信 ini：Everything 运行期不一定立刻把
   `http_server_enabled` 写回 ini，磁盘上的值可能滞后；而 Everything 正在监听哪个
   端口是**事实**。所以 ini 只用来挑首选端口，最终以实际探测为准。 */
let workingPort: { at: number; port: number } | null = null
const WORKING_PORT_TTL_MS = 60_000

/**
 * 挑出真正可用的 Everything 端口（0 = 没有）。
 * 全部走异步探测，不阻塞主进程；显式配置端口时不做候选扫描。
 */
async function pickEverythingPort(
  explicitPort: number,
  auth: { username?: string; password?: string }
): Promise<number> {
  if (explicitPort > 0) {
    return (await probeEverything(explicitPort, 500, auth)) ? explicitPort : 0
  }
  if (workingPort && Date.now() - workingPort.at < WORKING_PORT_TTL_MS) {
    if (await probeEverything(workingPort.port, 300, auth)) return workingPort.port
    workingPort = null
  }
  const info = await detectEverythingPort()
  for (const port of candidatePorts(0, info)) {
    if (await probeEverything(port, 300, auth)) {
      workingPort = { at: Date.now(), port }
      return port
    }
  }
  return 0
}

export function registerFileSearchHandlers(): void {
  // 启动即预热（异步查注册表 / 读 ini），避免用户第一次搜索时才现查造成卡顿
  warmEverythingDetection()

  /**
   * 本机文件搜索：**只走 Everything**（内置索引已移除）。
   *
   * ⚠️ 搜索热路径上不得有任何同步子进程——以前用 execFileSync 查注册表，
   * 直接把主进程卡住，表现为「唤出搜索框卡顿」。
   */
  ipcMain.handle('search-files', async (event: IpcMainInvokeEvent, payload: unknown): Promise<FileSearchResponse> => {
    if (!assertSender(event)) return { results: [], source: 'none', port: 0 }
    const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const query = typeof p.query === 'string' ? p.query : ''
    // 上限 300：同名文件散落在多磁盘时，过小的 limit 会把整批结果截掉。
    const limit = Math.min(300, Math.max(1, Math.round(typeof p.limit === 'number' ? p.limit : 100)))
    if (!query.trim()) return { results: [], source: 'none', port: 0 }

    const info = await detectEverythingPort()
    const auth = { username: info.username, password: info.password }
    const port = await pickEverythingPort(config.everythingHttpPort || 0, auth)
    if (port <= 0) return { results: [], source: 'none', port: 0 }

    try {
      const results = await searchEverything(port, query, limit, { auth })
      return { results, source: 'everything', port }
    } catch {
      /* 端口失效（Everything 退出 / 端口被改）：丢弃缓存，本次返回空 */
      workingPort = null
      return { results: [], source: 'none', port }
    }
  })

  /**
   * 探测本机 Everything：是否安装 / 是否运行 / HTTP 服务是否启用 / 端口是否连得上。
   * 仅供设置页状态展示与「重新检测」按钮使用（会起子进程，故不在搜索热路径上）。
   */
  ipcMain.handle('detect-everything', async (event: IpcMainInvokeEvent): Promise<EverythingStatus> => {
    const empty: EverythingStatus = {
      installed: false,
      running: false,
      httpEnabled: false,
      port: 0,
      reachable: false
    }
    if (!assertSender(event)) return empty
    const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    invalidateEverythingDetection()
    workingPort = null
    const detection = await detectEverything(true)
    const port = await pickEverythingPort(config.everythingHttpPort || 0, {
      username: detection.username,
      password: detection.password
    })
    return {
      installed: detection.installed,
      running: detection.running,
      httpEnabled: detection.httpEnabled,
      port,
      reachable: port > 0,
      iniPath: detection.iniPath,
      exePath: detection.exePath
    }
  })

  /**
   * 渲染层拿分类图片（存为 icons/ 下的文件名）的绝对 file:// URL。
   * 文件名先过白名单，杜绝路径穿越。
   */
  ipcMain.handle('get-icon-file-url', (event: IpcMainInvokeEvent, name: unknown) => {
    if (!assertSender(event)) return null
    if (typeof name !== 'string' || !ICON_NAME_PATTERN.test(name)) return null
    return pathToFileURL(path.join(ICONS_DIR, name)).href
  })

  /**
   * 把用户选的本地图片（或粘贴的 SVG 文本存成的文件）复制到图标缓存，
   * 返回缓存文件名（≤40 字符，可安全存进 `category.icon` 的 `image:` 段）。
   * 限制大小（5MB）避免把大文件塞进图标缓存。
   */
  ipcMain.handle('save-image-to-icon-cache', (event: IpcMainInvokeEvent, sourcePath: unknown) => {
    if (!assertSender(event)) return null
    const safe = assertPath(sourcePath, {
      extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.bmp', '.avif'],
      mustExist: true,
      absolute: true
    })
    if (!safe) return null
    let stat: fs.Stats
    try {
      stat = fs.statSync(safe)
    } catch {
      return null
    }
    if (stat.size > 5 * 1024 * 1024) return null
    const ext = path.extname(safe).toLowerCase()
    const hash = crypto
      .createHash('sha1')
      .update(`${safe}:${stat.size}:${stat.mtimeMs}`)
      .digest('hex')
      .slice(0, 16)
    const fileName = `${hash}${ext}`
    try {
      fs.copyFileSync(safe, path.join(ICONS_DIR, fileName))
    } catch {
      return null
    }
    return fileName
  })
}
