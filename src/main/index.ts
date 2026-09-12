import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, dialog, shell, ipcMain, Notification } from 'electron'
import path from 'path'
import type { Config, UiCommand } from '../shared/types'
import { ensureDataDir, readJsonFile, writeJsonFile, getDefaultConfig, CONFIG_DIR, CONFIG_FILE, APPS_FILE, CATEGORIES_FILE } from './config'
import { getBackupDir, runStartupBackup } from './backup'
import { registerAppHandlers } from './handlers/appHandlers'
import { registerFileHandlers } from './handlers/fileHandlers'
import { registerIconHandlers } from './handlers/iconHandlers'
import { registerSystemHandlers, setWindowRefs } from './handlers/systemHandlers'
import { cleanupInstalledUpdateCache, registerUpdateHandlers } from './update'
import { isNativeDialogOpen, guardNativeDialog } from './dialogGuard'

const isDev = !app.isPackaged

const mainWindowRef: { current: BrowserWindow | null } = { current: null }
const searchWindowRef: { current: BrowserWindow | null } = { current: null }
let trayRef: Tray | null = null
let singleInstancePromptOpen = false
let searchWindowShouldShow = false
let shortcutRetryTimer: NodeJS.Timeout | null = null
const pendingSearchReveal = new WeakSet<BrowserWindow>()
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const SEARCH_WINDOW_DEFAULT_WIDTH = 600
const SEARCH_WINDOW_EMPTY_HEIGHT = 100

function getSearchWindowLayout(): { width: number; verticalRatio: number } {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const width = Math.min(900, Math.max(380, Math.round(config.ui?.searchWidth || SEARCH_WINDOW_DEFAULT_WIDTH)))
  const verticalRatio = Math.min(0.8, Math.max(0.1, config.ui?.searchVerticalRatio || 0.3))
  return { width, verticalRatio }
}
const SHORTCUT_RETRY_DELAY_MS = 1200

// 各主题的标题栏覆盖层配色（按钮底色随应用主题，保持视觉一体）
function titleBarOverlayFor(config: Config) {
  const theme = config?.ui?.theme || 'aurora'
  const dark = theme === 'dark' || theme === 'glass' ||
    (theme === 'system' && require('electron').nativeTheme.shouldUseDarkColors)
  return dark
    ? { color: '#0C0F0E', symbolColor: '#E5E7EB', height: 36 }
    : { color: '#F5F2EA', symbolColor: '#1F2937', height: 36 }
}

function getAppIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '../../../build/icon-256.png'))
}

