import { ipcMain, BrowserWindow, dialog, screen, app, nativeImage, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { APPS_FILE, CATEGORIES_FILE, CONFIG_FILE, CONFIG_DIR, ICONS_DIR, getDefaultConfig, readJsonFile, writeJsonFilesAtomically } from '../config'
import type { AppsData, CategoriesData, Config, ShortcutImportItem } from '../../shared/types'
import { sanitizeAppsData, sanitizeCategoriesData, sanitizeConfig } from '../validation'

let mainWindowRef: { current: BrowserWindow | null } = { current: null }
let searchWindowRef: { current: BrowserWindow | null } = { current: null }
let shortcutScanCache: { createdAt: number; items: ShortcutImportItem[] } | null = null

const SHORTCUT_SCAN_LIMIT = 500
const SHORTCUT_RESULT_LIMIT = 300
const SHORTCUT_CACHE_MS = 60_000

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
    return {
      name: path.basename(filePath, path.extname(filePath)),
      path: filePath,
      targetPath,
      icon: '',
      type,
      source
    }
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

export function registerSystemHandlers() {
  ipcMain.handle('hide-main-window', () => {
    const w = mainWindowRef.current
    if (w && !w.isDestroyed()) {
      w.hide()
    }
  })

  ipcMain.handle('hide-search-window', () => {
    const w = searchWindowRef.current
    if (w && !w.isDestroyed()) {
      w.hide()
    }
  })

  ipcMain.handle('resize-search-window', (_, height: unknown) => {
    const w = searchWindowRef.current
    if (w && !w.isDestroyed()) {
      // Clamp height: min 60px, max 80% of primary display height
      const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
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

  ipcMain.handle('move-search-window-to-cursor-display', () => {
    const w = searchWindowRef.current
    if (!w || w.isDestroyed()) return false
    const point = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(point)
    const bounds = w.getBounds()
    w.setBounds({
      x: Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2),
      y: Math.round(display.workArea.y + display.workArea.height * 0.3),
      width: bounds.width,
      height: bounds.height
    })
    return true
  })

  ipcMain.handle('confirm', async (_, message: unknown) => {
    const w = mainWindowRef.current
    if (!w || w.isDestroyed()) return false
    const result = await dialog.showMessageBox(w, {
      type: 'question',
      buttons: ['取消', '确定'],
      defaultId: 0,
      cancelId: 0,
      message: typeof message === 'string' ? message.slice(0, 1000) : ''
    })
    return result.response === 1
  })

  ipcMain.handle('set-auto-start', (_, enabled: unknown) => {
    app.setLoginItemSettings({
      openAtLogin: enabled === true,
      path: app.getPath('exe')
    })
    return true
  })

  ipcMain.handle('get-auto-start', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('classify-paths', async (_, filePaths: unknown) => {
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

  ipcMain.handle('validate-apps', async (_, apps: unknown) => {
    const safeApps = Array.isArray(apps)
      ? apps.filter((item): item is { id?: unknown; path?: unknown; type?: unknown } => typeof item === 'object' && item !== null).slice(0, 5000)
      : []
    return safeApps.map((item) => {
      const id = typeof item.id === 'string' ? item.id : ''
      const itemPath = typeof item.path === 'string' ? item.path : ''
      const type = typeof item.type === 'string' ? item.type : ''
      const exists = type === 'steam'
        ? /^steam:\/\//i.test(itemPath)
        : !!itemPath && fs.existsSync(itemPath)
      return { id, path: itemPath, exists }
    })
  })

  ipcMain.handle('export-backup', async () => {
    const options = {
      title: 'Export backup',
      defaultPath: `tidy-desktop-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const owner = mainWindowRef.current
    const result = owner && !owner.isDestroyed()
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { success: false }

    const payload = {
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      config: readJsonFile<Config>(CONFIG_FILE, {} as Config),
      apps: readJsonFile<AppsData>(APPS_FILE, { apps: [] }),
      categories: readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [], subcategories: [] })
    }
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { success: true, filePath: result.filePath }
  })

  ipcMain.handle('import-backup', async () => {
    const options = {
      title: 'Import backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    } as Electron.OpenDialogOptions
    const owner = mainWindowRef.current
    const result = owner && !owner.isDestroyed()
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { success: false }

    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
      const payload: unknown = JSON.parse(raw)
      if (!payload || typeof payload !== 'object') {
        return { success: false, error: 'Invalid backup format' }
      }
      const backup = payload as { config?: unknown; apps?: unknown; categories?: unknown }
      const nextConfig = backup.config ? sanitizeConfig(backup.config, getDefaultConfig()) : null
      const nextApps = backup.apps ? sanitizeAppsData(backup.apps) : null
      const nextCategories = backup.categories ? sanitizeCategoriesData(backup.categories) : null
      if (backup.config && !nextConfig) return { success: false, error: 'Invalid config data' }
      if (backup.apps && !nextApps) return { success: false, error: 'Invalid apps data' }
      if (backup.categories && !nextCategories) return { success: false, error: 'Invalid categories data' }
      const entries = [
        ...(nextConfig ? [{ filePath: CONFIG_FILE, data: nextConfig }] : []),
        ...(nextApps ? [{ filePath: APPS_FILE, data: nextApps }] : []),
        ...(nextCategories ? [{ filePath: CATEGORIES_FILE, data: nextCategories }] : [])
      ]
      if (!writeJsonFilesAtomically(entries)) {
        return { success: false, error: 'Backup could not be written safely' }
      }
      return { success: true, filePath: result.filePaths[0] }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('export-diagnostics', async () => {
    try {
      const options = {
        title: 'Export diagnostics',
        defaultPath: `tidy-desktop-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const owner = mainWindowRef.current
      const result = owner && !owner.isDestroyed()
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options)
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
          iconCount: iconFiles.length,
          iconBytes: iconFiles.reduce((sum, item) => sum + item.size, 0)
        },
        config: readJsonFile<Config>(CONFIG_FILE, {} as Config),
        apps: readJsonFile<AppsData>(APPS_FILE, { apps: [] }),
        categories: readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [], subcategories: [] }),
        iconFiles
      }
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('scan-shortcuts', async () => {
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
    const uniqueResults = results
      .filter(item => {
        const key = item.targetPath.toLowerCase()
        if (uniqueTargets.has(key)) return false
        uniqueTargets.add(key)
        return true
      })
      .slice(0, SHORTCUT_RESULT_LIMIT)
    shortcutScanCache = { createdAt: Date.now(), items: uniqueResults }
    return uniqueResults
  })

  ipcMain.handle('resolve-shortcut-targets', (_, values: unknown) => {
    if (!Array.isArray(values)) return []
    return values
      .filter((value): value is string => typeof value === 'string' && value.toLowerCase().endsWith('.lnk'))
      .slice(0, SHORTCUT_RESULT_LIMIT)
      .map(filePath => ({ filePath, targetPath: resolveShortcutTarget(filePath) }))
      .filter(item => !!item.targetPath)
  })

  ipcMain.handle('open-data-directory', async () => {
    const error = await shell.openPath(CONFIG_DIR)
    return !error
  })

  ipcMain.handle('clear-icon-cache', async () => {
    let count = 0
    if (fs.existsSync(ICONS_DIR)) {
      for (const file of fs.readdirSync(ICONS_DIR)) {
        const filePath = path.join(ICONS_DIR, file)
        try {
          const ext = path.extname(file).toLowerCase()
          if (fs.statSync(filePath).isFile() && ['.png', '.ico'].includes(ext)) {
            fs.unlinkSync(filePath)
            count++
          }
        } catch { /* ignore */ }
      }
    }
    return { success: true, count }
  })

  ipcMain.handle('open-update-log', async () => {
    const logPath = path.join(app.getPath('temp'), 'tidy-desktop-install.log')
    if (!fs.existsSync(logPath)) return false
    const error = await shell.openPath(logPath)
    return !error
  })

  ipcMain.handle('start-drag-file', async (event, filePath: unknown) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    if (!senderWin || senderWin.isDestroyed()) return false
    if (typeof filePath !== 'string') return false
    if (!fs.existsSync(filePath)) return false

    let icon = nativeImage.createEmpty()
    try {
      const fileIcon = await app.getFileIcon(filePath, { size: 'normal' })
      if (fileIcon && !fileIcon.isEmpty()) {
        icon = fileIcon
      }
    } catch { /* ignore */ }

    event.sender.startDrag({
      file: filePath,
      icon
    })
    return true
  })
}
