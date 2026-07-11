import { ipcMain, shell, dialog } from 'electron'
import { execFile, execFileSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

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

  ipcMain.handle('show-item-in-folder', async (_, appPath: string) => {
    try {
      if (!fs.existsSync(appPath)) return false
      shell.showItemInFolder(appPath)
      return true
    } catch (error) {
      console.error('Failed to show item in folder:', error)
      return false
    }
  })

  ipcMain.handle('open-containing-folder', async (_, appPath: string) => {
    try {
      if (!appPath) return false
      if (fs.existsSync(appPath)) {
        const stat = fs.statSync(appPath)
        const folderPath = stat.isDirectory() ? appPath : path.dirname(appPath)
        const error = await shell.openPath(folderPath)
        return !error
      }
      const folderPath = path.dirname(appPath)
      const error = await shell.openPath(folderPath)
      return !error
    } catch (error) {
      console.error('Failed to open containing folder:', error)
      return false
    }
  })

  ipcMain.handle('open-app-as-admin', async (_, appPath: string) => {
    try {
      if (!fs.existsSync(appPath)) return false
      const escapedPath = appPath.replace(/'/g, "''")
      execFile('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Start-Process -FilePath '${escapedPath}' -Verb RunAs`
      ], { windowsHide: true })
      return true
    } catch (error) {
      console.error('Failed to open app as admin:', error)
      return false
    }
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

  ipcMain.handle('run-quick-action', async (_, command: string) => {
    try {
      if (command === 'shutdown' || command === 'restart') {
        const actionLabel = command === 'shutdown' ? '关机' : '重启'
        const result = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['取消', `确认${actionLabel}`],
          defaultId: 0,
          cancelId: 0,
          message: `确定要立即${actionLabel}电脑吗？`,
          detail: '未保存的工作可能会丢失。'
        })
        if (result.response !== 1) return false
      }
      switch (command) {
        case 'shutdown':
          spawn('shutdown.exe', ['/s', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'restart':
          spawn('shutdown.exe', ['/r', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'lock':
          execFile('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true })
          return true
        case 'settings':
          await shell.openExternal('ms-settings:')
          return true
        case 'calculator':
          spawn('calc.exe', [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'notepad':
          spawn('notepad.exe', [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'clipboard':
          execFile('explorer.exe', ['ms-clipboard:'], { windowsHide: true })
          return true
        default:
          return false
      }
    } catch (error) {
      console.error('Failed to run quick action:', error)
      return false
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
