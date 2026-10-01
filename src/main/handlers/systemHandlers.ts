import { ipcMain, BrowserWindow, dialog, screen, app, nativeImage, shell, clipboard } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { resolveBackupDir } from '../backup'
import { guardNativeDialog } from '../dialogGuard'
import { APPS_FILE, CATEGORIES_FILE, COLLECTIONS_FILE, CONFIG_FILE, CONFIG_DIR, ICONS_DIR, getDefaultConfig, readJsonFile, writeJsonFilesAtomically } from '../config'
import type { AppsData, CategoriesData, CollectionsData, Config, ShortcutImportItem } from '../../shared/types'
import { isAumid, toAppsFolderTarget } from '../../shared/appTargets'
import { classifyAppTarget } from '../appTargetCheck'
import { sanitizeAppsData, sanitizeCategoriesData, sanitizeCollectionsData, sanitizeConfig } from '../validation'
import { isImportableShortcut, mergeAppxResults } from '../shortcutFilter'
import { assertPath, assertSender } from '../ipcGuard'

let mainWindowRef: { current: BrowserWindow | null } = { current: null }
let searchWindowRef: { current: BrowserWindow | null } = { current: null }
let shortcutScanCache: { createdAt: number; items: ShortcutImportItem[] } | null = null
let appxScanCache: { createdAt: number; items: ShortcutImportItem[] } | null = null
type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
let mainWindowResizeSession: {
  edge: ResizeEdge
  startX: number
  startY: number
  bounds: Electron.Rectangle
} | null = null

const SHORTCUT_SCAN_LIMIT = 500
const SHORTCUT_RESULT_LIMIT = 300
/** Appx（Store / UWP）结果单独限量，避免商店应用把 .lnk 的配额挤掉 */
const APPX_RESULT_LIMIT = 120
const SHORTCUT_MERGED_LIMIT = SHORTCUT_RESULT_LIMIT + APPX_RESULT_LIMIT
const SHORTCUT_CACHE_MS = 60_000
/** PowerShell 冷启动几百毫秒，给足余量；超时就当没扫到，不能让导入流程挂住 */
const APPX_SCAN_TIMEOUT_MS = 8_000

export function setWindowRefs(main: { current: BrowserWindow | null }, search: { current: BrowserWindow | null }) {
  mainWindowRef = main
  searchWindowRef = search
}

function expandWindowsEnvPath(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name: string) => {
    return process.env[name] || process.env[name.toUpperCase()] || process.env[name.toLowerCase()] || `%${name}%`
  })
}

function resolveShortcutTarget(filePath: string): string {
  try {
    const details = shell.readShortcutLink(filePath)
    return expandWindowsEnvPath(details.target || '')
  } catch {
    return ''
  }
}

function createShortcutImportItem(filePath: string, source: ShortcutImportItem['source']): ShortcutImportItem | null {
  try {
    const targetPath = resolveShortcutTarget(filePath)
    if (!targetPath || !fs.existsSync(targetPath)) return null
    const stat = fs.statSync(targetPath)
    const type = stat.isDirectory() ? 'folder' : 'app'
    const item: ShortcutImportItem = {
      name: path.basename(filePath, path.extname(filePath)),
      path: filePath,
      targetPath,
      icon: '',
      type,
      source
    }
    /* 卸载器 / 更新器 / 帮助文档类快捷方式同样"目标存在"，但导进列表毫无意义，
       还会把用户的应用列表撑得一团乱。在扫描阶段就挡掉，后面的去重和
       数量上限也就不会被这些噪音挤占。 */
    return isImportableShortcut(item) ? item : null
  } catch {
    return null
  }
}

function getShortcutRoots(): Array<{ path: string; source: ShortcutImportItem['source'] }> {
  return [
    { path: app.getPath('desktop'), source: 'desktop' as const },
    { path: path.join(app.getPath('home'), 'Desktop'), source: 'desktop' as const },
    { path: path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'), source: 'desktop' as const },
    { path: path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), source: 'startMenu' as const },
    { path: path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), source: 'startMenu' as const }
  ].filter(item => !!item.path)
}

function collectShortcutFiles(root: string, limit = 600): string[] {
  const output: string[] = []
  const walk = (dir: string) => {
    if (output.length >= limit || !fs.existsSync(dir)) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (output.length >= limit) break
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
        output.push(fullPath)
      }
    }
  }
  walk(root)
  return output
}

