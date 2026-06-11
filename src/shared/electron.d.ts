import type { AppItem, Category, Subcategory, Config } from './types'

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
      setAutoStart: (enabled: boolean) => Promise<boolean>
      getAutoStart: () => Promise<boolean>
      hideSearchWindow: () => Promise<void>
      resizeSearchWindow: (height: number) => Promise<void>
      onBlur: (callback: () => void) => () => void
      onResetSearch: (callback: () => void) => () => void
    }
  }
}

export {}
