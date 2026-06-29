import { ipcMain, BrowserWindow, dialog, screen, app, nativeImage, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { APPS_FILE, CATEGORIES_FILE, CONFIG_FILE, ICONS_DIR, readJsonFile, writeJsonFile } from '../config'
import type { AppsData, CategoriesData, Config } from '../../shared/types'

let mainWindowRef: { current: BrowserWindow | null } = { current: null }
let searchWindowRef: { current: BrowserWindow | null } = { current: null }

export function setWindowRefs(main: { current: BrowserWindow | null }, search: { current: BrowserWindow | null }) {
  mainWindowRef = main
  searchWindowRef = search
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
