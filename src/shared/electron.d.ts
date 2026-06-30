import type { AppItem, Category, Subcategory, Config, ShortcutImportItem, DiagnosticExportResult } from './types'

export interface UpdateInfo {
  available: boolean
  downloaded?: boolean
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

export interface PathInfo {
  path: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  extension: string
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
      openAppAsAdmin: (appPath: string) => Promise<boolean>
      openFolder: (folderPath: string) => Promise<boolean>
      openContainingFolder: (appPath: string) => Promise<boolean>
      showItemInFolder: (appPath: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      openSteam: (steamUrl: string) => Promise<boolean>
      runQuickAction: (command: string) => Promise<boolean>
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
      classifyPaths: (filePaths: string[]) => Promise<PathInfo[]>
      validateApps: (apps: { id: string; path: string; type?: string }[]) => Promise<{ id: string; path: string; exists: boolean }[]>
      exportBackup: () => Promise<{ success: boolean; filePath?: string }>
      importBackup: () => Promise<{ success: boolean; filePath?: string }>
      exportDiagnostics: () => Promise<DiagnosticExportResult>
      scanShortcuts: () => Promise<ShortcutImportItem[]>
      openDataDirectory: () => Promise<boolean>
      clearIconCache: () => Promise<{ success: boolean; count: number }>
      openUpdateLog: () => Promise<boolean>
      hideSearchWindow: () => Promise<void>
      resizeSearchWindow: (height: number) => Promise<void>
      moveSearchWindowToCursorDisplay: () => Promise<boolean>
      onBlur: (callback: () => void) => () => void
      onResetSearch: (callback: () => void) => () => void
      getVersion: () => Promise<string>
      checkForUpdate: () => Promise<UpdateInfo>
      downloadUpdate: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      installUpdate: (filePath: string) => Promise<boolean>
      onUpdateProgress: (callback: (data: UpdateProgress) => void) => () => void
    }
  }
}

export {}
