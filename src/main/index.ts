import { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, shell, screen, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let searchWindow: BrowserWindow | null = null
let tray: Tray | null = null

const CONFIG_DIR = path.join(app.getPath('userData'), 'data')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const APPS_FILE = path.join(CONFIG_DIR, 'apps.json')
const CATEGORIES_FILE = path.join(CONFIG_DIR, 'categories.json')
const ICONS_DIR = path.join(CONFIG_DIR, 'icons')

function ensureDataDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true })
  }
  // Clean up small cached icons (< 1KB = likely broken)
  try {
    const files = fs.readdirSync(ICONS_DIR)
    for (const file of files) {
      const filePath = path.join(ICONS_DIR, file)
      const stat = fs.statSync(filePath)
      if (stat.size < 1024) {
        fs.unlinkSync(filePath)
      }
    }
  } catch {}
}

function readJsonFile(filePath: string, defaultValue: any) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
  }
  return defaultValue
}

function writeJsonFile(filePath: string, data: any) {
  try {
    ensureDataDir()
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
    return false
  }
}

function getDefaultConfig() {
  return {
    hotkey: 'Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1050, height: 800 },
    searchEngines: {
      b: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
      g: { name: 'Google', url: 'https://www.google.com/search?q=' },
      bd: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
      yh: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
      ddg: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
      gh: { name: 'GitHub', url: 'https://github.com/search?q=' },
      so: { name: 'StackOverflow', url: 'https://stackoverflow.com/search?q=' },
      zhihu: { name: '知乎', url: 'https://www.zhihu.com/search?q=' },
      bilibili: { name: 'B站', url: 'https://search.bilibili.com/all?keyword=' }
    },
    autoStart: false,
    ui: {
      gridColumns: 6,
      cardSize: 'medium' as const,
      showIcon: true,
      showName: true,
      borderRadius: 8
    },
    defaultEngine: 'b'
  }
}