/** 第一次把窗口关到托盘时给一条系统通知，避免用户以为程序已经退出 */
function notifyTrayOnce() {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  if (config.trayNotified) return
  writeJsonFile(CONFIG_FILE, { ...config, trayNotified: true })
  try {
    const notification = new Notification({
      title: 'Tidy Desktop 仍在运行',
      body: '窗口已最小化到系统托盘，双击托盘图标可重新打开。',
      icon: getAppIcon()
    })
    notification.on('click', () => showMainWindow())
    notification.show()
  } catch (error) {
    console.error('Failed to show tray notification:', error)
  }
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
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const maxWidth = Math.max(520, workArea.width - 32)
  const maxHeight = Math.max(400, workArea.height - 32)
  const width = Math.min(config.windowSize?.width ?? 1050, maxWidth)
  const height = Math.min(config.windowSize?.height ?? 800, maxHeight)
  // 记住的窗口位置 clamp 到当前工作区，防止显示器变更后窗口跑出屏幕
  const savedPosition = config.windowPosition
  const x = savedPosition
    ? Math.min(Math.max(savedPosition.x, workArea.x), Math.max(workArea.x, workArea.x + workArea.width - width))
    : null
  const y = savedPosition
    ? Math.min(Math.max(savedPosition.y, workArea.y), Math.max(workArea.y, workArea.y + workArea.height - height))
    : null

  const win = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(600, maxWidth),
    minHeight: Math.min(400, maxHeight),
    center: x === null || y === null,
    x: x ?? undefined,
    y: y ?? undefined,
    show: false,
    // 隐藏原生标题条：窗口内容顶到边缘，右上角保留系统最小化/最大化/关闭按钮
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlayFor(config),
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

  let windowSizeSaveTimer: NodeJS.Timeout | null = null
  const persistWindowSize = () => {
    if (win.isDestroyed()) return
    const [currentWidth, currentHeight] = win.getSize()
    const [currentX, currentY] = win.getPosition()
    const latestConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    writeJsonFile(CONFIG_FILE, {
      ...latestConfig,
      windowSize: { width: currentWidth, height: currentHeight },
      windowPosition: { x: currentX, y: currentY }
    })
  }

  const schedulePersist = () => {
    if (windowSizeSaveTimer) clearTimeout(windowSizeSaveTimer)
    windowSizeSaveTimer = setTimeout(() => {
      windowSizeSaveTimer = null
      persistWindowSize()
    }, 300)
  }

  win.on('resize', schedulePersist)
  win.on('move', schedulePersist)

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
    // 启动最小化到托盘：设置开启时不弹窗，仅驻留托盘
    if (config.startMinimizedToTray === true) {
      notifyTrayOnce()
      return
    }
    win.show()
  })

  win.on('close', (event) => {
    if ((app as any).isQuitting) return
    const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    if (config.closeAction === 'quit') return
    event.preventDefault()
    win.hide()
    notifyTrayOnce()
  })

  win.on('blur', () => {
    const blurredWin = win
    let cancelled = false
    const cancelHandler = () => { cancelled = true }
    blurredWin.once('focus', cancelHandler)
    setTimeout(() => {
      // 防止窗口在延时期间被销毁
      if (blurredWin.isDestroyed()) return
      blurredWin.removeListener('focus', cancelHandler)
      if (cancelled || blurredWin.isFocused()) return
      const latestConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
      if (latestConfig.mainAutoHideOnBlur !== true) return
      // 原生对话框（打开/保存文件等）会夺走焦点，此时不能隐藏主窗口
      if (isNativeDialogOpen()) return
      // 本应用其它窗口（如快速搜索框）仍处于焦点时不隐藏
      if (BrowserWindow.getFocusedWindow() !== null) return
      blurredWin.hide()
    }, 200)
  })

  win.on('closed', () => {
    if (windowSizeSaveTimer) {
      clearTimeout(windowSizeSaveTimer)
      windowSizeSaveTimer = null
    }
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
    guardNativeDialog(() => dialog.showMessageBox(w, {
      type: 'info',
      buttons: ['知道了'],
      defaultId: 0,
      message: 'Tidy Desktop 已经在运行',
      detail: '不能同时打开多个实例，已为你切换到正在运行的窗口。'
    })).finally(() => {
      singleInstancePromptOpen = false
    })
  }
}

function toggleSearchWindow() {
  const sw = searchWindowRef.current
  if (sw && !sw.isDestroyed()) {
    if (sw.isVisible() || searchWindowShouldShow) {
      searchWindowShouldShow = false
      sw.hide()
    } else {
      searchWindowShouldShow = true
      showSearchWindow(sw)
    }
    return
  }
  searchWindowShouldShow = true
  createSearchWindow(true)
}

function showSearchWindow(win: BrowserWindow) {
  if (win.isDestroyed() || !searchWindowShouldShow) return

  const reveal = () => {
    pendingSearchReveal.delete(win)
    if (win.isDestroyed() || !searchWindowShouldShow) return
    moveSearchWindowToCursorDisplay(win)
    win.show()
    win.focus()
    win.webContents.send('reset-search')
  }

  if (win.webContents.isLoading()) {
    if (pendingSearchReveal.has(win)) return
    pendingSearchReveal.add(win)
    win.webContents.once('did-finish-load', reveal)
  } else {
    reveal()
  }
}

function createSearchWindow(showOnReady = true) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, verticalRatio } = getSearchWindowLayout()
  const height = SEARCH_WINDOW_EMPTY_HEIGHT
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + display.workArea.height * verticalRatio)

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
    // 关闭系统方角圆整：透明窗口由内容自绘 26px 圆角，系统圆整会在四角留下方角伪影
    roundedCorners: false,
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
    if (showOnReady && searchWindowShouldShow) {
      showSearchWindow(win)
    }
  })

  win.on('show', () => {
    searchWindowShouldShow = true
  })

  win.on('hide', () => {
    searchWindowShouldShow = false
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
        // 失焦自动隐藏：在主进程读取配置并直接隐藏，避免渲染层时序问题
        const latestConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
        if (latestConfig.searchAutoHideOnBlur === true) {
          blurredWin.hide()
          return
        }
        blurredWin.webContents.send('blur-event')
      }
    }, 200)
  })

  win.on('closed', () => {
    pendingSearchReveal.delete(win)
    searchWindowShouldShow = false
    searchWindowRef.current = null
  })

  searchWindowRef.current = win
}

