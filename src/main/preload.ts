import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AppItem, AppsData, CategoriesData, Config, UiCommand } from '../shared/types'
import type { UpdateProgress } from '../shared/electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: Config) => ipcRenderer.invoke('save-config', config),
  getApps: () => ipcRenderer.invoke('get-apps'),
  saveApps: (data: AppsData) => ipcRenderer.invoke('save-apps', data),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  saveCategories: (data: CategoriesData) => ipcRenderer.invoke('save-categories', data),
  openApp: (appPath: string) => ipcRenderer.invoke('open-app', appPath),
  openAppAsAdmin: (appPath: string) => ipcRenderer.invoke('open-app-as-admin', appPath),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
  openContainingFolder: (appPath: string) => ipcRenderer.invoke('open-containing-folder', appPath),
  showItemInFolder: (appPath: string) => ipcRenderer.invoke('show-item-in-folder', appPath),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  openSteam: (steamUrl: string) => ipcRenderer.invoke('open-steam', steamUrl),
  runQuickAction: (command: string) => ipcRenderer.invoke('run-quick-action', command),
  runUiCommand: (command: UiCommand) => ipcRenderer.invoke('run-ui-command', command),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  hideSearchWindow: () => ipcRenderer.invoke('hide-search-window'),
  hideMainWindow: () => ipcRenderer.invoke('hide-main-window'),
  confirm: (message: string) => ipcRenderer.invoke('confirm', message),
  extractIcon: (filePath: string) => ipcRenderer.invoke('extract-icon', filePath),
  extractSteamIcon: (steamUrl: string) => ipcRenderer.invoke('extract-steam-icon', steamUrl),
  getSteamGameName: (steamUrl: string) => ipcRenderer.invoke('get-steam-game-name', steamUrl),
  copyFileToClipboard: (filePath: string) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('copy-image-to-clipboard', filePath),
  startDragFile: (filePath: string) => ipcRenderer.invoke('start-drag-file', filePath),
  resizeSearchWindow: (height: number) => ipcRenderer.invoke('resize-search-window', height),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  classifyPaths: (filePaths: string[]) => ipcRenderer.invoke('classify-paths', filePaths),
  validateApps: (apps: Pick<AppItem, 'id' | 'path' | 'type'>[]) => ipcRenderer.invoke('validate-apps', apps),
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),
  scanShortcuts: () => ipcRenderer.invoke('scan-shortcuts'),
  openDataDirectory: () => ipcRenderer.invoke('open-data-directory'),
  clearIconCache: () => ipcRenderer.invoke('clear-icon-cache'),
  openUpdateLog: () => ipcRenderer.invoke('open-update-log'),
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
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (filePath: string) => ipcRenderer.invoke('install-update', filePath),
  onUpdateProgress: (callback: (data: UpdateProgress) => void) => {
    const handler = (_event: IpcRendererEvent, data: UpdateProgress) => callback(data)
    ipcRenderer.on('update-progress', handler)
    return () => ipcRenderer.removeListener('update-progress', handler)
  }
})
