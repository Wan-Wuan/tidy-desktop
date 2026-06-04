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
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
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
    searchWindow.loadFile(path.join(__dirname, '../../renderer/search.html'))
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
  // Tray icon: embedded 16x16 PNG (blue rounded rectangle with white grid)
  const trayIconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAACoklEQVR4nD2Sy4scVRSHz617b1dVT0/XONMOMS8MDDOoiCYQFFwIrnQjZB0IJCS4UMSN2+BSsvF/yCZk4SILH7gYUHCRxziZwCQ6icFopjvd1enuetyquq9zpBPN4XA2vw8O5/Ax+L+ElEvLPSQgAkSaNwHNJ2o1I3TPMRYEASKe/+LLU2fO8XC5qGBa4iQzs1yXpS7KRqlqOh7+eePbv25eZYwJRDz9yWdff3NpfwppAQyArLbSGKG10EY0VoSdlztvf3zR2ebx7WuMMXZl89Ybx98qs4ZZAKxKH1lNjfaNQWusc+6X28OsYaOH279eviDCKBJRN1PBWLXfXco7UUNRByAmIk66thCHIptmw4Kp8QrnLQEAjZG1YVWxmy5u/LDX3ej0T4Tfp/L9gT26JOtuLMaT4vp9HwsJjAmAlqr7gyfXh2n95oEjzcyX6POwNgvVOPfhSxi2A291qZyM5hcKAlKN2BtuAyVP8hu43rMq2b3/6dJadeToQI6CVvW0JrHansWsRgoCQpfOwtcPf7Qq1hf5CZ4bpw3B0JlKW0HEjHVrh7one4/GT2cEbL6hFeDZ905u/fzj1r39JF4dqLwvqup3p7dM7RoDrc8/7O0vr313d18EKBBp586DC/+M66xeWMkQsgDmPzXWWNPUSgGwr/qP0klRZSNEL4ho+26/d4An7ZirwSSv+2mxdjiRnCYz1W3zrKi2dwuPkI3+RkQB3qDJex167ZVA8tBRtHmrOLgiO23RSziXolvKjfVVg/yna38Y9AKJ8oebe8mrd+6NyNtQsiRZ2HmQam2cadLRlDHiPGAi0qMdAGLwTJ/FYx+0D72DTDjrGfg4loSoVIUeibw3lU13XPobAGMv9J6LKxcYANKcmWf8v5RcDYTPsX8BjqupiIu8dEkAAAAASUVORK5CYII='
  const icon = nativeImage.createFromDataURL('data:image/png;base64,' + trayIconBase64)
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
  const defaults = getDefaultConfig()
  const config = readJsonFile(CONFIG_FILE, defaults)
  // 向后兼容：确保所有新字段都有默认值
  if (!config.searchEngines) {
    config.searchEngines = defaults.searchEngines
  } else {
    for (const [key, val] of Object.entries(defaults.searchEngines)) {
      if (!config.searchEngines[key]) {
        config.searchEngines[key] = val
      }
    }
  }
  if (!config.windowSize) config.windowSize = defaults.windowSize
  if (!config.hotkey) config.hotkey = defaults.hotkey
  if (!config.searchHotkey) config.searchHotkey = defaults.searchHotkey
  if (!config.ui) config.ui = defaults.ui
  if (config.autoStart === undefined) config.autoStart = defaults.autoStart
  if (!config.defaultEngine) config.defaultEngine = defaults.defaultEngine
  return config
})

ipcMain.handle('save-config', (_, config) => {
  const success = writeJsonFile(CONFIG_FILE, config)
  if (success) {
    registerGlobalShortcut()
  }
  return success
})

ipcMain.handle('get-apps', () => {
  const data = readJsonFile(APPS_FILE, { apps: [] })
  // 向后兼容：确保每个应用都有必需字段
  data.apps = (data.apps || []).map((app: any) => ({
    id: app.id || '',
    name: app.name || '',
    path: app.path || '',
    icon: app.icon || '',
    categoryId: app.categoryId || '',
    subcategoryId: app.subcategoryId || null,
    pinyin: app.pinyin || '',
    firstLetter: app.firstLetter || '',
    type: app.type || 'app'
  }))
  return data
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

ipcMain.handle('extract-steam-icon', async (_, steamUrl: string) => {
  try {
    // Extract AppID from steam:// URL
    const match = steamUrl.match(/steam:\/\/(?:launch|rungameid)\/(\d+)/)
    if (!match) return null
    const appId = match[1]

    // Common Steam install paths
    const steamPaths = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'E:\\Steam'
    ]

    for (const steamPath of steamPaths) {
      const cacheDir = path.join(steamPath, 'appcache', 'librarycache')
      if (!fs.existsSync(cacheDir)) continue

      // Try different icon filenames
      const iconFiles = [
        `${appId}_icon.jpg`,
        `${appId}_library_600x900.jpg`,
        `${appId}_header.jpg`,
        `${appId}_capsule_231x87.jpg`
      ]

      for (const iconFile of iconFiles) {
        const iconPath = path.join(cacheDir, iconFile)
        if (fs.existsSync(iconPath)) {
          const data = fs.readFileSync(iconPath)
          if (data.length > 500) {
            const ext = path.extname(iconFile).toLowerCase()
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
            return `data:${mime};base64,${data.toString('base64')}`
          }
        }
      }
    }

    // Try reading from Steam's config to find library folders
    try {
      for (const steamPath of steamPaths) {
        const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
        if (fs.existsSync(libraryFoldersPath)) {
          const vdf = fs.readFileSync(libraryFoldersPath, 'utf-8')
          const libMatches = vdf.matchAll(/"path"\s+"([^"]+)"/g)
          for (const libMatch of libMatches) {
            const libPath = libMatch[1].replace(/\\\\/g, '\\')
            const cacheDir = path.join(libPath, 'appcache', 'librarycache')
            if (!fs.existsSync(cacheDir)) continue
            for (const iconFile of [`${appId}_icon.jpg`, `${appId}_library_600x900.jpg`]) {
              const iconPath = path.join(cacheDir, iconFile)
              if (fs.existsSync(iconPath)) {
                const data = fs.readFileSync(iconPath)
                if (data.length > 500) {
                  return `data:image/jpeg;base64,${data.toString('base64')}`
                }
              }
            }
          }
        }
      }
    } catch {}

    // Fallback: download icon from Steam CDN
    try {
      const iconUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
      const response = await fetch(iconUrl)
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length > 1000) {
          const cachedPath = path.join(ICONS_DIR, `steam_${appId}.jpg`)
          try { fs.writeFileSync(cachedPath, buffer) } catch {}
          return `data:image/jpeg;base64,${buffer.toString('base64')}`
        }
      }
    } catch {}

    return null
  } catch (error) {
    console.error('Failed to extract Steam icon:', error)
    return null
  }
})

ipcMain.handle('get-steam-game-name', async (_, steamUrl: string) => {
  try {
    const match = steamUrl.match(/steam:\/\/(?:launch|rungameid)\/(\d+)/)
    if (!match) return null
    const appId = match[1]

    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`)
    if (!response.ok) return null

    const data = await response.json() as Record<string, any>
    if (data[appId]?.success && data[appId]?.data?.name) {
      return data[appId].data.name
    }
    return null
  } catch (error) {
    console.error('Failed to get Steam game name:', error)
    return null
  }
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

