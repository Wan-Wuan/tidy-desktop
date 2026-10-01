import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, dialog, shell, ipcMain, Notification } from 'electron'
import fs from 'fs'
import path from 'path'
import type { Config, UiCommand } from '../shared/types'
import type { HotkeyIssue } from '../shared/electron'
import { ALT_SPACE_HOTKEY, getHotkeyCandidates } from '../shared/defaults'
import { ensureDataDir, readJsonFile, writeJsonFile, getDefaultConfig, migrateLegacyHotkeyDefault, migrateLegacySearchHotkeyDefault, CONFIG_DIR, CONFIG_FILE, APPS_FILE, CATEGORIES_FILE, COLLECTIONS_FILE } from './config'
import { KEEP_PER_FILE, resolveBackupDir, runStartupBackup } from './backup'
import { registerAppHandlers } from './handlers/appHandlers'
import { registerFileHandlers } from './handlers/fileHandlers'
import { registerIconHandlers } from './handlers/iconHandlers'
import { registerSystemHandlers, setWindowRefs } from './handlers/systemHandlers'
import { registerUrlMetaHandlers } from './handlers/urlMetaHandlers'
import {
  notifyMainWindowFocused,
  registerFolderSyncHandlers,
  startFolderSyncWatcher
} from './handlers/folderSyncHandlers'
import { registerFileSearchHandlers } from './handlers/fileSearchHandlers'
import { registerAppearanceHandlers } from './handlers/appearanceHandlers'
import { registerPresetHandlers } from './handlers/presetHandlers'
import { cleanupInstalledUpdateCache, registerUpdateHandlers } from './update'
import { parseUpdateAssistantArgs, runUpdateAssistant } from './update/assistant'
import { guardNativeDialog } from './dialogGuard'
import { attachBlurAutoHide } from './blurAutoHide'
import { assertSender } from './ipcGuard'
import { isAllowedInternalUrl, isSafeExternalUrl } from './urlPolicy'

const isDev = !app.isPackaged

/**
 * 安装助手模式：由更新流程派生的临时进程，只负责等主实例退出后跑安装器。
 * 它不建窗口、不注册快捷键，也**不参与单实例锁**——否则在主实例尚未完全退出的
 * 那几百毫秒里会被判成"第二个实例"而直接退出，更新就断了。
 */
const updateAssistantArgs = parseUpdateAssistantArgs(process.argv)

const mainWindowRef: { current: BrowserWindow | null } = { current: null }
const searchWindowRef: { current: BrowserWindow | null } = { current: null }
let trayRef: Tray | null = null
let singleInstancePromptOpen = false
let searchWindowShouldShow = false
let shortcutRetryTimer: NodeJS.Timeout | null = null
const pendingSearchReveal = new WeakSet<BrowserWindow>()
// 助手进程不参与单实例锁：它启动的那一刻主实例往往还在退出中，
// 一旦去抢锁就会被判成"第二个实例"从而退出，更新链路会断在这里。
// 这里直接视为已持有锁，跳过 quit 分支即可（它本来也不会创建窗口）。
const hasSingleInstanceLock = updateAssistantArgs ? true : app.requestSingleInstanceLock()
const SEARCH_WINDOW_DEFAULT_WIDTH = 600
const SEARCH_WINDOW_EMPTY_HEIGHT = 100

function getSearchWindowLayout(): { width: number; verticalRatio: number } {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const width = Math.min(900, Math.max(380, Math.round(config.ui?.searchWidth || SEARCH_WINDOW_DEFAULT_WIDTH)))
  const verticalRatio = Math.min(0.8, Math.max(0.1, config.ui?.searchVerticalRatio || 0.3))
  return { width, verticalRatio }
}
const SHORTCUT_RETRY_DELAY_MS = 1200

/**
 * 应用图标。
 *
 * Windows 的任务栏/托盘只认 .ico：把 PNG 交给 BrowserWindow 时窗口图标不会生效，
 * 任务栏会退回进程默认图标（开发模式即 Electron 内置图标），表现为"应用内图标是新的、
 * 任务栏图标还是 Electron"。因此这里按平台挑候选，逐个校验可读性后再缓存。
 */
