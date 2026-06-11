import { ipcMain, shell, dialog } from 'electron'
import { execSync } from 'child_process'

export function registerAppHandlers() {
  ipcMain.handle('open-app', async (_, appPath: string) => {
    try {
      execSync(`"${appPath}"`, { windowsHide: true, timeout: 5000 })
      return true
    } catch (error) {
      console.error('Failed to open app:', error)
      return false
    }
  })

  ipcMain.handle('open-folder', async (_, folderPath: string) => {
    try {
      await shell.openPath(folderPath)
      return true
    } catch (error) {
      console.error('Failed to open folder:', error)
      return false
    }
  })

  ipcMain.handle('open-url', async (_, url: string) => {
    try {
      await shell.openExternal(url)
      return true
    } catch (error) {
      console.error('Failed to open URL:', error)
      return false
    }
  })

  ipcMain.handle('open-steam', async (_, steamUrl: string) => {
    try {
      await shell.openExternal(steamUrl)
      return true
    } catch (error) {
      console.error('Failed to open Steam URL:', error)
      return false
    }
  })

  ipcMain.handle('select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    } catch (error) {
      console.error('Failed to select folder:', error)
      return null
    }
  })
}
