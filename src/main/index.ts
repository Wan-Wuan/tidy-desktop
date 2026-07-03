import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, dialog, shell } from 'electron'
import path from 'path'
import { ensureDataDir, readJsonFile, getDefaultConfig, CONFIG_FILE } from './config'
import { registerAppHandlers } from './handlers/appHandlers'
import { registerFileHandlers } from './handlers/fileHandlers'
import { registerIconHandlers } from './handlers/iconHandlers'
import { registerSystemHandlers, setWindowRefs } from './handlers/systemHandlers'
import { cleanupInstalledUpdateCache, registerUpdateHandlers } from './update'

const isDev = !app.isPackaged

const mainWindowRef: { current: BrowserWindow | null } = { current: null }
const searchWindowRef: { current: BrowserWindow | null } = { current: null }
let trayRef: Tray | null = null
let singleInstancePromptOpen = false
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const SEARCH_WINDOW_WIDTH = 600
const SEARCH_WINDOW_EMPTY_HEIGHT = 100

function getAppIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '../../../build/icon-256.png'))
}

function isAllowedInternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (isDev) {
      return url.origin === 'http://localhost:5173'
    }
    return url.protocol === 'file:'
  } catch {
    return false
  }
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function attachWindowSecurity(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((error) => {
        console.error('Failed to open external URL:', error)
      })
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInternalUrl(url)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch((error) => {
        console.error('Failed to open external URL:', error)
      })
    }
  })
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
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  attachWindowSecurity(win)

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

function showMainWindow(showRunningPrompt = false) {
  const w = mainWindowRef.current
  if (!w || w.isDestroyed()) {
    createWindow()
    return
  }

  if (w.isMinimized()) {
    w.restore()
  }
  w.show()
  w.focus()

  if (showRunningPrompt && !singleInstancePromptOpen) {
    singleInstancePromptOpen = true
    dialog.showMessageBox(w, {
      type: 'info',
      buttons: ['知道了'],
      defaultId: 0,
      message: 'Tidy Desktop 已经在运行',
      detail: '不能同时打开多个实例，已为你切换到正在运行的窗口。'
    }).finally(() => {
      singleInstancePromptOpen = false
    })
  }
}

function toggleSearchWindow() {
  const sw = searchWindowRef.current
  if (sw && !sw.isDestroyed()) {
    if (sw.isVisible()) {
      sw.hide()
    } else {
      showSearchWindow(sw)
    }
    return
  }
  createSearchWindow(true)
}

function showSearchWindow(win: BrowserWindow) {
  if (win.isDestroyed()) return
  moveSearchWindowToCursorDisplay(win)
  win.show()
  win.focus()
  const resetSearch = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('reset-search')
    }
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', resetSearch)
  } else {
    resetSearch()
  }
}

function createSearchWindow(showOnReady = true) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = SEARCH_WINDOW_WIDTH
  const height = SEARCH_WINDOW_EMPTY_HEIGHT
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + display.workArea.height * 0.3)

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
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  attachWindowSecurity(win)

  if (isDev) {
    win.loadURL('http://localhost:5173/search.html')
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/search.html'))
  }

  win.once('ready-to-show', () => {
    if (showOnReady) {
      showSearchWindow(win)
    }
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

function prewarmSearchWindow() {
  if (searchWindowRef.current && !searchWindowRef.current.isDestroyed()) return
  createSearchWindow(false)
}

function moveSearchWindowToCursorDisplay(win: BrowserWindow) {
  if (win.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = win.getBounds()
  win.setBounds({
    x: Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2),
    y: Math.round(display.workArea.y + display.workArea.height * 0.3),
    width: bounds.width,
    height: bounds.height
  })
}

function createTray() {
  const tray = new Tray(getAppIcon())
  trayRef = tray

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        showMainWindow()
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
    showMainWindow()
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
        showMainWindow()
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

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow(true)
  })
}

app.on('ready', () => {
  if (!hasSingleInstanceLock) return

  Menu.setApplicationMenu(null)
  ensureDataDir()

  // Set up window refs for system handlers before registration
  setWindowRefs(mainWindowRef, searchWindowRef)

  // Register all IPC handlers
  registerAppHandlers()
  registerFileHandlers()
  registerIconHandlers()
  registerSystemHandlers()
  cleanupInstalledUpdateCache()
  registerUpdateHandlers()

  createWindow()
  createTray()
  registerGlobalShortcut()
  setTimeout(prewarmSearchWindow, 800)
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
    showMainWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  trayRef?.destroy()
  trayRef = null
})
