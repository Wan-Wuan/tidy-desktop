import { app } from 'electron'
import path from 'path'
import fs from 'fs'

import { recoverInterruptedWrites, writeJsonFilesAtomically } from './jsonTransaction'
import {
  DEFAULT_HOTKEY,
  DEFAULT_SEARCH_HOTKEY,
  planHotkeyDefaultMigration,
  planSearchHotkeyDefaultMigration
} from '../shared/defaults'
import type { Config } from '../shared/types'

export { writeJsonFilesAtomically, recoverInterruptedWrites }

/**
 * 便携版（portable target）的落点：electron-builder 注入的环境变量指向
 * **便携 exe 所在的真实目录**。
 *
 * ⚠️ 不能改用 `process.execPath` 的目录：便携版运行时会把自己解压到临时目录再从那里启动，
 * `execPath` 指向的是临时目录，程序一退出就被清掉——数据写在那儿等于每次启动都从零开始。
 *
 * 开发环境（未打包）下这个变量不存在，为 null。
 */
export const PORTABLE_DIR = (process.env.PORTABLE_EXECUTABLE_DIR || '').trim() || null

/** 当前是否运行在便携版里 */
export const IS_PORTABLE = PORTABLE_DIR !== null

/**
 * 数据根目录（`CONFIG_DIR` 是它下面的 `data` 子目录）。
 *
 *  · 安装版：`%APPDATA%\<appName>`（Electron 的 userData），机器级位置；
 *  · **便携版：便携 exe 所在目录**——"免安装"必须同时是"配置跟着走"，
 *    否则用户把 exe 拷到 U 盘，配置还留在原来那台机器上，等于没便携。
 */
function resolveDataRoot(): string {
  if (PORTABLE_DIR) return PORTABLE_DIR
  return app.getPath('userData')
}

export const DATA_ROOT = resolveDataRoot()
export const CONFIG_DIR = path.join(DATA_ROOT, 'data')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
export const APPS_FILE = path.join(CONFIG_DIR, 'apps.json')
export const CATEGORIES_FILE = path.join(CONFIG_DIR, 'categories.json')
export const COLLECTIONS_FILE = path.join(CONFIG_DIR, 'collections.json')
export const ICONS_DIR = path.join(CONFIG_DIR, 'icons')

/**
 * 异步清理图标缓存目录。
 *
 * 原本这段逻辑在 `ensureDataDir` 里用 `fs.readdirSync` + `fs.unlinkSync` 同步跑，
 * 而 `ensureDataDir` 在 `app.on('ready')` 的启动路径上被同步调用——几百个缓存文件
 * 逐一 stat/删除会卡住主窗口弹出。这里把它挪到 `setImmediate` 之后，用 `fs.promises`
 * 异步删文件，既保持原有清理规则（删 0 字节文件 + 不符合 32 位十六进制 png 的旧缓存），
 * 又不再阻塞启动。整体 try/catch：清理失败绝不影响启动。
 */
export function scheduleIconCacheCleanup(): void {
  setImmediate(() => {
    void (async () => {
      try {
        const files = await fs.promises.readdir(ICONS_DIR)
        for (const file of files) {
          const filePath = path.join(ICONS_DIR, file)
          const stat = await fs.promises.stat(filePath)
          if (stat.size === 0) {
            await fs.promises.unlink(filePath)
            continue
          }
          // 清理旧缓存键规则（base64url 截断）遗留的文件；当前键为 32 位十六进制 png
          const lower = file.toLowerCase()
          if (lower.endsWith('.png') && !/^[0-9a-f]{32}\.png$/.test(lower)) {
            await fs.promises.unlink(filePath)
          }
        }
      } catch { /* ignore：清理失败不影响启动 */ }
    })()
  })
}

export function ensureDataDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  // 必须排在所有 readJsonFile 之前：上一次写入若卡在两次 rename 之间被中断，
  // 主文件会缺失而内容还在 .bak / .tmp 里；不先恢复就会被当成"没有数据"，
  // 随后渲染层一保存就把默认值写回去，等于永久丢掉用户的分类。
  recoverInterruptedWrites(CONFIG_DIR)
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true })
  }
  // 启动路径上只做必需的同步工作（建目录 + 恢复中断写入）；图标缓存清理改为异步，
  // 由 scheduleIconCacheCleanup 排到事件循环之后执行，不再阻塞 ready。
  scheduleIconCacheCleanup()
}

