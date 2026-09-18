import type { AppItem, Category, Subcategory, Config, ShortcutImportItem, DiagnosticExportResult, UiCommand } from './types'

export interface UpdateInfo {
  available: boolean
  downloaded?: boolean
  version?: string
  downloadUrl?: string
  source?: 'gitee' | 'github'
  releaseNotes?: string
  error?: string
}

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

/** 打开更新安装日志的结果。区分「没有日志」与「打开失败」，界面才能给出有用的提示。 */
export interface UpdateLogOpenResult {
  ok: boolean
  reason?: 'not-found' | 'open-failed'
  logPath: string
}

/** 最近一次更新安装的结果，用于应用重启后提示上次更新是否中断 */
export type UpdateInstallStatus =
  | { state: 'none' }
  | { state: 'completed'; exitCode: number | null }
  | { state: 'aborted'; reason: string }

/** 一份损坏数据的留档（`<原文件>.corrupt-<时间戳>`） */
export interface CorruptBackupInfo {
  fileName: string
  backupPath: string
  targetFile: string
  size: number
  createdAt: number
}

/** 数据健康状态：哪些文件当前损坏、有哪些可以恢复的留档 */
export interface DataHealth {
  corruptedNow: string[]
  backups: CorruptBackupInfo[]
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
      getDataHealth: () => Promise<DataHealth>
      restoreCorruptBackup: (payload: { backupPath: string; targetFile: string }) => Promise<boolean>
      openCorruptBackupsDirectory: () => Promise<boolean>
      openApp: (appPath: string) => Promise<boolean>
      openAppAsAdmin: (appPath: string) => Promise<boolean>
      openFolder: (folderPath: string) => Promise<boolean>
      openContainingFolder: (appPath: string) => Promise<boolean>
      showItemInFolder: (appPath: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      openSteam: (steamUrl: string) => Promise<boolean>
      runQuickAction: (command: string) => Promise<boolean>
      runUiCommand: (command: UiCommand) => Promise<boolean>
      selectFolder: () => Promise<string | null>
      hideMainWindow: () => Promise<void>
      beginMainWindowResize: (edge: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw', screenX: number, screenY: number) => Promise<boolean>
      updateMainWindowResize: (screenX: number, screenY: number) => void
      endMainWindowResize: () => void
      confirm: (message: string) => Promise<boolean>
      extractIcon: (filePath: string) => Promise<string | null>
      extractSteamIcon: (steamUrl: string) => Promise<string | null>
      getSteamGameName: (steamUrl: string) => Promise<string | null>
      copyFileToClipboard: (filePath: string) => Promise<boolean>
      copyImageToClipboard: (filePath: string) => Promise<boolean>
      startDragFile: (filePath: string) => Promise<boolean>
      setAutoStart: (enabled: boolean) => Promise<boolean>
      getAutoStart: () => Promise<boolean>
      getPathForFile: (file: File) => string
      classifyPaths: (filePaths: string[]) => Promise<PathInfo[]>
      validateApps: (apps: { id: string; path: string; type?: string }[]) => Promise<{ id: string; path: string; exists: boolean }[]>
      exportBackup: () => Promise<{ success: boolean; filePath?: string }>
      importBackup: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      exportDiagnostics: () => Promise<DiagnosticExportResult>
      scanShortcuts: () => Promise<ShortcutImportItem[]>
      resolveShortcutTargets: (filePaths: string[]) => Promise<Array<{ filePath: string; targetPath: string }>>
      openDataDirectory: () => Promise<boolean>
      openBackupsDirectory: () => Promise<boolean>
      copyTextToClipboard: (text: string) => Promise<boolean>
      clearIconCache: () => Promise<{ success: boolean; count: number }>
      openUpdateLog: () => Promise<UpdateLogOpenResult>
      getUpdateInstallStatus: () => Promise<UpdateInstallStatus>
      resetUpdateInstallLog: () => Promise<boolean>
      showSearchWindow: () => Promise<boolean>
      hideSearchWindow: () => Promise<void>
      resizeSearchWindow: (height: number) => Promise<void>
      moveSearchWindowToCursorDisplay: () => Promise<boolean>
      onBlur: (callback: () => void) => () => void
      onResetSearch: (callback: () => void) => () => void
      onAppsUpdated: (callback: () => void) => () => void
      onUiCommand: (callback: (command: UiCommand) => void) => () => void
      getVersion: () => Promise<string>
      checkForUpdate: () => Promise<UpdateInfo>
      downloadUpdate: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      installUpdate: (filePath: string) => Promise<boolean>
      onUpdateProgress: (callback: (data: UpdateProgress) => void) => () => void
    }
  }
}

export {}
