import { ipcMain, BrowserWindow, dialog, screen, app, nativeImage, shell } from 'electron'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { APPS_FILE, CATEGORIES_FILE, CONFIG_FILE, CONFIG_DIR, ICONS_DIR, readJsonFile, writeJsonFile } from '../config'
import type { AppsData, CategoriesData, Config, ShortcutImportItem } from '../../shared/types'

let mainWindowRef: { current: BrowserWindow | null } = { current: null }
let searchWindowRef: { current: BrowserWindow | null } = { current: null }

export function setWindowRefs(main: { current: BrowserWindow | null }, search: { current: BrowserWindow | null }) {
  mainWindowRef = main
  searchWindowRef = search
}

function escapePsString(value: string): string {
  return value.replace(/'/g, "''")
}

function expandWindowsEnvPath(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name: string) => {
    return process.env[name] || process.env[name.toUpperCase()] || process.env[name.toLowerCase()] || `%${name}%`
  })
}

function resolveShortcutTarget(filePath: string): string {
  try {
    const escapedPath = escapePsString(filePath)
    const result = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut('${escapedPath}'); [Console]::OutputEncoding=[Text.Encoding]::UTF8; $s.TargetPath`
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 2500 }
    ).trim()
    return expandWindowsEnvPath(result)
  } catch {
    return ''
  }
}

async function createShortcutImportItem(filePath: string, source: ShortcutImportItem['source']): Promise<ShortcutImportItem | null> {
  const targetPath = resolveShortcutTarget(filePath)
  if (!targetPath || !fs.existsSync(targetPath)) return null
  const stat = fs.statSync(targetPath)
  const type = stat.isDirectory() ? 'folder' : 'app'
  let icon = ''
  try {
    const fileIcon = await app.getFileIcon(filePath, { size: 'large' })
    const png = fileIcon.toPNG()
    if (png.length > 100) icon = `data:image/png;base64,${png.toString('base64')}`
  } catch { /* ignore */ }
  return {
    name: path.basename(filePath, path.extname(filePath)),
    path: filePath,
    targetPath,
    icon,
    type,
    source
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

  ipcMain.handle('resize-search-window', (_, height: number) => {
    const w = searchWindowRef.current
    if (w && !w.isDestroyed()) {
      // Clamp height: min 60px, max 80% of primary display height
      const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
      const maxHeight = Math.round(screenHeight * 0.8)
      const finalHeight = Math.min(Math.max(60, height), maxHeight)
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

  ipcMain.handle('confirm', async (_, message: string) => {
    const w = mainWindowRef.current
    if (!w || w.isDestroyed()) return false
    const result = await dialog.showMessageBox(w, {
      type: 'question',
      buttons: ['取消', '确定'],
      defaultId: 0,
      cancelId: 0,
      message
    })
    return result.response === 1
  })

  ipcMain.handle('set-auto-start', (_, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.getPath('exe')
    })
    return true
  })

  ipcMain.handle('get-auto-start', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('classify-paths', async (_, filePaths: string[]) => {
    return Promise.all((filePaths || []).map(async (filePath) => {
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

  ipcMain.handle('validate-apps', async (_, apps: { id: string; path: string; type?: string }[]) => {
    return (apps || []).map((item) => {
      const exists = item.type === 'steam'
        ? /^steam:\/\//i.test(item.path)
        : fs.existsSync(item.path)
      return { id: item.id, path: item.path, exists }
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

    const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
    const payload = JSON.parse(raw)
    if (payload.config) writeJsonFile(CONFIG_FILE, payload.config)
    if (payload.apps) writeJsonFile(APPS_FILE, payload.apps)
    if (payload.categories) writeJsonFile(CATEGORIES_FILE, payload.categories)
    return { success: true, filePath: result.filePaths[0] }
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
    const seen = new Set<string>()
    const files = getShortcutRoots().flatMap(root => collectShortcutFiles(root.path).map(file => ({ file, source: root.source })))
    const uniqueFiles = files.filter(item => {
      const key = item.file.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const results = await Promise.all(uniqueFiles.map(item => createShortcutImportItem(item.file, item.source)))
    const uniqueTargets = new Set<string>()
    return results
      .filter((item): item is ShortcutImportItem => !!item)
      .filter(item => {
        const key = item.targetPath.toLowerCase()
        if (uniqueTargets.has(key)) return false
        uniqueTargets.add(key)
        return true
      })
      .slice(0, 300)
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

  ipcMain.handle('start-drag-file', async (event, filePath: string) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    if (!senderWin || senderWin.isDestroyed()) return false
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