/**
 * 一次性把「旧默认主热键」迁移到新默认值。
 *
 * 背景：`Alt+Space` 是 Windows 保留组合，`globalShortcut.register` 拿不到，
 * 老用户升级上来会继续顶着这个坏默认值，表现为「按了没反应」。
 *
 * 判定刻意保守——**只匹配旧默认值这一个字面量**：
 *  · 用户手动改成过别的组合 → 不动（那可能是他特意选的）；
 *  · 配置文件不存在（新装）→ 读到的就是新默认值，不触发迁移。
 *
 * 无论是否真的改了值，都会打上 `hotkeyDefaultMigrated` 标记：
 * 否则用户以后手动把热键设回 `Alt+Space` 时，下次启动又会被自动改掉。
 *
 * @returns 实际发生了替换时返回新旧值，否则返回 null
 */
export function migrateLegacyHotkeyDefault(): { from: string; to: string } | null {
  // 配置损坏时绝不写入：此刻读到的是解析失败后的默认值，写回去等于用默认值覆盖用户配置
  if (isDataFileCorrupted(CONFIG_FILE)) return null

  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const plan = planHotkeyDefaultMigration(config)
  if (!plan) return null

  const current = (config.hotkey || '').trim()
  const next: Config = {
    ...config,
    hotkey: plan.nextHotkey ?? config.hotkey,
    // 无论是否改了值都打上标记：否则用户以后手动设回 Alt+Space 会被反复改掉
    hotkeyDefaultMigrated: true
  }
  if (!writeJsonFile(CONFIG_FILE, next)) return null
  return plan.migrated && plan.nextHotkey ? { from: current, to: plan.nextHotkey } : null
}

/**
 * 一次性把「旧默认搜索热键」迁移到新默认值。
 *
 * 与主热键那次迁移的动机不同，值得单独说明：`Ctrl+K` **注册得上**，
 * 所以问题不是"按了没反应"，而是"它把全系统的 Ctrl+K 抢走了"——
 * 用户在编辑器里按 Ctrl+K 失效，几乎不可能想到是启动器干的。
 * 详见 `shared/defaults.ts` 的 `DEFAULT_SEARCH_HOTKEY`。
 *
 * 判定同样保守：只匹配旧默认值这一个字面量，用户手动改成别的组合一律不动。
 * 无论是否真的改了值都打上 `searchHotkeyDefaultMigrated`，
 * 否则用户以后手动把搜索键设回 `Ctrl+K` 时，下次启动又会被自动改掉。
 *
 * @returns 实际发生了替换时返回新旧值，否则返回 null
 */
export function migrateLegacySearchHotkeyDefault(): { from: string; to: string } | null {
  if (isDataFileCorrupted(CONFIG_FILE)) return null

  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const plan = planSearchHotkeyDefaultMigration(config)
  if (!plan) return null

  const current = (config.searchHotkey || '').trim()
  const next: Config = {
    ...config,
    searchHotkey: plan.nextSearchHotkey ?? config.searchHotkey,
    searchHotkeyDefaultMigrated: true
  }
  if (!writeJsonFile(CONFIG_FILE, next)) return null
  return plan.migrated && plan.nextSearchHotkey ? { from: current, to: plan.nextSearchHotkey } : null
}

/**
 * 本次运行中解析失败过的数据文件。
 *
 * 损坏的文件必须**在本次会话内拒绝写入**：解析失败只会返回默认值，而渲染层拿到
 * 默认值后会立刻保存回去，那就把用户真正的数据盖掉了（虽然 .corrupt-* 里还留着，
 * 但用户完全不知道它存在）。这里记下名单，写入口据此拒绝。
 */
const corruptedFiles = new Set<string>()

export function isDataFileCorrupted(filePath: string): boolean {
  return corruptedFiles.has(filePath)
}

export function getCorruptedFiles(): string[] {
  return [...corruptedFiles]
}

export interface CorruptBackup {
  /** 损坏的原始数据文件路径 */
  targetFile: string
  /** 留档文件路径（<原文件>.corrupt-<时间戳>） */
  backupPath: string
  fileName: string
  size: number
  createdAt: number
}

/**
 * 列出数据目录里所有 `.corrupt-*` 留档。
 *
 * 这些文件是 `readJsonFile` 解析失败时自动留的底，但以前没有任何入口能发现或使用它们，
 * 用户实际处于"数据看着没了、其实还在磁盘上"的状态。
 */
export function listCorruptBackups(dir: string = CONFIG_DIR): CorruptBackup[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }

  const results: CorruptBackup[] = []
  for (const entry of entries) {
    const markerIndex = entry.indexOf('.corrupt-')
    if (markerIndex === -1) continue
    const fullPath = path.join(dir, entry)
    try {
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) continue
      results.push({
        targetFile: path.join(dir, entry.slice(0, markerIndex)),
        backupPath: fullPath,
        fileName: entry,
        size: stat.size,
        createdAt: stat.mtimeMs
      })
    } catch {
      /* ignore */
    }
  }
  return results.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 用留档覆盖回目标文件。
 *
 * 调用方（渲染层）会先让用户确认，这里只做搬运：把留档复制成目标文件，
 * 并**保留留档本身**——万一用户后悔还能再来一次。
 */
