import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen } from 'electron'
import path from 'path'
import { ensureDataDir, readJsonFile, getDefaultConfig, CONFIG_FILE } from './config'
import { registerAppHandlers } from './handlers/appHandlers'
import { registerFileHandlers } from './handlers/fileHandlers'
import { registerIconHandlers } from './handlers/iconHandlers'
import { registerSystemHandlers, setWindowRefs } from './handlers/systemHandlers'
import { registerUpdateHandlers } from './update'

const isDev = !app.isPackaged

const mainWindowRef: { current: BrowserWindow | null } = { current: null }
const searchWindowRef: { current: BrowserWindow | null } = { current: null }
let trayRef: Tray | null = null

function getAppIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '../../../build/icon-256.png'))
}

function createWindow() {
  const config = readJsonFile(CONFIG_FILE, getDefaultConfig())

  const win = new BrowserWindow({
    width: config.windowSize?.width ?? 1050,
    height: config.windowSize?.height ?? 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: true,
    resizable: true,
    title: 'tidy_desktop',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.setMenu(null)
  win.setMenuBarVisibility(false)

  // 拦截 Windows 系统菜单消息（Alt / Alt+Space）
  const WM_SYSCOMMAND = 0x0112
  const SC_KEYMENU = 0xF100
  win.hookWindowMessage(WM_SYSCOMMAND, (wParam: Buffer) => {
    const cmd = wParam.readUInt16LE(0) & 0xFFF0
    if (cmd === SC_KEYMENU) return true
    return false
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    mainWindowRef.current = null
  })

  mainWindowRef.current = win
}

function toggleSearchWindow() {
  const sw = searchWindowRef.current
  if (sw && !sw.isDestroyed()) {
    if (sw.isVisible()) {
      sw.hide()
    } else {
      sw.show()
      sw.focus()
      sw.webContents.send('reset-search')
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

  const win = new BrowserWindow({
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
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/search.html')
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/search.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.on('blur', () => {
    const blurredWin = win
    let cancelled = false
    const cancelHandler = () => { cancelled = true }
    blurredWin.once('focus', cancelHandler)
    setTimeout(() => {
      // Guard against the window being destroyed during the timeout
      if (blurredWin.isDestroyed()) return
      blurredWin.removeListener('focus', cancelHandler)
      if (!cancelled && !blurredWin.isFocused()) {
        blurredWin.webContents.send('blur-event')
      }
    }, 200)
  })

  win.on('closed', () => {
    searchWindowRef.current = null
  })

  searchWindowRef.current = win
}

function createTray() {
  const tray = new Tray(getAppIcon())
  trayRef = tray

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        const w = mainWindowRef.current
        if (w) { w.show(); w.focus() }
      }
    },
    {
      label: '快速搜索',
      click: () => { toggleSearchWindow() }
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
    const w = mainWindowRef.current
    if (w) { w.show(); w.focus() }
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

  const mainRegistered = globalShortcut.register(hotkey, () => {
    const w = mainWindowRef.current
    if (w) {
      if (w.isVisible()) {
        w.hide()
      } else {
        w.show()
        w.focus()
      }
    }
  })
  if (!mainRegistered) {
    console.warn(`Failed to register main window hotkey: ${hotkey}`)
  }

  const searchRegistered = globalShortcut.register(searchHotkey, () => {
    toggleSearchWindow()
  })
  if (!searchRegistered) {
    console.warn(`Failed to register search hotkey: ${searchHotkey}`)
  }
}

app.on('ready', () => {
  Menu.setApplicationMenu(null)
  ensureDataDir()

  // Set up window refs for system handlers before registration
  setWindowRefs(mainWindowRef, searchWindowRef)

  // Register all IPC handlers
  registerAppHandlers()
  registerFileHandlers()
  registerIconHandlers()
  registerSystemHandlers()
  registerUpdateHandlers()

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
  if (mainWindowRef.current === null) {
    createWindow()
  } else {
    const w = mainWindowRef.current
    w.show()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  trayRef?.destroy()
  trayRef = null
})