let cachedAppIcon: Electron.NativeImage | null = null

function getAppIcon(): Electron.NativeImage {
  if (cachedAppIcon) return cachedAppIcon

  // 首选带版本号的文件名：Windows 任务栏按「图标路径」缓存按钮图标，路径不变时
  // 旧版本留下的错误缓存不会因覆盖安装而失效；每个版本写独立文件可强制重新解码。
  const names = process.platform === 'win32'
    ? [`app-icon-${app.getVersion()}.ico`, 'app-icon.ico', 'icon.ico', 'icon-256.png']
    : ['icon-256.png', 'app-icon.ico']

  // 打包后 extraResources 把 ico 放在 resources/build/（普通文件路径，最稳）；
  // asar 内再留一份兜底，兼容早期只把图标打进 asar 的构建产物。
  const dirs = app.isPackaged
    ? [path.join(process.resourcesPath, 'build'), path.join(__dirname, '../../../build')]
    : [path.join(__dirname, '../../../build')]

  for (const dir of dirs) {
    for (const name of names) {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) continue
      const icon = nativeImage.createFromPath(file)
      if (!icon.isEmpty()) {
        cachedAppIcon = icon
        return icon
      }
    }
  }

  console.warn('[icon] 未找到可用的应用图标，将回退到进程默认图标')
  cachedAppIcon = nativeImage.createEmpty()
  return cachedAppIcon
}

/** 无边框窗口在 Windows 上不会套用构造参数里的 icon，创建后需显式再设置一次 */
function applyAppIcon(win: BrowserWindow) {
  if (process.platform === 'darwin') return
  const icon = getAppIcon()
  if (!icon.isEmpty()) win.setIcon(icon)
}

/**
 * 托盘图标（P2-4）。
 * 用户在设置里指定了图片就用它，否则回退到内置应用图标——
 * 自定义图不存在 / 解码失败（文件被删、格式不支持）一律静默回退，绝不让托盘空掉。
 *
 * Windows 托盘按 16 逻辑像素渲染；这里统一缩到 32×32，兼顾 200% 缩放下的清晰度，
 * 同时避免把一张 4K 图整块交给系统去缩（又慢又糊）。
 */
