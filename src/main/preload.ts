import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type { AppItem, AppsData, CategoriesData, CollectionsData, Config, FolderSyncUpdate, GroupLaunchMember, LaunchAppPayload, UiCommand } from '../shared/types'
import type { UpdateProgress, HotkeyIssue } from '../shared/electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: Config) => ipcRenderer.invoke('save-config', config),
  getApps: () => ipcRenderer.invoke('get-apps'),
  saveApps: (data: AppsData) => ipcRenderer.invoke('save-apps', data),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  saveCategories: (data: CategoriesData) => ipcRenderer.invoke('save-categories', data),
  getCollections: () => ipcRenderer.invoke('get-collections'),
  saveCollections: (data: CollectionsData) => ipcRenderer.invoke('save-collections', data),
  getDataHealth: () => ipcRenderer.invoke('get-data-health'),
  restoreCorruptBackup: (payload: { backupPath: string; targetFile: string }) => ipcRenderer.invoke('restore-corrupt-backup', payload),
  openCorruptBackupsDirectory: () => ipcRenderer.invoke('open-corrupt-backups-directory'),
  openApp: (payload: LaunchAppPayload) => ipcRenderer.invoke('open-app', payload),
  openAppWith: (payload: { path: string; command: string; argsBefore?: string; argsAfter?: string }) =>
    ipcRenderer.invoke('open-app-with', payload),
  openAppAsAdmin: (payload: LaunchAppPayload) => ipcRenderer.invoke('open-app-as-admin', payload),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
  openContainingFolder: (appPath: string) => ipcRenderer.invoke('open-containing-folder', appPath),
  showItemInFolder: (appPath: string) => ipcRenderer.invoke('show-item-in-folder', appPath),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  openUrlWithBrowser: (payload: { url: string; browserPath: string }) =>
    ipcRenderer.invoke('open-url-with-browser', payload),
  openSteam: (steamUrl: string) => ipcRenderer.invoke('open-steam', steamUrl),
  runQuickAction: (command: string) => ipcRenderer.invoke('run-quick-action', command),
  runUiCommand: (command: UiCommand) => ipcRenderer.invoke('run-ui-command', command),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: (payload?: { extensions?: string[]; title?: string }) => ipcRenderer.invoke('select-file', payload),
  getLocalImageUrl: (filePath: string) => ipcRenderer.invoke('get-local-image-url', filePath),
  applyTrayIcon: () => ipcRenderer.invoke('apply-tray-icon'),
  hideSearchWindow: () => ipcRenderer.invoke('hide-search-window'),
  hideMainWindow: () => ipcRenderer.invoke('hide-main-window'),
  beginMainWindowResize: (edge: string, screenX: number, screenY: number) => ipcRenderer.invoke('begin-main-window-resize', edge, screenX, screenY),
  updateMainWindowResize: (screenX: number, screenY: number) => ipcRenderer.send('update-main-window-resize', screenX, screenY),
  endMainWindowResize: () => ipcRenderer.send('end-main-window-resize'),
  confirm: (message: string) => ipcRenderer.invoke('confirm', message),
  /* 多选项对话框：返回被点按钮的下标，null = 没问成（按"什么都不做"处理）。
     用于"在几个方案里挑一个"——用 confirm 凑合会让"取消"身兼两意。 */
  showChoice: (payload: { message: string; detail?: string; buttons: string[]; defaultId?: number; cancelId?: number }) =>
    ipcRenderer.invoke('show-choice', payload),
  extractIcon: (filePath: string) => ipcRenderer.invoke('extract-icon', filePath),
  extractSteamIcon: (steamUrl: string) => ipcRenderer.invoke('extract-steam-icon', steamUrl),
  getSteamGameName: (steamUrl: string) => ipcRenderer.invoke('get-steam-game-name', steamUrl),
  copyFileToClipboard: (filePath: string) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('copy-image-to-clipboard', filePath),
  startDragFile: (filePath: string) => ipcRenderer.invoke('start-drag-file', filePath),
  resizeSearchWindow: (height: number) => ipcRenderer.invoke('resize-search-window', height),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  getPathForFile: (file: File) => {
    try { return webUtils.getPathForFile(file) } catch { return '' }
  },
  classifyPaths: (filePaths: string[]) => ipcRenderer.invoke('classify-paths', filePaths),
  validateApps: (apps: Pick<AppItem, 'id' | 'path' | 'type'>[]) => ipcRenderer.invoke('validate-apps', apps),
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),
  scanShortcuts: () => ipcRenderer.invoke('scan-shortcuts'),
  resolveShortcutTargets: (filePaths: string[]) => ipcRenderer.invoke('resolve-shortcut-targets', filePaths),
  fetchUrlMeta: (url: string) => ipcRenderer.invoke('fetch-url-meta', url),
  launchGroup: (payload: { members: GroupLaunchMember[]; serial?: boolean }) =>
    ipcRenderer.invoke('launch-group', payload),
  syncLinkFolder: (payload: {
    categoryId: string
    path: string
    includeSubdirs: boolean
    hiddenPaths?: string[]
    order?: string[]
    rescan?: boolean
  }) => ipcRenderer.invoke('sync-link-folder', payload),
  getFolderSyncCache: () => ipcRenderer.invoke('get-folder-sync-cache'),
  openDataDirectory: () => ipcRenderer.invoke('open-data-directory'),
  openBackupsDirectory: () => ipcRenderer.invoke('open-backups-directory'),
  copyTextToClipboard: (text: string) => ipcRenderer.invoke('copy-text-to-clipboard', text),
  clearIconCache: () => ipcRenderer.invoke('clear-icon-cache'),
  moveSearchWindowToCursorDisplay: () => ipcRenderer.invoke('move-search-window-to-cursor-display'),
  onBlur: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('blur-event', handler)
    return () => ipcRenderer.removeListener('blur-event', handler)
  },
  onResetSearch: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('reset-search', handler)
    return () => ipcRenderer.removeListener('reset-search', handler)
  },
  onAppsUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('apps-updated', handler)
    return () => ipcRenderer.removeListener('apps-updated', handler)
  },
  onUiCommand: (callback: (command: UiCommand) => void) => {
    const handler = (_event: IpcRendererEvent, command: UiCommand) => callback(command)
    ipcRenderer.on('ui-command', handler)
    return () => ipcRenderer.removeListener('ui-command', handler)
  },
  onHotkeyIssue: (callback: (issue: HotkeyIssue) => void) => {
    const handler = (_event: IpcRendererEvent, issue: HotkeyIssue) => callback(issue)
    ipcRenderer.on('hotkey-issue', handler)
    return () => ipcRenderer.removeListener('hotkey-issue', handler)
  },
  onFolderSyncUpdated: (callback: (update: FolderSyncUpdate) => void) => {
    const handler = (_event: IpcRendererEvent, update: FolderSyncUpdate) => callback(update)
    ipcRenderer.on('folder-sync-updated', handler)
    return () => ipcRenderer.removeListener('folder-sync-updated', handler)
  },
  getHotkeyStatus: () => ipcRenderer.invoke('get-hotkey-status'),
  setShortcutSuspended: (suspended: boolean) => ipcRenderer.invoke('set-shortcut-suspended', suspended),
  /** 切换全局快捷键暂停状态，返回切换后的暂停值（渲染层即时反映） */
  toggleLaunchPaused: () => ipcRenderer.invoke('toggle-launch-paused'),
  /** 搜索窗请求主窗口定位某个项目（切分类 + 滚动 + 高亮） */
  requestLocateApp: (payload: { appId: string; categoryId: string | null }) =>
    ipcRenderer.invoke('request-locate-app', payload),
  /** 本机文件搜索：走本机 Everything（端口自动检测） */
  searchFiles: (payload: { query: string; limit?: number }) =>
    ipcRenderer.invoke('search-files', payload),
  /** 检测本机 Everything：是否安装 / 运行 / HTTP 服务是否启用 / 端口是否连得上 */
  detectEverything: () => ipcRenderer.invoke('detect-everything'),
  /** 取分类图片（存于 icons/ 下的文件名）的 file:// URL */
  getIconFileUrl: (name: string) => ipcRenderer.invoke('get-icon-file-url', name),
  /** 把本地图片/ SVG 文件复制进图标缓存，返回缓存文件名 */
  saveImageToIconCache: (sourcePath: string) => ipcRenderer.invoke('save-image-to-icon-cache', sourcePath),
  /** 打开本机文件搜索命中的任意文件/目录（不限扩展名，仅校验存在） */
  openPath: (filePath: string) => ipcRenderer.invoke('open-path', filePath),
  /** 导出配置预设（ui / 规则 / 快捷命令 / 搜索引擎 / 环境变量 / 浏览器）到 JSON 文件 */
  exportConfigPreset: () => ipcRenderer.invoke('export-config-preset'),
  /** 导入配置预设：主进程只读取 + 校验 + 合并，落盘仍走 saveConfig */
  importConfigPreset: () => ipcRenderer.invoke('import-config-preset'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (filePath?: string) => ipcRenderer.invoke('install-update', filePath),
  onUpdateProgress: (callback: (data: UpdateProgress) => void) => {
    const handler = (_event: IpcRendererEvent, data: UpdateProgress) => callback(data)
    ipcRenderer.on('update-progress', handler)
    return () => ipcRenderer.removeListener('update-progress', handler)
  },
  /** 暂停状态变化（托盘菜单 / 设置页 / 热键切换都会触发），渲染层据此刷新状态 */
  onLaunchPausedChanged: (callback: (paused: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, paused: boolean) => callback(paused)
    ipcRenderer.on('launch-paused-changed', handler)
    return () => ipcRenderer.removeListener('launch-paused-changed', handler)
  },
  /** 主窗口收到"定位项目"请求时把参数透传给渲染层 */
  onLocateApp: (callback: (payload: { appId: string; categoryId: string | null }) => void) => {
    const handler = (_event: IpcRendererEvent, payload: { appId: string; categoryId: string | null }) => callback(payload)
    ipcRenderer.on('locate-app', handler)
    return () => ipcRenderer.removeListener('locate-app', handler)
  }
})
