import { ipcMain, shell, dialog } from 'electron'
import { execFileSync } from 'child_process'

/** 安全地将 PowerShell 命令编码为 Base64，避免注入 */
function encodePsCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function isSafeWebUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isSafeSteamUrl(steamUrl: string): boolean {
  return /^steam:\/\/(?:launch\/\d+(?:\/\d+)?|rungameid\/\d+)$/i.test(steamUrl)
}

export function registerAppHandlers() {
  ipcMain.handle('open-app', async (_, appPath: string) => {
    const error = await shell.openPath(appPath)
    if (error) {
      console.error('Failed to open app:', error)
      return false
    }
    return true
  })

  ipcMain.handle('open-folder', async (_, folderPath: string) => {
    const error = await shell.openPath(folderPath)
    if (error) {
      console.error('Failed to open folder:', error)
      return false
    }
    return true
  })

  ipcMain.handle('open-url', async (_, url: string) => {
    try {
      if (!isSafeWebUrl(url)) {
        console.warn('Rejected unsafe URL:', url)
        return false
      }
      await shell.openExternal(url)
      return true
    } catch (error) {
      console.error('Failed to open URL:', error)
      return false
    }
  })

  ipcMain.handle('open-steam', async (_, steamUrl: string) => {
    try {
      if (!isSafeSteamUrl(steamUrl)) {
        console.warn('Rejected unsafe Steam URL:', steamUrl)
        return false
      }
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
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $dropList = New-Object System.Collections.Specialized.StringCollection; $dropList.Add('${filePath.replace(/'/g, "''")}') | Out-Null; [System.Windows.Forms.Clipboard]::SetFileDropList($dropList)`
      execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encodePsCommand(psScript)], { windowsHide: true, timeout: 5000 })
      return true
    } catch (error) {
      console.error('Failed to copy file to clipboard:', error)
      return false
    }
  })

  ipcMain.handle('copy-image-to-clipboard', async (_, filePath: string) => {
    try {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${filePath.replace(/'/g, "''")}'); $bmp = New-Object System.Drawing.Bitmap($img); [System.Windows.Forms.Clipboard]::SetImage($bmp); $bmp.Dispose(); $img.Dispose()`
      execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encodePsCommand(psScript)], { windowsHide: true, timeout: 10000 })
      return true
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error)
      return false
    }
  })
}