function getTrayIcon(): Electron.NativeImage {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const custom = config.ui?.trayIcon?.trim()
  if (custom) {
    try {
      if (fs.existsSync(custom)) {
        const image = nativeImage.createFromPath(custom)
        if (!image.isEmpty()) {
          const { width, height } = image.getSize()
          if (width > 32 || height > 32) {
            return image.resize({ width: 32, height: 32, quality: 'best' })
          }
          return image
        }
      }
    } catch {
      /* 落到内置图标 */
    }
  }
  return getAppIcon()
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

// URL 放行策略统一放在 ./urlPolicy：IPC 来源校验（./ipcGuard）也要用同一个定义，
// 放在这里会形成循环依赖
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
    // 完全无边框：无标题栏与系统按钮，拖拽/双击最大化走头部拖拽区，
    // 关闭走 Esc / 托盘菜单 / 任务栏
    frame: false,
    titleBarStyle: 'hidden',
    resizable: true,
    title: 'tidy_desktop',
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // 与主窗口保持一致，见 createWindow 处的说明
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  applyAppIcon(win)

  // 无边框窗口最大化时填充工作区（不遮挡任务栏），还原时回到原尺寸
  let normalBounds: Electron.Rectangle | null = null
  win.on('maximize', () => {
    normalBounds = win.getNormalBounds()
    const display = screen.getDisplayMatching(win.getBounds())
    win.setBounds(display.workArea)
  })
  win.on('unmaximize', () => {
    if (normalBounds) win.setBounds(normalBounds)
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

  /* 关联文件夹同步的第二段触发：窗口回到前台时重扫一次。
     handler 侧有两道闸——先延后约 1.2s 再开始（`win.show()` 之后立刻聚焦，
     那一刻用户正等窗口可用，扫盘不能挤在这时候），再走 30s 最小间隔防抖。
     所以频繁 alt-tab 既不会反复扫盘，也不会拖慢唤出。 */
  win.on('focus', () => {
    notifyMainWindowFocused()
  })

  attachWindowSecurity(win)

  win.setMenu(null)
  win.setMenuBarVisibility(false)

  /* 拦截 Windows 系统菜单消息（Alt 单按 / Alt+Space）。
     无边框窗口没有菜单栏，系统菜单弹出来只是一块无意义的浮层，所以直接吞掉。

     ⚠️ 这段钩子**必须保留**，即使默认热键早已不是 Alt+Space：
     删掉之后按 Alt+Space 会弹出无意义的系统菜单。

     另外它仍承担一层兼容兜底：Alt+Space 在 Windows 上是系统保留组合，
     globalShortcut 拿不到。若用户手动把主热键设成 Alt+Space（迁移标记打上之后
     我们不会再自动改他的选择），窗口聚焦时按下去会既不弹菜单也不开窗口——零反馈。
     因此按 lParam 区分：Alt 单按（lParam = 0）照旧吞掉；Alt+Space（lParam = VK_SPACE）
     在「全局热键没接管」时改成本地执行一次主窗口显隐。
     ⚠️ 钩子依赖窗口消息，**窗口隐藏时收不到**，所以它只是兜底，不能替代全局热键。 */
  const WM_SYSCOMMAND = 0x0112
  const SC_KEYMENU = 0xF100
  const VK_SPACE = 0x20
  win.hookWindowMessage(WM_SYSCOMMAND, (wParam: Buffer, lParam: Buffer) => {
    const cmd = wParam.readUInt16LE(0) & 0xFFF0
    if (cmd !== SC_KEYMENU) return false
    if (lParam.length >= 2 && lParam.readUInt16LE(0) === VK_SPACE) {
      fallbackAltSpaceHotkey()
    }
    return true
  })

  if (isDev) {
    /* 开发期的 DevTools 入口。
       本窗口是无边框 + setApplicationMenu(null)，没有默认菜单，
       所以 Electron 默认的 Ctrl+Shift+I / F12 都不会生效——想在真机验证时
       读渲染层的 [drag-perf] 帧率日志，会发现控制台根本打不开。这里自己绑一次。
       只在开发构建里注册，打包后不带这条路径。 */
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return
      const isF12 = input.key === 'F12'
      const isInspect = input.control && input.shift && input.key.toLowerCase() === 'i'
      if (isF12 || isInspect) win.webContents.toggleDevTools()
    })
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

  /* 失焦自动隐藏：判定顺序与「原生对话框在场就不隐藏」的规则见 blurAutoHide.ts。
     应用自己的界面（设置等模态框、提示框、toast）不拦——藏起来就一起藏，重开时状态还在。
     配置在这里现读——设置面板改完立刻生效，不需要重启或额外同步。 */
  attachBlurAutoHide(win, {
    isEnabled: () => readJsonFile<Config>(CONFIG_FILE, getDefaultConfig()).mainAutoHideOnBlur === true,
    // 本应用其它窗口（如快速搜索框）仍处于焦点时不隐藏
    shouldKeepVisible: () => BrowserWindow.getFocusedWindow() !== null
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
      detail: '不支持同时运行多个实例，已切换至正在运行的窗口。'
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
      // 显式开启渲染进程沙箱：此前只依赖 Electron 的默认值，一旦默认值变化就会被静默降级。
      // preload 只使用 contextBridge/ipcRenderer/webUtils（无任何 Node 模块），因此可以安全开启。
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  applyAppIcon(win)

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

  /* 隐藏时就把搜索窗复位掉，而不是等下次唤出再复位。
     `win.on('hide')` 触发时窗口已经不可见，此刻清空查询/结果、重测高度并同步窗口尺寸
     用户都看不到；下次唤出直接就是"空的、高度正确的"搜索框。
     若改到 `show()` 之后再复位，用户会先看到上一次的结果闪一帧，紧接着窗口高度跳变
     （结果多时窗口高、清空后变矮）。`reset-search` 在唤出时仍会补发一次作为兜底。 */
  win.on('hide', () => {
    searchWindowShouldShow = false
    if (!win.isDestroyed()) win.webContents.send('reset-search')
  })

  /* 快速搜索窗口的失焦隐藏：语义与主窗口略有不同——
     没开自动隐藏时不是「什么都不做」，而是把失焦事件转给渲染层（它自己决定要不要收起）。 */
  attachBlurAutoHide(win, {
    isEnabled: () => readJsonFile<Config>(CONFIG_FILE, getDefaultConfig()).searchAutoHideOnBlur === true,
    onAutoHideDisabled: (target) => target.webContents.send('blur-event')
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

  ipcMain.handle('run-ui-command', async (event, command: unknown) => {
    if (!assertSender(event)) return false
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

  /* 渲染层挂载后补查一次快捷键状态。
     注册失败可能发生在页面加载完成之前，那时事件要么被 did-finish-load 兜住、
     要么根本没送出去；补查是最后一道保险。渲染层按 id 去重，不会重复提示。 */
  ipcMain.handle('get-hotkey-status', (event) => {
    if (!assertSender(event)) return null
    return lastHotkeyIssue
  })

  /* 设置页录制新快捷键时挂起全局热键。
     不挂起的话，用户按下想录的组合会被 globalShortcut 先一步抢走并执行，
     渲染层既收不到按键、界面还会乱跳，录制框看起来像卡死了。 */
  ipcMain.handle('set-shortcut-suspended', (event, suspended: unknown) => {
    if (!assertSender(event)) return false
    if (typeof suspended !== 'boolean') return false
    globalShortcut.setSuspended(suspended)
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
  const tray = new Tray(getTrayIcon())
  trayRef = tray

  /* 暂停状态在托盘上要有可见反馈：tooltip 写明「已暂停」，右键菜单文案相应切换。
     菜单由 buildTrayContextMenu(paused) 生成——它把"暂停/恢复"这一项做成随状态翻转，
     且无论哪种状态都保留"显示主窗口 / 快速搜索 / 退出"三个常驻项。 */
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const paused = config.launchPaused === true
  tray.setToolTip(paused ? 'tidy_desktop（快捷键已暂停）' : 'tidy_desktop')
  tray.setContextMenu(buildTrayContextMenu(paused))

  tray.on('click', () => {
    showMainWindow()
  })

  tray.on('double-click', () => {
    showMainWindow()
  })
}

/**
 * 全局快捷键注册结果。
 *
 * `ok` 的含义是**期望的主热键注册成功**。
 * 降级链救回来的情况算 `ok: false`，但 `effectiveHotkey` 非空——
 * 热键其实是能用的，只是生效的不是期望的那个，必须如实上报而不是当成失败。
 */
type ShortcutBindResult = {
  ok: boolean
  failedKeys: string[]
  /** 实际生效的主热键；null = 没有任何可用的主热键 */
  effectiveHotkey: string | null
  /** 是否用了降级候选（生效值 ≠ 期望值） */
  usedFallback: boolean
}

/** 最近一次注册失败的信息，供渲染层挂载后补查（事件可能在页面加载完成前就发过了）。 */
let lastHotkeyIssue: HotkeyIssue | null = null
let hotkeyIssueSeq = 0

/** 当前真正注册成功的全局快捷键；注册失败时置 null（Alt+Space 兜底要靠它判断）。 */
let activeGlobalShortcuts: { hotkey: string; searchHotkey: string } | null = null

/** 主窗口显隐切换。全局热键回调与 Alt+Space 本地兜底共用同一套语义。 */
function toggleMainWindowVisibility() {
  const w = mainWindowRef.current
  if (!w) return
  if (w.isVisible()) {
    w.hide()
  } else {
    showMainWindow()
  }
}

/**
 * Alt+Space 的本地兜底（WM_SYSCOMMAND / SC_KEYMENU 路径，见 createWindow 里的 hook）。
 *
 * 只在「配置里用的就是 Alt+Space」且「全局热键完全没注册上」时才动作：
 *  · 全局热键已接管时窗口根本收不到这条消息（`activeGlobalShortcuts` 再加一道防御）；
 *  · 用户配的是别的组合时不插手，免得抢走他自己配的键。
 *
 * ⚠️ 这里判断的是**用户配置的组合是不是 Alt+Space**，与「默认热键是什么」无关。
 * 早期版本拿它和 `getDefaultConfig().hotkey` 比较，默认值一换成 Ctrl+Alt+Space，
 * 迁移后的用户按 Alt+Space 就会莫名其妙地开关主窗口——所以固定比 `ALT_SPACE_HOTKEY`。
 *
 * ⚠️ 钩子依赖窗口消息，**窗口隐藏时收不到**，所以它只是兜底，不能替代全局热键。
 */
function fallbackAltSpaceHotkey(): void {
  if (activeGlobalShortcuts) return
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  if ((config.hotkey || '').trim().toLowerCase() !== ALT_SPACE_HOTKEY.toLowerCase()) return
  toggleMainWindowVisibility()
}

/**
 * 把「哪个键没注册上」告诉渲染层。
 * 以前这里只有 console.error：用户改了快捷键、被别的软件占用了，界面毫无反馈，
 * 表现就是「按了没反应」，只能自己猜。
 *
 * 带自增 id 是为了让渲染层能去重：补查通道和事件通道可能各送一次同一件事。
 *
 * 注意 `lastHotkeyIssue` 在窗口存在性检查**之前**就赋值了：
 * 启动早期（窗口还没建）发生的提示不会被丢掉，渲染层挂载后走 `get-hotkey-status`
 * 补查就能拿到。
 */
function notifyHotkeyIssue(
  keys: string[],
  recovered: boolean,
  options: {
    effectiveHotkey?: string | null
    migratedFrom?: string
    searchMigratedFrom?: string
    effectiveSearchHotkey?: string | null
  } = {}
): void {
  if (keys.length === 0 && !options.migratedFrom && !options.searchMigratedFrom) return
  const issue: HotkeyIssue = { keys, recovered, id: ++hotkeyIssueSeq }
  if (options.effectiveHotkey) issue.effectiveHotkey = options.effectiveHotkey
  if (options.migratedFrom) issue.migratedFrom = options.migratedFrom
  if (options.searchMigratedFrom) issue.searchMigratedFrom = options.searchMigratedFrom
  if (options.effectiveSearchHotkey) issue.effectiveSearchHotkey = options.effectiveSearchHotkey
  lastHotkeyIssue = issue

  const win = mainWindowRef.current
  if (!win || win.isDestroyed()) return

  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('hotkey-issue', issue)
  }
  // 启动阶段窗口可能还在加载，直接 send 会丢；等加载完成再发。
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function bindGlobalShortcuts(
  config: Config,
  options: { allowFallback?: boolean } = {}
): ShortcutBindResult {
  // 默认值从 getDefaultConfig() 取，别写字面量：兜底逻辑（fallbackAltSpaceHotkey）
  // 也读同一个来源，两处写死就会在换默认值时对不上。
  const defaults = getDefaultConfig()
  const preferred = config.hotkey || defaults.hotkey
  const searchHotkey = config.searchHotkey || defaults.searchHotkey
  const allowFallback = options.allowFallback !== false

  globalShortcut.unregisterAll()
  activeGlobalShortcuts = null

  const paused = config.launchPaused === true
  const pauseHotkey = (config.pauseHotkey || '').trim()

  /* 暂停状态：全局唤出热键整体失效，只保留「暂停热键」本身可用——
     否则一旦暂停就再也没法恢复。详见 toggleLaunchPaused / createTray 的托盘菜单。 */
  let effectiveHotkey: string | null = null
  const failedKeys: string[] = []

  if (!paused) {
    /* 主热键：按候选序列逐个尝试，取第一个注册成功的。
       期望值优先；期望值被占用时退到降级候选，避免「注册失败 → 用户按了没反应」
       这种零反馈的开箱即死状态。
       allowFallback=false 时只有期望值一个候选——用户主动改键的场景必须这样。 */
    const candidates = getHotkeyCandidates(preferred, allowFallback)
    for (const candidate of candidates) {
      // 与搜索热键撞车：后注册的必然抢不到，跳过而不是白白失败一次
      if (candidate.toLowerCase() === searchHotkey.toLowerCase()) continue
      try {
        if (globalShortcut.register(candidate, toggleMainWindowVisibility)) {
          effectiveHotkey = candidate
          break
        }
      } catch (error) {
        console.error(`Failed to register hotkey ${candidate}:`, error)
      }
    }

    /* failedKeys 只报「用户期望的那个键」，不把降级候选也塞进来——
       界面上写「Ctrl+Alt+Q、Ctrl+Shift+Space 都被占用了」对用户毫无意义，
       他关心的只有自己设的那个。实际生效值走 effectiveHotkey 单独传达。 */
    const fellBack = effectiveHotkey !== null && effectiveHotkey.toLowerCase() !== preferred.toLowerCase()
    if (effectiveHotkey === null || fellBack) failedKeys.push(preferred)

    let searchRegistered = false
    try {
      searchRegistered = globalShortcut.register(searchHotkey, () => {
        toggleSearchWindow()
      })
    } catch (error) {
      console.error('Failed to register search hotkey:', error)
    }
    if (!searchRegistered) failedKeys.push(searchHotkey)

    /* 搜索热键失败就整体撤销：留一半能用一半不能用，用户按另一个键毫无反应，
       比两个都不能用更难排查（沿用原有约定）。
       但**主热键走降级链成功时绝不能撤销**——那正是这套机制存在的意义。 */
    if (!searchRegistered) {
      globalShortcut.unregisterAll()
      return { ok: false, failedKeys, effectiveHotkey: null, usedFallback: false }
    }
  }

  /* 暂停热键始终注册：它是「恢复」的唯一入口，暂停状态下也必须可用。
     与唤出热键撞车时跳过，避免自己抢自己。 */
  if (pauseHotkey && pauseHotkey.toLowerCase() !== preferred.toLowerCase() && pauseHotkey.toLowerCase() !== searchHotkey.toLowerCase()) {
    try {
      globalShortcut.register(pauseHotkey, () => {
        void toggleLaunchPaused()
      })
    } catch (error) {
      console.error('Failed to register pause hotkey:', error)
    }
  }

  const fellBack = effectiveHotkey !== null && effectiveHotkey.toLowerCase() !== preferred.toLowerCase()
  const ok = !paused && effectiveHotkey !== null && !fellBack
  /* 暂停时主热键没注册上，fallbackAltSpaceHotkey 据此判断「全局没接管」才会本地兜底；
     这里把 activeGlobalShortcuts 置 null，语义才一致（否则会误判全局已接管）。 */
  activeGlobalShortcuts = paused
    ? null
    : { hotkey: effectiveHotkey ?? preferred, searchHotkey }
  return { ok, failedKeys, effectiveHotkey, usedFallback: fellBack }
}

function applyGlobalShortcuts(nextConfig: Config): boolean {
  if (shortcutRetryTimer) {
    clearTimeout(shortcutRetryTimer)
    shortcutRetryTimer = null
  }
  const previousConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  /* 用户主动改键：不允许降级替换。
     他刚录了一个组合，我们却因为注册不上悄悄换成别的键，他会以为「设置没生效」；
     正确做法是回退到上一套可用配置并如实告知。 */
  const result = bindGlobalShortcuts(nextConfig, { allowFallback: false })
  if (result.ok) return true

  bindGlobalShortcuts(previousConfig, { allowFallback: false })
  notifyHotkeyIssue(result.failedKeys, false)
  return false
}

function registerGlobalShortcut() {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  if (bindGlobalShortcuts(config).ok) return

  console.warn('Initial global shortcut registration did not land on the configured key; retrying after startup settles')
  shortcutRetryTimer = setTimeout(() => {
    shortcutRetryTimer = null
    const latestConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    const retry = bindGlobalShortcuts(latestConfig)
    if (retry.ok) return

    /* 期望的键没注册上，分两种情况告诉用户：
       · 降级链救回来了（effectiveHotkey 非空）→ 热键能用，但生效的是别的组合，
         必须说清楚是哪个，否则用户会以为「设置里写的那个生效了」；
       · 完全没救回来 → 全局快捷键整体不可用，请他手动换一个。 */
    notifyHotkeyIssue(retry.failedKeys, retry.effectiveHotkey !== null, {
      effectiveHotkey: retry.effectiveHotkey
    })
  }, SHORTCUT_RETRY_DELAY_MS)
}

/** 暂停 / 恢复全局快捷键：翻转 launchPaused 并持久化 + 重新注册 + 同步托盘 + 通知渲染层。
 * 暂停后所有唤出热键失效，只有暂停热键本身（若已设置）仍可用——否则一旦暂停就再也无法恢复。 */
function toggleLaunchPaused(): void {
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  const paused = !config.launchPaused
  const next: Config = { ...config, launchPaused: paused }
  writeJsonFile(CONFIG_FILE, next)
  bindGlobalShortcuts(next)
  updateTrayPaused(paused)
  notifyLaunchPaused(paused)
}

/** 把暂停状态变化推给渲染层（主窗口据此显示提示条 / 刷新设置页的开关）。 */
function notifyLaunchPaused(paused: boolean): void {
  const win = mainWindowRef.current
  if (!win || win.isDestroyed()) return
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('launch-paused-changed', paused)
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

/** 搜索窗请求主窗口定位某个项目：切到所属分类、滚动并高亮该卡片。 */
function registerLocateAppHandler(): void {
  ipcMain.handle('request-locate-app', (event, payload: unknown) => {
    if (!assertSender(event)) return false
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const appId = typeof p.appId === 'string' ? p.appId : ''
    const categoryId = typeof p.categoryId === 'string' ? p.categoryId : null
    if (!appId) return false
    showMainWindow()
    const target = mainWindowRef.current
    if (!target || target.isDestroyed()) return false
    const send = () => {
      if (!target.isDestroyed()) target.webContents.send('locate-app', { appId, categoryId })
    }
    if (target.webContents.isLoading()) {
      target.webContents.once('did-finish-load', send)
    } else {
      send()
    }
    return true
  })

  /* 设置页 / 托盘「立即暂停」按钮共用：返回切换后的状态，方便渲染层即时反映。 */
  ipcMain.handle('toggle-launch-paused', (event) => {
    if (!assertSender(event)) return false
    toggleLaunchPaused()
    return readJsonFile<Config>(CONFIG_FILE, getDefaultConfig()).launchPaused === true
  })
}

function buildTrayContextMenu(paused: boolean): Menu {
  return Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { label: '快速搜索', click: () => toggleSearchWindow() },
    {
      label: paused ? '恢复快捷键' : '暂停快捷键',
      click: () => { toggleLaunchPaused() }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])
}

/** 暂停状态变化时刷新托盘：tooltip 明确写出「已暂停」，右键菜单文案随之切换。 */
function updateTrayPaused(paused: boolean): void {
  if (!trayRef) return
  trayRef.setToolTip(paused ? 'tidy_desktop（快捷键已暂停）' : 'tidy_desktop')
  trayRef.setContextMenu(buildTrayContextMenu(paused))
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

  // 安装助手：等主实例退出后静默启动安装器，全程不建窗口、不建托盘、不注册快捷键
  if (updateAssistantArgs) {
    runUpdateAssistant(updateAssistantArgs)
      .catch(err => console.error('update assistant failed:', err))
      .finally(() => app.exit(0))
    return
  }

  Menu.setApplicationMenu(null)
  ensureDataDir()
  // 任务栏按钮图标按 AUMID 走持久化缓存：开发态若与发行版共用 AUMID，
  // electron.exe 的默认图标会把发行版的图标缓存再次污染，开发态用独立 AUMID 隔离。
  app.setAppUserModelId(app.isPackaged ? 'com.tidy-desktop.app' : 'com.tidy-desktop.app.dev')

  // Set up window refs for system handlers before registration
  setWindowRefs(mainWindowRef, searchWindowRef)

  // Register all IPC handlers
  registerAppHandlers()
  registerFileHandlers(applyGlobalShortcuts)
  registerIconHandlers()
  registerSystemHandlers()
  registerUrlMetaHandlers()
  registerFolderSyncHandlers(mainWindowRef)
  registerUiCommandHandler()
  registerFileSearchHandlers()
  registerAppearanceHandlers()
  registerPresetHandlers()
  /* 自定义托盘图标（P2-4）：设置页改完立即换图，不必重启。
     解析逻辑与 createTray 共用 getTrayIcon()，保证"启动时"和"改完后"看到的是同一张图。 */
  ipcMain.handle('apply-tray-icon', (event) => {
    if (!assertSender(event)) return false
    try {
      trayRef?.setImage(getTrayIcon())
      return true
    } catch {
      return false
    }
  })
  registerLocateAppHandler()
  cleanupInstalledUpdateCache()
  registerUpdateHandlers()

  /* ⚠️ 窗口必须在每日快照**之前**建。
     备份是同步 IO（`copyFileSync`，含 1.58MB 的 apps.json，外加清理旧份），原先排在
     `createWindow()` 前面，等于让"窗口什么时候出现"去等一次磁盘拷贝——冷启动时这段
     完全串行。挪到后面之后，渲染进程的启动（建进程、加载 JS、首次布局）与备份并行，
     窗口出现的时间里不再包含备份耗时。
     渲染层此时发的 `get-config` / `get-apps` 会被主进程排在备份之后处理，
     拿到的仍是备份后、迁移后的最新数据，不存在读到半截状态的问题。 */
  createWindow()

  /* 每日快照：目录与保留份数都可配（P2-7）。
     用户在设置里指定了别的目录（例如网盘同步目录）就用它，否则回退到 `<data>/backups`；
     关掉「自动备份」时整个跳过。 */
  const startupConfig = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  if (startupConfig.backupEnabled !== false) {
    runStartupBackup({
      files: [CONFIG_FILE, APPS_FILE, CATEGORIES_FILE, COLLECTIONS_FILE],
      backupDir: resolveBackupDir(CONFIG_DIR, startupConfig.backupDir),
      keep: startupConfig.backupKeep ?? KEEP_PER_FILE
    })
  }

  /* 一次性把旧默认热键 Alt+Space 迁走——它在 Windows 上是系统保留组合，
     globalShortcut 拿不到，老用户升级上来会继续顶着这个坏默认值。
     放在 runStartupBackup 之后：当天的快照里留一份迁移前的配置作为恢复点。

     ⚠️ 迁移写入的是配置文件，而窗口此刻已经在加载中。渲染层的 `get-config`
     会被主进程排在这次写入之后处理（主进程是单线程的，`migrateLegacy*` 之间没有 await），
     所以它拿到的是迁移后的值；即使退一步说读到了旧值，`get-hotkey-status`
     也会把迁移结果补发过去。 */
  const hotkeyMigration = migrateLegacyHotkeyDefault()
  /* 搜索热键那次迁移的动机不同：`Ctrl+K` 注册得上，但它会把**全系统的** Ctrl+K
     抢走（编辑器删除行、浏览器地址栏……）。两次迁移各自独立，互不影响。 */
  const searchHotkeyMigration = migrateLegacySearchHotkeyDefault()
  if (hotkeyMigration || searchHotkeyMigration) {
    notifyHotkeyIssue(hotkeyMigration ? [hotkeyMigration.from] : [], true, {
      effectiveHotkey: hotkeyMigration?.to ?? null,
      migratedFrom: hotkeyMigration?.from,
      searchMigratedFrom: searchHotkeyMigration?.from,
      effectiveSearchHotkey: searchHotkeyMigration?.to ?? null
    })
  }

  createTray()
  registerGlobalShortcut()
  startFolderSyncWatcher()
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
