import type { AppItem, Category, Collection, Subcategory, Config, ShortcutImportItem, DiagnosticExportResult, UiCommand, UrlMetaResult, GroupLaunchMember, GroupLaunchResult, FolderSyncSnapshot, FolderSyncUpdate, FileSearchResponse, EverythingStatus, LaunchAppPayload, PresetExportResult, PresetImportResult } from './types'

export interface UpdateInfo {
  available: boolean
  downloaded?: boolean
  version?: string
  downloadUrl?: string
  source?: 'gitee' | 'github'
  releaseNotes?: string
  error?: string
  /** 当前运行的是便携版：不能自动更新，只能去发布页手动下载替换 */
  portable?: boolean
  /** 发布页地址（便携版手动下载用） */
  releaseUrl?: string
}

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

/** 打开更新安装日志的结果。区分「没有日志」与「打开失败」，界面才能给出有用的提示。 */
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

/** 全局快捷键注册失败的信息：哪些键被占用、是否已回退到备用组合。 */
export interface HotkeyIssue {
  keys: string[]
  /** true = 已改用备用组合（至少还能用）；false = 全局快捷键整体不可用 */
  recovered: boolean
  /** 自增序号，供渲染层去重——补查通道与事件通道可能各送一次同一件事 */
  id: number
  /**
   * 实际生效的主热键。
   * 与配置里期望的值不同即说明走了降级候选；缺省表示没有任何可用的主热键。
   */
  effectiveHotkey?: string
  /**
   * 本次是「旧默认主热键一次性迁移」的通知，值是被替换掉的旧组合。
   * 与「注册失败」是两回事，界面要分开措辞，否则用户会以为自己的键被占用了。
   */
  migratedFrom?: string
  /**
   * 本次是「旧默认**搜索**热键一次性迁移」的通知，值是被替换掉的旧组合（通常是 `Ctrl+K`）。
   *
   * 与 `migratedFrom` 分开：那一条的原因是"注册不上"，这一条的原因是
   * "注册得上、但会把全系统的 Ctrl+K 抢走"，界面措辞完全不同。
   */
  searchMigratedFrom?: string
  /** 搜索热键迁移后的新值（配合 `searchMigratedFrom` 使用） */
  effectiveSearchHotkey?: string
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
      getCollections: () => Promise<{ collections: Collection[] }>
      saveCollections: (data: { collections: Collection[] }) => Promise<boolean>
      getDataHealth: () => Promise<DataHealth>
      restoreCorruptBackup: (payload: { backupPath: string; targetFile: string }) => Promise<boolean>
      openCorruptBackupsDirectory: () => Promise<boolean>
      /** 打开一个应用项目；`args` / `workingDir` 只对 `.exe` 生效（见 appHandlers 的说明） */
      openApp: (payload: LaunchAppPayload) => Promise<boolean>
      /** 用指定程序打开本地项目（P3-2）；参数以数组形式传给目标程序，不经过 shell */
      openAppWith: (payload: {
        path: string
        command: string
        argsBefore?: string
        argsAfter?: string
      }) => Promise<boolean>
      openAppAsAdmin: (payload: LaunchAppPayload) => Promise<boolean>
      openFolder: (folderPath: string) => Promise<boolean>
      openContainingFolder: (appPath: string) => Promise<boolean>
      showItemInFolder: (appPath: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      /** 用配置里的某个浏览器可执行文件打开网址；路径必须是存在的 .exe */
      openUrlWithBrowser: (payload: { url: string; browserPath: string }) => Promise<boolean>
      openSteam: (steamUrl: string) => Promise<boolean>
      runQuickAction: (command: string) => Promise<boolean>
      runUiCommand: (command: UiCommand) => Promise<boolean>
      selectFolder: () => Promise<string | null>
      /** 通用「选一个文件」对话框（背景图 / 托盘图标 / 浏览器可执行文件）。返回绝对路径或 null */
      selectFile: (payload?: { extensions?: string[]; title?: string }) => Promise<string | null>
      /** 把本地图片绝对路径换成渲染层可加载的 file:// URL；路径非法或不存在返回 null */
      getLocalImageUrl: (filePath: string) => Promise<string | null>
      /** 按当前配置重建托盘图标（设置里换完立即生效，不必重启） */
      applyTrayIcon: () => Promise<boolean>
      hideMainWindow: () => Promise<void>
      beginMainWindowResize: (edge: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw', screenX: number, screenY: number) => Promise<boolean>
      updateMainWindowResize: (screenX: number, screenY: number) => void
      endMainWindowResize: () => void
      confirm: (message: string) => Promise<boolean>
      /**
       * 多选项对话框：返回被点按钮的下标。
       *
       * `null` 表示**没问成**（来源不合法 / 窗口已销毁 / 参数不合法），
       * 调用方必须按"什么都不做"处理，别当成"选了第一个"。
       *
       * 用在"几个方案里挑一个"的场合。别拿 `confirm` 凑合——它只有两个按钮，
       * 一旦用来问"要不要包含子文件夹"，"取消"就同时背上了"不含子文件夹"
       * 和"算了不弄了"两个意思。
       */
      showChoice: (payload: {
        message: string
        detail?: string
        buttons: string[]
        defaultId?: number
        cancelId?: number
      }) => Promise<number | null>
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
      exportBackup: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      importBackup: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      exportDiagnostics: () => Promise<DiagnosticExportResult>
      scanShortcuts: () => Promise<ShortcutImportItem[]>
      resolveShortcutTargets: (filePaths: string[]) => Promise<Array<{ filePath: string; targetPath: string }>>
      /** 抓取网址的标题与 favicon；失败时返回结构化 error，不抛异常 */
      fetchUrlMeta: (url: string) => Promise<UrlMetaResult>
      /** 组合启动：逐个启动成员并汇总结果，单个失败不中断整批 */
      launchGroup: (payload: { members: GroupLaunchMember[]; serial?: boolean }) => Promise<GroupLaunchResult>
      /** 同步一个关联文件夹。rescan 为 false 时只重算隐藏/排序，不扫盘 */
      syncLinkFolder: (payload: {
        categoryId: string
        path: string
        includeSubdirs: boolean
        hiddenPaths?: string[]
        order?: string[]
        rescan?: boolean
      }) => Promise<FolderSyncSnapshot | null>
      /** 读上次的同步结果（不扫盘），用于启动时先画出内容 */
      getFolderSyncCache: () => Promise<Record<string, FolderSyncSnapshot>>
      onFolderSyncUpdated: (callback: (update: FolderSyncUpdate) => void) => () => void
      openDataDirectory: () => Promise<boolean>
      openBackupsDirectory: () => Promise<boolean>
      copyTextToClipboard: (text: string) => Promise<boolean>
      clearIconCache: () => Promise<{ success: boolean; count: number }>
      hideSearchWindow: () => Promise<void>
      resizeSearchWindow: (height: number) => Promise<void>
      onBlur: (callback: () => void) => () => void
      onResetSearch: (callback: () => void) => () => void
      onAppsUpdated: (callback: () => void) => () => void
      onUiCommand: (callback: (command: UiCommand) => void) => () => void
      onHotkeyIssue: (callback: (issue: HotkeyIssue) => void) => () => void
      getHotkeyStatus: () => Promise<HotkeyIssue | null>
      /** 设置页录制新快捷键期间挂起/恢复全局热键 */
      setShortcutSuspended: (suspended: boolean) => Promise<boolean>
      /** 切换全局快捷键暂停状态，返回切换后的暂停值 */
      toggleLaunchPaused: () => Promise<boolean>
      /** 搜索窗请求主窗口定位某个项目（切分类 + 滚动 + 高亮） */
      requestLocateApp: (payload: { appId: string; categoryId: string | null }) => Promise<boolean>
      /** 本机文件搜索：走本机 Everything（端口自动检测） */
      searchFiles: (payload: { query: string; limit?: number }) => Promise<FileSearchResponse>
      /** 检测本机 Everything（安装 / 运行 / HTTP 服务 / 端口连通性） */
      detectEverything: () => Promise<EverythingStatus>
      /** 取分类图片（icons/ 下的文件名）的 file:// URL */
      getIconFileUrl: (name: string) => Promise<string | null>
      /** 把本地图片/ SVG 文件复制进图标缓存，返回缓存文件名 */
      saveImageToIconCache: (sourcePath: string) => Promise<string | null>
      /** 打开本机文件搜索命中的任意文件/目录（不限扩展名，仅校验存在） */
      openPath: (filePath: string) => Promise<boolean>
      /** 导出配置预设到 JSON 文件 */
      exportConfigPreset: () => Promise<PresetExportResult>
      /** 导入配置预设；返回合并后的配置，落盘仍走 saveConfig */
      importConfigPreset: () => Promise<PresetImportResult>
      getVersion: () => Promise<string>
      checkForUpdate: () => Promise<UpdateInfo>
      downloadUpdate: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      installUpdate: (filePath?: string) => Promise<boolean>
      onUpdateProgress: (callback: (data: UpdateProgress) => void) => () => void
      /** 暂停状态变化（托盘 / 设置 / 热键切换），渲染层据此刷新 */
      onLaunchPausedChanged: (callback: (paused: boolean) => void) => () => void
      /** 主窗口收到"定位项目"请求，透传给渲染层 */
      onLocateApp: (callback: (payload: { appId: string; categoryId: string | null }) => void) => () => void
    }
  }
}

export {}
