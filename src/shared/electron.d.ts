import type { AppItem, Category, Subcategory, Config } from './types'

export interface UpdateInfo {
  available: boolean
  version?: string
  downloadUrl?: string
  releaseNotes?: string
  error?: string
}

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'
  version?: string
  progress?: UpdateProgress
  error?: string
  releaseNotes?: string
}

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<Config>
      saveConfig: (config: Config) => Promise<boolean>
      getApps: () => Promise<{ apps: AppItem[] }>
      saveApps: (data: { apps: AppItem[] }) => Promise<boolean>
      getCategories: () => Promise<{ categories: Category[]; subcategories: Subcategory[] }>
      saveCategories: (data: { categories: Category[]; subcategories: Subcategory[] }) => Promise<boolean>
      openApp: (appPath: string) => Promise<boolean>
      openFolder: (folderPath: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      openSteam: (steamUrl: string) => Promise<boolean>
      selectFolder: () => Promise<string | null>
      hideMainWindow: () => Promise<void>
      confirm: (message: string) => Promise<boolean>
      extractIcon: (filePath: string) => Promise<string | null>
      extractSteamIcon: (steamUrl: string) => Promise<string | null>
      getSteamGameName: (steamUrl: string) => Promise<string | null>
      copyFileToClipboard: (filePath: string) => Promise<boolean>
      copyImageToClipboard: (filePath: string) => Promise<boolean>
      startDragFile: (filePath: string) => Promise<boolean>
      setAutoStart: (enabled: boolean) => Promise<boolean>
      getAutoStart: () => Promise<boolean>
      hideSearchWindow: () => Promise<void>
      resizeSearchWindow: (height: number) => Promise<void>
      onBlur: (callback: () => void) => () => void
      onResetSearch: (callback: () => void) => () => void
      getVersion: () => Promise<string>
      checkForUpdate: () => Promise<UpdateInfo>
      getUpdateStatus: () => Promise<UpdateStatus>
      downloadUpdate: (downloadUrl?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      installUpdate: (filePath: string) => Promise<boolean>
      onUpdateProgress: (callback: (data: UpdateProgress) => void) => () => void
    }
  }
}

export {}