function prewarmSearchWindow() {
  if (searchWindowRef.current && !searchWindowRef.current.isDestroyed()) return
  createSearchWindow(false)
}

function registerUiCommandHandler() {
  const allowedCommands = new Set<UiCommand>([
    'open-organizer',
    'health-check',
    'refresh-icons',
    'auto-categorize',
    'import-shortcuts',
    'restore-hidden',
    'export-backup'
  ])

  ipcMain.handle('run-ui-command', async (_, command: unknown) => {
    if (typeof command !== 'string' || !allowedCommands.has(command as UiCommand)) return false

    showMainWindow()
    const target = mainWindowRef.current
    if (!target || target.isDestroyed()) return false

    const sendCommand = () => {
      if (!target.isDestroyed()) {
        target.webContents.send('ui-command', command)
      }
    }

    if (target.webContents.isLoading()) {
      target.webContents.once('did-finish-load', sendCommand)
    } else {
      sendCommand()
    }
    return true
  })
}

function moveSearchWindowToCursorDisplay(win: BrowserWindow) {
  if (win.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, verticalRatio } = getSearchWindowLayout()
  win.setBounds({
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + display.workArea.height * verticalRatio),
    width,
    height: win.getBounds().height
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

  tray.on('click', () => {
    showMainWindow()
  })

  tray.on('double-click', () => {
    showMainWindow()
  })
}

function bindGlobalShortcuts(config: Pick<Config, 'hotkey' | 'searchHotkey'>): boolean {
  const hotkey = config.hotkey || 'Alt+Space'
  const searchHotkey = config.searchHotkey || 'Ctrl+K'
  globalShortcut.unregisterAll()

  if (hotkey.toLowerCase() === searchHotkey.toLowerCase()) return false

  try {
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
    const searchRegistered = mainRegistered && globalShortcut.register(searchHotkey, () => {
      toggleSearchWindow()
    })
    if (mainRegistered && searchRegistered) return true
  } catch (error) {
    console.error('Failed to register global shortcuts:', error)
  }

  globalShortcut.unregisterAll()
  return false
}

function applyGlobalShortcuts(nextConfig: Config): boolean {
  if (shortcutRetryTimer) {
    clearTimeout(shortcutRetryTimer)
    shortcutRetryTimer = null
  }
  const previousConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  if (bindGlobalShortcuts(nextConfig)) return true

  bindGlobalShortcuts(previousConfig)
  return false
}

function registerGlobalShortcut() {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  if (bindGlobalShortcuts(config)) return

  console.warn('Initial global shortcut registration failed; retrying after startup settles')
  shortcutRetryTimer = setTimeout(() => {
    shortcutRetryTimer = null
    const latestConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    if (bindGlobalShortcuts(latestConfig)) return

    const defaults = getDefaultConfig()
    if (!bindGlobalShortcuts(defaults)) {
      console.error('Failed to register configured and default global shortcuts')
    }
  }, SHORTCUT_RETRY_DELAY_MS)
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
  app.setAppUserModelId('com.tidy-desktop.app')
  runStartupBackup({
    files: [CONFIG_FILE, APPS_FILE, CATEGORIES_FILE],
    backupDir: getBackupDir(CONFIG_DIR)
  })

  // Set up window refs for system handlers before registration
  setWindowRefs(mainWindowRef, searchWindowRef)

  // Register all IPC handlers
  registerAppHandlers()
  registerFileHandlers(applyGlobalShortcuts)
  registerIconHandlers()
  registerSystemHandlers()
  registerUiCommandHandler()
  cleanupInstalledUpdateCache()
  registerUpdateHandlers()

  createWindow()
  createTray()
  registerGlobalShortcut()
  setTimeout(prewarmSearchWindow, 350)
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
  if (shortcutRetryTimer) {
    clearTimeout(shortcutRetryTimer)
    shortcutRetryTimer = null
  }
  globalShortcut.unregisterAll()
  trayRef?.destroy()
  trayRef = null
})
