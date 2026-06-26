import { ipcMain, BrowserWindow, dialog, screen, app, nativeImage } from 'electron'
import fs from 'fs'
import path from 'path'

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