/**
 * 异步跑一段 PowerShell 并拿回 stdout。
 *
 * 刻意不用 `execFileSync`：PowerShell 冷启动要几百毫秒，同步执行会把主进程
 * （窗口消息循环）整个卡住，界面上表现为"点了没反应"。任何失败都收敛成空字符串，
 * 调用方按「没扫到」处理——扫描失败不该让整个导入流程报错。
 */
function runPowerShell(script: string, timeoutMs: number): Promise<string> {
  return new Promise(resolve => {
    try {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => resolve(error ? '' : stdout)
      )
    } catch {
      resolve('')
    }
  })
}

/**
 * 扫描 Microsoft Store / UWP 应用。
 *
 * 这类应用在开始菜单里没有 .lnk（或只有一个指向 AppsFolder 的壳），
 * 只能靠 `Get-StartApps` 拿到「显示名 + AUMID」。
 *
 * 只保留 AUMID 形态规范的条目：同一份输出里桌面应用的 AppID 是
 * `{GUID}\path\to.exe` 形式，那些已经被 .lnk 扫描覆盖，重复收进来只会在
 * 导入列表里制造重复项。
 *
 * 返回 `null` 表示扫描失败（与「扫到 0 条」区分开），调用方据此决定是否缓存。
 */
async function collectAppxEntries(): Promise<ShortcutImportItem[] | null> {
  if (process.platform !== 'win32') return null
  const raw = await runPowerShell(
    'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress -Depth 3',
    APPX_SCAN_TIMEOUT_MS
  )
  if (!raw.trim()) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  // ConvertTo-Json 在只有一条结果时输出对象而非数组，这里统一成数组
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const items: ShortcutImportItem[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const name = typeof record.Name === 'string' ? record.Name.trim() : ''
    const appId = typeof record.AppID === 'string' ? record.AppID.trim() : ''
    if (!name || !isAumid(appId)) continue
    const target = toAppsFolderTarget(appId)
    items.push({
      name,
      path: target,
      targetPath: target,
      icon: '',
      type: 'app',
      source: 'appx'
    })
    if (items.length >= APPX_RESULT_LIMIT) break
  }
  return items
}

/**
 * 带缓存的 Appx 扫描。
 *
 * 失败不写缓存：下次扫描还有机会补上（PowerShell 偶发超时不该让商店应用
 * 在整个进程生命周期里都消失）；成功（哪怕是空列表）才缓存。
 */
async function getAppxEntries(): Promise<ShortcutImportItem[]> {
  if (appxScanCache && Date.now() - appxScanCache.createdAt < SHORTCUT_CACHE_MS) {
    return appxScanCache.items
  }
  const items = await collectAppxEntries()
  if (!items) return []
  appxScanCache = { createdAt: Date.now(), items }
  return items
}

