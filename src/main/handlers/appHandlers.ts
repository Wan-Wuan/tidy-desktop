import { ipcMain, shell, dialog } from 'electron'
import { execSync, exec } from 'child_process'

export function registerAppHandlers() {
  ipcMain.handle('open-app', async (_, appPath: string) => {
    return new Promise((resolve) => {
      let resolved = false
      const child = exec(`"${appPath}"`, { windowsHide: true }, (error) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        if (error) {
          console.error('Failed to open app:', error)
          resolve(false)
        } else {
          resolve(true)
        }
      })
      const timer = setTimeout(() => {
        if (resolved) return
        resolved = true
        if (!child.killed) {
          child.kill()
        }
        resolve(true)
      }, 5000)
    })
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

  ipcMain.handle('copy-file-to-clipboard', async (_, filePath: string) => {
    try {
      const escapedPath = filePath.replace(/'/g, "''")
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $dropList = New-Object System.Collections.Specialized.StringCollection; $dropList.Add('${escapedPath}') | Out-Null; [System.Windows.Forms.Clipboard]::SetFileDropList($dropList)`
      execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, { windowsHide: true, timeout: 5000 })
      return true
    } catch (error) {
      console.error('Failed to copy file to clipboard:', error)
      return false
    }
  })

  ipcMain.handle('copy-image-to-clipboard', async (_, filePath: string) => {
    try {
      const escapedPath = filePath.replace(/'/g, "''")
      const psScript = `Add-Type -AssemblyName System.Windows.Forms -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${escapedPath}'); $bmp = New-Object System.Drawing.Bitmap($img); [System.Windows.Forms.Clipboard]::SetImage($bmp); $bmp.Dispose(); $img.Dispose()`
      execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, { windowsHide: true, timeout: 10000 })
      return true
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error)
      return false
    }
  })
}
