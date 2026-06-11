import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  getApps: () => ipcRenderer.invoke('get-apps'),
  saveApps: (data: any) => ipcRenderer.invoke('save-apps', data),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  saveCategories: (data: any) => ipcRenderer.invoke('save-categories', data),
  openApp: (appPath: string) => ipcRenderer.invoke('open-app', appPath),
  openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  openSteam: (steamUrl: string) => ipcRenderer.invoke('open-steam', steamUrl),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  hideSearchWindow: () => ipcRenderer.invoke('hide-search-window'),
  hideMainWindow: () => ipcRenderer.invoke('hide-main-window'),
  confirm: (message: string) => ipcRenderer.invoke('confirm', message),
  extractIcon: (filePath: string) => ipcRenderer.invoke('extract-icon', filePath),
  extractSteamIcon: (steamUrl: string) => ipcRenderer.invoke('extract-steam-icon', steamUrl),
  getSteamGameName: (steamUrl: string) => ipcRenderer.invoke('get-steam-game-name', steamUrl),
  copyFileToClipboard: (filePath: string) => ipcRenderer.invoke('copy-file-to-clipboard', filePath),
  resizeSearchWindow: (height: number) => ipcRenderer.invoke('resize-search-window', height),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  onBlur: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('blur-event', handler)
    return () => ipcRenderer.removeListener('blur-event', handler)
  },
  onResetSearch: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('reset-search', handler)
    return () => ipcRenderer.removeListener('reset-search', handler)
  }
})