export function restoreCorruptBackup(backupPath: string, targetFile: string): boolean {
  try {
    const raw = fs.readFileSync(backupPath, 'utf-8')
    // 先确认内容是可解析的 JSON，避免把同样损坏的内容又搬回原位
    JSON.parse(raw)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.writeFileSync(targetFile, raw, 'utf-8')
    // 恢复成功后解除写保护，否则用户之后所有保存都会被拒
    corruptedFiles.delete(targetFile)
    return true
  } catch (error) {
    console.error(`Error restoring ${targetFile} from ${backupPath}:`, error)
    return false
  }
}

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) return defaultValue
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
    return defaultValue
  }
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    // 解析失败说明文件已损坏：先把原始内容留档，避免后续写入覆盖后无法恢复
    console.error(`Error parsing ${filePath}:`, error)
    try {
      fs.writeFileSync(`${filePath}.corrupt-${Date.now()}`, raw, 'utf-8')
    } catch { /* ignore */ }
    corruptedFiles.add(filePath)
    return defaultValue
  }
}

export function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    ensureDataDir()
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
    return true
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
    try { fs.unlinkSync(filePath + '.tmp') } catch { /* ignore */ }
    return false
  }
}

export function getDefaultConfig() {
  return {
    // 默认值统一来自 shared/defaults.ts，别在这里写字面量——
    // 主进程的注册兜底、设置页的「恢复默认」按钮读的都是同一份，写死就会对不上。
    hotkey: DEFAULT_HOTKEY,
    searchHotkey: DEFAULT_SEARCH_HOTKEY,
    hotkeyDefaultMigrated: false,
    searchHotkeyDefaultMigrated: false,
    windowSize: { width: 1050, height: 800 },
    windowPosition: null,
    searchEngines: {
      b: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
      g: { name: 'Google', url: 'https://www.google.com/search?q=' },
      bd: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
      yh: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
      ddg: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
      gh: { name: 'GitHub', url: 'https://github.com/search?q=' },
      yt: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
      npm: { name: 'npm', url: 'https://www.npmjs.com/search?q=' },
      mdn: { name: 'MDN', url: 'https://developer.mozilla.org/search?q=' },
      so: { name: 'StackOverflow', url: 'https://stackoverflow.com/search?q=' },
      zhihu: { name: '知乎', url: 'https://www.zhihu.com/search?q=' },
      bilibili: { name: 'B站', url: 'https://search.bilibili.com/all?keyword=' }
    },
    autoStart: false,
    closeAction: 'tray' as const,
    lastActiveCategoryId: null,
    trayNotified: false,
    searchAutoHideOnBlur: false,
    startMinimizedToTray: false,
    mainAutoHideOnBlur: false,
    ui: {
      gridColumns: 6,
      cardSize: 'medium' as const,
      showIcon: true,
      showName: true,
      borderRadius: 8,
      theme: 'aurora' as const,
      layout: 'horizon-workspace' as const,
      sidebarWidth: 240,
      accentColor: '',
      searchWidth: 600,
      searchVerticalRatio: 0.3,
      searchMaxResults: 6,
      sortMode: 'manual' as const,
      searchTheme: 'dark' as const,
      searchOpacity: 0.72,
      searchHintsVisible: true,
      toolbarIconOnly: true,
    },
    defaultEngine: 'b',
    onboardingCompleted: false,
    /* 添加网址项目时是否联网抓取标题与 favicon。默认开，但必须能关：
       抓取会暴露用户添加过哪些网址，这是唯一一处主进程主动访问外部地址的行为。 */
    urlMetaEnabled: true,
    pauseHotkey: '',
    everythingHttpPort: 0,
    /* 便携版默认把「便携根目录」设为 exe 所在目录：
       数据已经落在那里了，项目路径再存成相对形式，整个 U 盘才真的能拔了就走。
       安装版保持 null（没有天然的"整包搬移"语义，交给用户自己指定）。 */
    portableRoot: PORTABLE_DIR,
    autoCategoryRules: [],
    quickActions: [
      { key: '>shutdown', name: '关机', command: 'shutdown' as const, enabled: true },
      { key: '>restart', name: '重启', command: 'restart' as const, enabled: true },
      { key: '>lock', name: '锁定电脑', command: 'lock' as const, enabled: true },
      { key: '>settings', name: '系统设置', command: 'settings' as const, enabled: true },
      { key: '>calc', name: '计算器', command: 'calculator' as const, enabled: true },
      { key: '>notepad', name: '记事本', command: 'notepad' as const, enabled: true },
      { key: '>clipboard', name: '剪贴板历史', command: 'clipboard' as const, enabled: true }
    ]
  }
}