export function registerSystemHandlers() {
  ipcMain.handle('begin-main-window-resize', (event, edge: unknown, screenX: unknown, screenY: unknown) => {
    const w = mainWindowRef.current
    const validEdges = new Set<ResizeEdge>(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'])
    if (
      !w ||
      w.isDestroyed() ||
      w.isMaximized() ||
      w.isFullScreen() ||
      !w.isResizable() ||
      event.sender !== w.webContents ||
      typeof edge !== 'string' ||
      !validEdges.has(edge as ResizeEdge) ||
      typeof screenX !== 'number' ||
      !Number.isFinite(screenX) ||
      typeof screenY !== 'number' ||
      !Number.isFinite(screenY)
    ) {
      return false
    }
    mainWindowResizeSession = {
      edge: edge as ResizeEdge,
      startX: screenX,
      startY: screenY,
      bounds: w.getBounds()
    }
    return true
  })

  ipcMain.on('update-main-window-resize', (event, screenX: unknown, screenY: unknown) => {
    const w = mainWindowRef.current
    const session = mainWindowResizeSession
    if (
      !w ||
      w.isDestroyed() ||
      event.sender !== w.webContents ||
      !session ||
      typeof screenX !== 'number' ||
      !Number.isFinite(screenX) ||
      typeof screenY !== 'number' ||
      !Number.isFinite(screenY)
    ) {
      return
    }

    const [minimumWidth, minimumHeight] = w.getMinimumSize()
    const dx = screenX - session.startX
    const dy = screenY - session.startY
    let { x, y, width, height } = session.bounds

    if (session.edge.includes('e')) width = Math.max(minimumWidth, session.bounds.width + dx)
    if (session.edge.includes('s')) height = Math.max(minimumHeight, session.bounds.height + dy)
    if (session.edge.includes('w')) {
      width = Math.max(minimumWidth, session.bounds.width - dx)
      x = session.bounds.x + session.bounds.width - width
    }
    if (session.edge.includes('n')) {
      height = Math.max(minimumHeight, session.bounds.height - dy)
      y = session.bounds.y + session.bounds.height - height
    }

    const display = screen.getDisplayMatching(session.bounds)
    width = Math.min(width, display.workArea.width)
    height = Math.min(height, display.workArea.height)
    if (session.edge.includes('w')) x = session.bounds.x + session.bounds.width - width
    if (session.edge.includes('n')) y = session.bounds.y + session.bounds.height - height
    w.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    })
  })

  ipcMain.on('end-main-window-resize', (event) => {
    const w = mainWindowRef.current
    if (w && !w.isDestroyed() && event.sender === w.webContents) {
      mainWindowResizeSession = null
    }
  })

  ipcMain.handle('hide-main-window', (event) => {
    if (!assertSender(event)) return
    const w = mainWindowRef.current
    if (w && !w.isDestroyed()) {
      w.hide()
    }
  })

  /* ⚠️ 这里曾有 `show-search-window` / `move-search-window-to-cursor-display` 两个 handler，
     与 `main/index.ts` 的同名函数重复实现（因为 systemHandlers 不能反向 import index，
     当初就各写了一份）。两者**渲染层从未调用过**——搜索窗的显示与跟随光标都发生在主进程
     （全局热键 / 托盘），渲染层不需要也不应该请求"显示我自己"。已连同 preload 与
     `shared/electron.d.ts` 的桥接方法一起删除，主进程内部那两份实现保留。 */
  ipcMain.handle('hide-search-window', (event) => {
    if (!assertSender(event)) return
    const w = searchWindowRef.current
    if (w && !w.isDestroyed()) {
      w.hide()
    }
  })

  ipcMain.handle('resize-search-window', (event, height: unknown) => {
    if (!assertSender(event)) return
    const w = searchWindowRef.current
    if (w && !w.isDestroyed()) {
      // 上限按**窗口所在的那块屏**算：多显示器时主副屏分辨率常常不同，
      // 用 getPrimaryDisplay 会让副屏上的搜索窗被算错高度上限。
      const { height: screenHeight } = screen.getDisplayMatching(w.getBounds()).workAreaSize
      const maxHeight = Math.round(screenHeight * 0.8)
      const requestedHeight = typeof height === 'number' && Number.isFinite(height) ? height : 60
      const finalHeight = Math.min(Math.max(60, requestedHeight), maxHeight)
      const bounds = w.getBounds()
      w.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: finalHeight
      })
    }
  })

  ipcMain.handle('confirm', async (event, message: unknown) => {
    if (!assertSender(event)) return false
    const w = mainWindowRef.current
    if (!w || w.isDestroyed()) return false
    const result = await guardNativeDialog(() => dialog.showMessageBox(w, {
      type: 'question',
      buttons: ['取消', '确定'],
      defaultId: 0,
      cancelId: 0,
      message: typeof message === 'string' ? message.slice(0, 1000) : ''
    }))
    return result.response === 1
  })

  /**
   * 多选项对话框：把「一个是非题」和「在几个方案里挑一个」分开。
   *
   * 为什么不能拿 confirm 凑合：confirm 只有"确定 / 取消"两个按钮，
   * 一旦用它问"要不要包含子文件夹"，"取消"就同时背上了两个意思——
   * 既可能是"不要子文件夹"，也可能是"算了不弄了"。用户按哪个理解都对，
   * 于是无论怎么实现都有人觉得反了。
   *
   * 返回被点按钮的下标；`null` 表示没问成（来源不合法 / 窗口没了 / 参数不合法），
   * 调用方一律按"什么都不做"处理。
   */
  ipcMain.handle('show-choice', async (event, payload: unknown) => {
    if (!assertSender(event)) return null
    const w = mainWindowRef.current
    if (!w || w.isDestroyed()) return null

    const input = (payload ?? {}) as { message?: unknown; detail?: unknown; buttons?: unknown; defaultId?: unknown; cancelId?: unknown }
    const message = typeof input.message === 'string' ? input.message.slice(0, 1000) : ''
    const detail = typeof input.detail === 'string' ? input.detail.slice(0, 2000) : undefined
    const buttons = Array.isArray(input.buttons)
      ? input.buttons.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4).map(item => item.slice(0, 40))
      : []
    if (!message || buttons.length < 2) return null

    const pick = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < buttons.length ? value : fallback

    const result = await guardNativeDialog(() => dialog.showMessageBox(w, {
      type: 'question',
      message,
      detail,
      buttons,
      defaultId: pick(input.defaultId, 0),
      cancelId: pick(input.cancelId, buttons.length - 1),
      /* noLink 关掉 Windows 的"命令链接"样式：那是给"下一步做什么"设计的，
         选项一多就会撑成一列大卡片，而这里只是普通的三选一。 */
      noLink: true
    }))
    return result.response
  })

  ipcMain.handle('set-auto-start', (event, enabled: unknown) => {
    // 会写注册表，来源必须校验
    if (!assertSender(event)) return false
    app.setLoginItemSettings({
      openAtLogin: enabled === true,
      path: app.getPath('exe'),
      // 是否真正隐藏由主进程按 startMinimizedToTray 设置判断
      args: ['--hidden']
    })
    return true
  })

  ipcMain.handle('get-auto-start', (event) => {
    if (!assertSender(event)) return false
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('classify-paths', async (event, filePaths: unknown) => {
    if (!assertSender(event)) return []
    const safePaths = Array.isArray(filePaths)
      ? filePaths.filter((filePath): filePath is string => typeof filePath === 'string').slice(0, 200)
      : []
    return Promise.all(safePaths.map(async (filePath) => {
      try {
        const stat = await fs.promises.stat(filePath)
        return {
          path: filePath,
          exists: true,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          extension: path.extname(filePath).toLowerCase()
        }
      } catch {
        return {
          path: filePath,
          exists: false,
          isFile: false,
          isDirectory: false,
          extension: path.extname(filePath).toLowerCase()
        }
      }
    }))
  })

  ipcMain.handle('validate-apps', async (event, apps: unknown) => {
    if (!assertSender(event)) return []
    const safeApps = Array.isArray(apps)
      ? apps.filter((item): item is { id?: unknown; path?: unknown; type?: unknown } => typeof item === 'object' && item !== null).slice(0, 5000)
      : []

    // 原实现对最多 5000 个应用逐个同步 fs.existsSync，会长时间阻塞主进程事件循环。
    // 改为 fs.promises.access 异步判断，并按 32 个一批 Promise.all 并发；返回数组顺序
    // 与输入严格一致（每批内部顺序不变、批次按序 push），返回结构 {id,path,exists} 不变。
    //
    // ⚠️ 按类型分流的理由见 `main/appTargetCheck.ts`：不是所有类型的 `path`
    // 都能拿去 fs.access，一律查盘会把网址、商店应用、笔记全判成"失效"。
    const BATCH_SIZE = 32
    const results: Array<{ id: string; path: string; exists: boolean }> = []
    for (let i = 0; i < safeApps.length; i += BATCH_SIZE) {
      const batch = safeApps.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const id = typeof item.id === 'string' ? item.id : ''
          const itemPath = typeof item.path === 'string' ? item.path : ''
          const type = typeof item.type === 'string' ? item.type : ''
          let exists: boolean
          const verdict = classifyAppTarget(itemPath, type)
          if (verdict === 'valid') {
            exists = true
          } else if (verdict === 'invalid') {
            exists = false
          } else {
            try {
              await fs.promises.access(itemPath)
              exists = true
            } catch {
              exists = false
            }
          }
          return { id, path: itemPath, exists }
        })
      )
      results.push(...batchResults)
    }
    return results
  })

  ipcMain.handle('export-backup', async (event) => {
    if (!assertSender(event)) return { success: false, error: '调用来源不被信任。' }
    const options = {
      title: 'Export backup',
      defaultPath: `tidy-desktop-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const owner = mainWindowRef.current
    const result = await guardNativeDialog(() => owner && !owner.isDestroyed()
      ? dialog.showSaveDialog(owner, options)
      : dialog.showSaveDialog(options))
    if (result.canceled || !result.filePath) return { success: false }

    // 写盘可能失败（目标只读、磁盘满、被占用）。以前这里没有 try/catch，
    // 异常会以 rejection 的形式抛回渲染层，而渲染层只 await 不 catch —— 变成静默失败。
    try {
      const payload = {
        version: app.getVersion(),
        exportedAt: new Date().toISOString(),
        config: readJsonFile<Config>(CONFIG_FILE, {} as Config),
        apps: readJsonFile<AppsData>(APPS_FILE, { apps: [] }),
        categories: readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [], subcategories: [] }),
        collections: readJsonFile<CollectionsData>(COLLECTIONS_FILE, { collections: [] })
      }
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('import-backup', async (event) => {
    if (!assertSender(event)) return { success: false, error: '调用来源不被信任。' }
    const options = {
      title: 'Import backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    } as Electron.OpenDialogOptions
    const owner = mainWindowRef.current
    const result = await guardNativeDialog(() => owner && !owner.isDestroyed()
      ? dialog.showOpenDialog(owner, options)
      : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) return { success: false }

    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
      const payload: unknown = JSON.parse(raw)
      if (!payload || typeof payload !== 'object') {
        return { success: false, error: '该文件不是有效的备份文件。' }
      }
      const backup = payload as { config?: unknown; apps?: unknown; categories?: unknown; collections?: unknown }
      const nextConfig = backup.config ? sanitizeConfig(backup.config, getDefaultConfig()) : null
      const nextApps = backup.apps ? sanitizeAppsData(backup.apps) : null
      const nextCategories = backup.categories ? sanitizeCategoriesData(backup.categories) : null
      const nextCollections = backup.collections ? sanitizeCollectionsData(backup.collections) : null
      if (backup.config && !nextConfig) return { success: false, error: '备份中的配置数据格式不合法。' }
      if (backup.apps && !nextApps) return { success: false, error: '备份中的应用数据格式不合法。' }
      if (backup.categories && !nextCategories) return { success: false, error: '备份中的分类数据格式不合法。' }
      if (backup.collections && !nextCollections) return { success: false, error: '备份中的收纳格数据格式不合法。' }
      const entries = [
        ...(nextConfig ? [{ filePath: CONFIG_FILE, data: nextConfig }] : []),
        ...(nextApps ? [{ filePath: APPS_FILE, data: nextApps }] : []),
        ...(nextCategories ? [{ filePath: CATEGORIES_FILE, data: nextCategories }] : []),
        ...(nextCollections ? [{ filePath: COLLECTIONS_FILE, data: nextCollections }] : [])
      ]
      if (!writeJsonFilesAtomically(entries)) {
        return { success: false, error: '备份无法安全写入磁盘，当前数据未被修改。' }
      }
      return { success: true, filePath: result.filePaths[0] }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('export-diagnostics', async (event) => {
    if (!assertSender(event)) return { success: false, error: '调用来源不被信任。' }
    try {
      const options = {
        title: 'Export diagnostics',
        defaultPath: `tidy-desktop-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const owner = mainWindowRef.current
      const result = await guardNativeDialog(() => owner && !owner.isDestroyed()
        ? dialog.showSaveDialog(owner, options)
        : dialog.showSaveDialog(options))
      if (result.canceled || !result.filePath) return { success: false }

      const iconFiles = fs.existsSync(ICONS_DIR)
        ? fs.readdirSync(ICONS_DIR).map((file) => {
          const filePath = path.join(ICONS_DIR, file)
          const stat = fs.statSync(filePath)
          return { file, size: stat.size, modifiedAt: stat.mtime.toISOString() }
        })
        : []
      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node,
        dataDirectory: CONFIG_DIR,
        files: {
          configExists: fs.existsSync(CONFIG_FILE),
          appsExists: fs.existsSync(APPS_FILE),
          categoriesExists: fs.existsSync(CATEGORIES_FILE),
          collectionsExists: fs.existsSync(COLLECTIONS_FILE),
          iconCount: iconFiles.length,
          iconBytes: iconFiles.reduce((sum, item) => sum + item.size, 0)
        },
        config: readJsonFile<Config>(CONFIG_FILE, {} as Config),
        apps: readJsonFile<AppsData>(APPS_FILE, { apps: [] }),
        categories: readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [], subcategories: [] }),
        collections: readJsonFile<CollectionsData>(COLLECTIONS_FILE, { collections: [] }),
        iconFiles
      }
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('scan-shortcuts', async (event) => {
    if (!assertSender(event)) return []
    if (shortcutScanCache && Date.now() - shortcutScanCache.createdAt < SHORTCUT_CACHE_MS) {
      return shortcutScanCache.items
    }

    const seenRoots = new Set<string>()
    const seenFiles = new Set<string>()
    const files: Array<{ file: string; source: ShortcutImportItem['source'] }> = []
    for (const root of getShortcutRoots()) {
      const rootKey = path.resolve(root.path).toLowerCase()
      if (seenRoots.has(rootKey)) continue
      seenRoots.add(rootKey)
      for (const file of collectShortcutFiles(root.path, SHORTCUT_SCAN_LIMIT)) {
        const fileKey = file.toLowerCase()
        if (seenFiles.has(fileKey)) continue
        seenFiles.add(fileKey)
        files.push({ file, source: root.source })
        if (files.length >= SHORTCUT_SCAN_LIMIT) break
      }
      if (files.length >= SHORTCUT_SCAN_LIMIT) break
    }

    const results: ShortcutImportItem[] = []
    for (let index = 0; index < files.length && results.length < SHORTCUT_RESULT_LIMIT; index++) {
      const entry = files[index]
      const item = createShortcutImportItem(entry.file, entry.source)
      if (item) results.push(item)
      if (index > 0 && index % 25 === 0) await new Promise<void>(resolve => setImmediate(resolve))
    }

    const uniqueTargets = new Set<string>()
    const lnkResults = results
      .filter(item => {
        const key = item.targetPath.toLowerCase()
        if (uniqueTargets.has(key)) return false
        uniqueTargets.add(key)
        return true
      })
      .slice(0, SHORTCUT_RESULT_LIMIT)

    /* Appx 结果附在 .lnk 结果之后：与 .lnk 重复的跳过、单独限量、
       扫描失败时静默降级（导入流程照常给出 .lnk 的结果）。规则见 mergeAppxResults。 */
    const merged = mergeAppxResults(lnkResults, await getAppxEntries(), APPX_RESULT_LIMIT)
      .slice(0, SHORTCUT_MERGED_LIMIT)
    shortcutScanCache = { createdAt: Date.now(), items: merged }
    return merged
  })

  ipcMain.handle('resolve-shortcut-targets', (event, values: unknown) => {
    if (!assertSender(event)) return []
    if (!Array.isArray(values)) return []
    return values
      .filter((value): value is string => typeof value === 'string' && value.toLowerCase().endsWith('.lnk'))
      .slice(0, SHORTCUT_RESULT_LIMIT)
      .map(filePath => ({ filePath, targetPath: resolveShortcutTarget(filePath) }))
      .filter(item => !!item.targetPath)
  })

  ipcMain.handle('open-data-directory', async (event) => {
    if (!assertSender(event)) return false
    const error = await shell.openPath(CONFIG_DIR)
    return !error
  })

  ipcMain.handle('open-backups-directory', async (event) => {
    if (!assertSender(event)) return false
    // 备份目录可配（P2-7）：跟实际写备份时用的是同一个解析函数，避免"打开的目录"和"备份落地的目录"不一致
    const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    const backupDir = resolveBackupDir(CONFIG_DIR, config.backupDir)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const error = await shell.openPath(backupDir)
    return !error
  })

  ipcMain.handle('copy-text-to-clipboard', (event, text: unknown) => {
    if (!assertSender(event)) return false
    if (typeof text !== 'string' || text.length === 0 || text.length > 8192) return false
    clipboard.writeText(text)
    return true
  })

  ipcMain.handle('clear-icon-cache', async (event) => {
    if (!assertSender(event)) return { success: false, count: 0 }
    let count = 0
    if (fs.existsSync(ICONS_DIR)) {
      for (const file of fs.readdirSync(ICONS_DIR)) {
        const filePath = path.join(ICONS_DIR, file)
        try {
          const ext = path.extname(file).toLowerCase()
          /* 之前只清 .png / .ico，但 Steam 图标是按 `steam_<appId>.jpg` 缓存的
             （见 iconHandlers 的 CDN 兜底分支），那些 jpg 永远不会被「刷新全部图标」清掉，
             只能一直堆在 icons 目录里。这里把 .jpg / .jpeg 一并纳入。 */
          if (fs.statSync(filePath).isFile() && ['.png', '.ico', '.jpg', '.jpeg'].includes(ext)) {
            fs.unlinkSync(filePath)
            count++
          }
        } catch { /* ignore */ }
      }
    }
    return { success: true, count }
  })

  ipcMain.handle('start-drag-file', async (event, filePath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(filePath)
    if (!safePath) return false

    let icon = nativeImage.createEmpty()
    try {
      const fileIcon = await app.getFileIcon(safePath, { size: 'normal' })
      if (fileIcon && !fileIcon.isEmpty()) {
        icon = fileIcon
      }
    } catch { /* ignore */ }

    event.sender.startDrag({
      file: safePath,
      icon
    })
    return true
  })
}
