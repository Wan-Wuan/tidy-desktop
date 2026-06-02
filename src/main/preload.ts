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
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  hideSearchWindow: () => ipcRenderer.invoke('hide-search-window'),
  hideMainWindow: () => ipcRenderer.invoke('hide-main-window'),
  confirm: (message: string) => ipcRenderer.invoke('confirm', message),
  extractIcon: (filePath: string) => ipcRenderer.invoke('extract-icon', filePath),
  resizeSearchWindow: (height: number) => ipcRenderer.invoke('resize-search-window', height),
  onBlur: (callback: () => void) => {
    ipcRenderer.on('blur-event', () => callback())
  },
  onResetSearch: (callback: () => void) => {
    ipcRenderer.on('reset-search', () => callback())
  }
})
