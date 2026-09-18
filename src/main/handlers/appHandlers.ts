import { ipcMain, shell, dialog, clipboard, nativeImage } from 'electron'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { guardNativeDialog } from '../dialogGuard'
import { LAUNCHABLE_EXTENSIONS, assertPath, assertSender } from '../ipcGuard'

/** 安全地将 PowerShell 命令编码为 Base64，避免注入 */
function encodePsCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Windows 剪贴板的"文件拖放列表"格式名 */
const CF_HDROP = 'CF_HDROP'

/**
 * 构造 CF_HDROP 需要的 DROPFILES 结构：
 *   DWORD pFiles(20) + POINT pt(8) + BOOL fNC(4) + BOOL fWide(4)
 * 后面紧跟 UTF-16LE 的路径列表，各路径以 \0 结尾，整体再补一个 \0 收尾。
 */
function buildFileDropBuffer(filePaths: string[]): Buffer {
  const HEADER_SIZE = 20
  const list = Buffer.from(filePaths.join('\0') + '\0\0', 'utf16le')
  const buffer = Buffer.alloc(HEADER_SIZE + list.length)
  buffer.writeUInt32LE(HEADER_SIZE, 0) // pFiles：文件名列表相对结构体的偏移
  buffer.writeInt32LE(0, 4)            // pt.x
  buffer.writeInt32LE(0, 8)            // pt.y
  buffer.writeUInt32LE(0, 12)          // fNC
  buffer.writeUInt32LE(1, 16)          // fWide：Unicode 路径
  list.copy(buffer, HEADER_SIZE)
  return buffer
}

/**
 * 确认剪贴板里确实存在"文件拖放"格式。
 * Windows 上 Chromium 可能把它登记成 CF_HDROP，也可能规范化成 FileNameW——
 * 只认前者会把成功误判成失败，每次都退回慢速的外部命令，等于白优化。
 */
function hasFileDropFormat(): boolean {
  return clipboard.availableFormats().some(f => /^(cf_hdrop|filenamew)$/i.test(f))
}

/** 原生写 CF_HDROP 失败时的兜底：异步跑 PowerShell，不用 execFileSync 阻塞主进程 */
function copyFileViaPowerShell(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $dropList = New-Object System.Collections.Specialized.StringCollection; $dropList.Add('${filePath.replace(/'/g, "''")}') | Out-Null; [System.Windows.Forms.Clipboard]::SetFileDropList($dropList)`
    execFile(
      'powershell',
      ['-NoProfile', '-EncodedCommand', encodePsCommand(psScript)],
      { windowsHide: true, timeout: 5000 },
      (error) => {
        if (error) {
          console.error('PowerShell clipboard fallback failed:', error)
          resolve(false)
          return
        }
        resolve(true)
      }
    )
  })
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
  ipcMain.handle('open-app', async (event, appPath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(appPath, { extensions: LAUNCHABLE_EXTENSIONS })
    if (!safePath) return false
    const error = await shell.openPath(safePath)
    if (error) {
      console.error('Failed to open app:', error)
      return false
    }
    return true
  })

  ipcMain.handle('show-item-in-folder', async (event, appPath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(appPath)
    if (!safePath) return false
    try {
      shell.showItemInFolder(safePath)
      return true
    } catch (error) {
      console.error('Failed to show item in folder:', error)
      return false
    }
  })

  ipcMain.handle('open-containing-folder', async (event, appPath: unknown) => {
    // 允许路径不存在：调用方会在目标消失时退回到打开其父目录
    const safePath = assertPath(appPath, { mustExist: false })
    if (!assertSender(event) || !safePath) return false
    try {
      if (fs.existsSync(safePath)) {
        const stat = fs.statSync(safePath)
        const folderPath = stat.isDirectory() ? safePath : path.dirname(safePath)
        const error = await shell.openPath(folderPath)
        return !error
      }
      const folderPath = path.dirname(safePath)
      const error = await shell.openPath(folderPath)
      return !error
    } catch (error) {
      console.error('Failed to open containing folder:', error)
      return false
    }
  })

  ipcMain.handle('open-app-as-admin', async (event, appPath: unknown) => {
    // 这是全项目权限最高的入口（会弹 UAC 提权执行），白名单收紧到可执行文件
    if (!assertSender(event)) return false
    const safePath = assertPath(appPath, { extensions: LAUNCHABLE_EXTENSIONS })
    if (!safePath) {
      console.warn('Rejected admin launch for non-launchable path:', appPath)
      return false
    }
    try {
      const escapedPath = safePath.replace(/'/g, "''")
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

  ipcMain.handle('open-folder', async (event, folderPath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(folderPath)
    if (!safePath) return false
    const error = await shell.openPath(safePath)
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
      const result = await guardNativeDialog(() => dialog.showOpenDialog({
        properties: ['openDirectory']
      }))
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    } catch (error) {
      console.error('Failed to select folder:', error)
      return null
    }
  })

  ipcMain.handle('run-quick-action', async (event, command: unknown) => {
    // 这个入口能关机/重启/锁屏，来源必须校验
    if (!assertSender(event)) return false
    try {
      if (command === 'shutdown' || command === 'restart') {
        const actionLabel = command === 'shutdown' ? '关机' : '重启'
        const result = await guardNativeDialog(() => dialog.showMessageBox({
          type: 'warning',
          buttons: ['取消', `确认${actionLabel}`],
          defaultId: 0,
          cancelId: 0,
          message: `确定要立即${actionLabel}电脑吗？`,
          detail: '未保存的工作可能会丢失。'
        }))
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

  ipcMain.handle('copy-file-to-clipboard', async (event, filePath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(filePath)
    if (!safePath) return false
    try {
      // 直接写 Windows 的 CF_HDROP：不用起 PowerShell，主进程也不会被阻塞。
      // 以前走 execFileSync 拉起 powershell，冷启动几百毫秒且会卡住整个界面。
      clipboard.writeBuffer(CF_HDROP, buildFileDropBuffer([safePath]))
      if (hasFileDropFormat()) return true
      return await copyFileViaPowerShell(safePath)
    } catch (error) {
      console.error('Failed to copy file to clipboard:', error)
      return false
    }
  })

  ipcMain.handle('copy-image-to-clipboard', async (event, filePath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(filePath)
    if (!safePath) return false
    try {
      const image = nativeImage.createFromPath(safePath)
      if (!image.isEmpty()) {
        clipboard.writeImage(image)
        return true
      }
      // 解码不了的矢量图（SVG 等）退化为复制文件本身，至少还能粘贴出去
      clipboard.writeBuffer(CF_HDROP, buildFileDropBuffer([safePath]))
      return hasFileDropFormat()
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error)
      return false
    }
  })
}