function createWindow() {
  const config = readJsonFile(CONFIG_FILE, getDefaultConfig())

  mainWindow = new BrowserWindow({
    width: config.windowSize.width,
    height: config.windowSize.height,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: true,
    resizable: true,
    autoHideMenuBar: true,
    title: 'tidy_desktop',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function toggleSearchWindow() {
  if (searchWindow && !searchWindow.isDestroyed()) {
    if (searchWindow.isVisible()) {
      searchWindow.hide()
    } else {
      searchWindow.show()
      searchWindow.focus()
      searchWindow.webContents.send('reset-search')
    }
    return
  }

  createSearchWindow()
}

function createSearchWindow() {
  const display = screen.getPrimaryDisplay()
  const width = 600
  const height = 60
  const x = Math.round((display.workAreaSize.width - width) / 2)
  const y = Math.round(display.workAreaSize.height * 0.3)

  searchWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev) {
    searchWindow.loadURL('http://localhost:5173/search.html')
  } else {
    searchWindow.loadFile(path.join(__dirname, '../renderer/search.html'))
  }

  searchWindow.once('ready-to-show', () => {
    searchWindow?.show()
    searchWindow?.focus()
  })

  searchWindow.on('blur', () => {
    setTimeout(() => {
      if (searchWindow && !searchWindow.isDestroyed() && !searchWindow.isFocused()) {
        searchWindow.webContents.send('blur-event')
      }
    }, 200)
  })

  searchWindow.on('closed', () => {
    searchWindow = null
  })
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: '快速搜索',
      click: () => {
        toggleSearchWindow()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('tidy_desktop')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerGlobalShortcut() {
  const config = readJsonFile(CONFIG_FILE, {
    hotkey: 'Alt+Space',
    searchHotkey: 'Ctrl+K'
  })
  const hotkey = config.hotkey || 'Alt+Space'
  const searchHotkey = config.searchHotkey || 'Ctrl+K'

  globalShortcut.unregisterAll()

  globalShortcut.register(hotkey, () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  globalShortcut.register(searchHotkey, () => {
    toggleSearchWindow()
  })
}

app.on('ready', () => {
  ensureDataDir()
  createWindow()
  createTray()
  registerGlobalShortcut()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    mainWindow.show()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

ipcMain.handle('get-config', () => {
  return readJsonFile(CONFIG_FILE, getDefaultConfig())
})

ipcMain.handle('save-config', (_, config) => {
  const success = writeJsonFile(CONFIG_FILE, config)
  if (success) {
    registerGlobalShortcut()
  }
  return success
})

ipcMain.handle('get-apps', () => {
  return readJsonFile(APPS_FILE, { apps: [] })
})

ipcMain.handle('save-apps', (_, data) => {
  return writeJsonFile(APPS_FILE, data)
})

ipcMain.handle('get-categories', () => {
  const data = readJsonFile(CATEGORIES_FILE, {
    categories: []
  })
  if (!data.subcategories) data.subcategories = []
  return data
})

ipcMain.handle('save-categories', (_, data) => {
  return writeJsonFile(CATEGORIES_FILE, data)
})

ipcMain.handle('open-app', async (_, appPath: string) => {
  try {
    exec(`"${appPath}"`)
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

ipcMain.handle('hide-search-window', () => {
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.hide()
  }
})

ipcMain.handle('resize-search-window', (_, height: number) => {
  if (searchWindow && !searchWindow.isDestroyed()) {
    const width = 600
    const finalHeight = Math.max(60, height)
    const display = screen.getPrimaryDisplay()
    const bounds = searchWindow.getBounds()
    const newY = Math.round((display.workAreaSize.height * 0.3))
    searchWindow.setBounds({
      x: Math.round((display.workAreaSize.width - width) / 2),
      y: newY,
      width: width,
      height: finalHeight
    })
  }
})

ipcMain.handle('hide-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
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

ipcMain.handle('confirm', async (_, message: string) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['取消', '确定'],
    defaultId: 0,
    cancelId: 0,
    message
  })
  return result.response === 1
})

ipcMain.handle('extract-icon', async (_, filePath: string) => {
  try {
    const hash = Buffer.from(filePath).toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
    const iconPath = path.join(ICONS_DIR, `${hash}.png`)

    if (fs.existsSync(iconPath)) {
      const data = fs.readFileSync(iconPath)
      return `data:image/png;base64,${data.toString('base64')}`
    }

    let targetPath = filePath
    if (filePath.toLowerCase().endsWith('.lnk')) {
      try {
        const result = require('child_process').execSync(
          `powershell -NoProfile -Command "$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut('${filePath.replace(/'/g, "''")}'); $s.TargetPath"`,
          { encoding: 'utf8', windowsHide: true, timeout: 3000 }
        ).trim()
        if (result && fs.existsSync(result)) {
          targetPath = result
        }
      } catch {}
    }

    const icon = await app.getFileIcon(targetPath, { size: 'large' })
    const pngData = icon.toPNG()
    if (pngData.length > 500) {
      fs.writeFileSync(iconPath, pngData)
      return `data:image/png;base64,${pngData.toString('base64')}`
    }

    try {
      const psResult = require('child_process').execSync(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${targetPath.replace(/'/g, "''")}'); if($icon){$bmp=$icon.ToBitmap(); $ms=New-Object System.IO.MemoryStream; $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($ms.ToArray())}"`,
        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
      ).trim()
      if (psResult && psResult.length > 100) {
        const buf = Buffer.from(psResult, 'base64')
        fs.writeFileSync(iconPath, buf)
        return `data:image/png;base64,${psResult}`
      }
    } catch {}

    if (pngData.length > 0) {
      fs.writeFileSync(iconPath, pngData)
      return `data:image/png;base64,${pngData.toString('base64')}`
    }

    return null
  } catch (error) {
    console.error('Failed to extract icon:', error)
    return null
  }
})
