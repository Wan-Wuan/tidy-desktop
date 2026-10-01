/**
 * 项目类型。
 *
 * ⚠️ 新增类型时必须同步三处，否则会被静默降级成 `app`：
 *   · `main/validation.ts` 的 `APP_TYPES`（写入校验）
 *   · `main/handlers/fileHandlers.ts` 的 `get-apps` 读取兜底
 *   · `renderer/components/modals/AddAppModal.tsx` 的类型选择器
 */
export type AppItemType = 'app' | 'folder' | 'steam' | 'url' | 'note' | 'group'

/**
 * 文本项目的正文形态。
 *
 * ⚠️ 刻意**不做成新的 `AppItemType`**：「待办」与「笔记」共用同一张卡片、
 * 同一套图标 / 搜索 / 右键菜单，只是正文的呈现与交互不同。新开一个类型要同步
 * `APP_TYPES`、`get-apps` 读取兜底、类型选择器、`groupLaunch` 白名单等一串地方，
 * 而这里没有任何一处需要区分。
 *
 * 缺省视为 `'text'`——历史数据没有这个字段，读出来就是笔记。
 */
export type NoteKind = 'text' | 'todo'

/** 待办条目（仅 `note` 类型 + `noteKind === 'todo'` 时使用） */
export interface TodoItem {
  id: string
  text: string
  done: boolean
}

/**
 * 「用指定程序打开」的命令行模板。
 *
 * 路径固定夹在中间：`[命令] [路径前参数] [项目路径] [路径后内容]`。
 * 这样两种常见惯例都能表达——「选项在前、文件在后」（`code --goto <file>`）
 * 与「选项在前、文件居中、收尾选项在后」（`tool -n <file> -nosession`），
 * 而路径由程序自己补引号，用户不必操心空格。
 *
 * ⚠️ 参数是**用户可控字符串**，主进程执行时绝不经过 shell
 * （见 `appHandlers.launchDetached`），否则参数里的 `&` / `|` 会变成命令分隔符。
 */
export interface OpenWithCommand {
  /** 可执行文件路径 */
  command: string
  /** 放在路径之前的参数 */
  argsBefore?: string
  /** 放在路径之后的参数 */
  argsAfter?: string
}

export interface AppItem {
  id: string
  name: string
  path: string
  icon: string
  categoryId: string | null
  subcategoryId?: string | null
  pinyin: string
  firstLetter: string
  type?: AppItemType
  aliases?: string[]
  launchCount?: number
  lastOpenedAt?: number
  hidden?: boolean
  /** 启动参数（app 类型） */
  args?: string
  /** 起始位置（app 类型） */
  workingDir?: string
  /** url 类型：指定用哪个浏览器打开，对应 Config.browsers 的 id */
  browserId?: string | null
  /**
   * app / folder 类型：用指定程序打开（而不是系统关联程序）。
   * 缺省 / null 表示走 `shell.openPath`，即系统默认行为。
   */
  openWith?: OpenWithCommand | null
  /** note 类型：正文 */
  noteContent?: string
  /** note 类型：正文形态，缺省 `'text'`（笔记）。`'todo'` 时用 `todoItems` 渲染 */
  noteKind?: NoteKind
  /** note 类型 + `noteKind === 'todo'`：待办条目，顺序即展示顺序 */
  todoItems?: TodoItem[]
  /** group 类型：成员项目 id，按数组顺序启动 */
  memberIds?: string[]
  /** group 类型：启动前先弹确认面板，允许临时取消勾选个别成员 */
  confirmBeforeLaunch?: boolean
  /** 关联文件夹同步产生的条目：来源目录 */
  sourceFolder?: string
  /** 是否由关联文件夹同步产生。界面据此区分（同步条目只读） */
  isSynced?: boolean
  /** 在关联文件夹中被隐藏：保留记录但不展示 */
  hiddenInFolder?: boolean
}

/**
 * 「打开一个应用项目」的载荷。
 *
 * 不用裸路径字符串：P3 之后同一个项目还带着「启动参数 / 起始位置」，
 * 位置参数传下去会变成 `openApp(path, args, workingDir)` 这种谁都不敢改的签名，
 * 而且与 `open-app-with` 的载荷形状对不上。
 */
export interface LaunchAppPayload {
  path: string
  /** 启动参数（原始字符串，主进程负责展开 `%KEY%` 并按命令行规则拆分） */
  args?: string
  /** 起始位置（目录绝对路径） */
  workingDir?: string
}

/**
 * 新建 / 编辑项目时的草稿。
 *
 * AddAppModal 与 EditAppModal 共用这一份形状，`useAppCrud` 的
 * `handleAddApp` / `handleUpdateApp` 也只收这一个参数——
 * 以前是两个弹窗各自摊开 5~6 个位置参数，加一个类型就要同时改三处签名，
 * 漏改一处就会「弹窗里填了、存下去丢了」。
 */
export interface AppItemDraft {
  name: string
  path: string
  categoryId: string
  type: AppItemType
  aliases?: string[]
  /** app 类型：启动参数 */
  args?: string
  /** app 类型：起始位置 */
  workingDir?: string
  /** url 类型：指定浏览器（对应 Config.browsers 的 id） */
  browserId?: string | null
  /** app / folder 类型：用指定程序打开；缺省表示系统默认方式 */
  openWith?: OpenWithCommand | null
  /** note 类型：正文 */
  noteContent?: string
  /** note 类型：正文形态，缺省 `'text'`（笔记） */
  noteKind?: NoteKind
  /** note 类型 + `noteKind === 'todo'`：待办条目 */
  todoItems?: TodoItem[]
  /** group 类型：成员项目 id，按数组顺序启动 */
  memberIds?: string[]
  /** group 类型：启动前先弹确认面板，允许临时取消勾选个别成员 */
  confirmBeforeLaunch?: boolean
  /**
   * 已经拿到的图标（data URL）。
   * 目前只有「网址」类型会带：favicon 是在弹窗里就抓好的，
   * 存完再去抓一次既慢又可能这次失败、上次成功，不如直接把结果带下来。
   */
  icon?: string
}

/** 分类关联的本地文件夹。内容由主进程扫描并缓存在 folderCache.json，不进 apps.json。 */
export interface CategoryLinkFolder {
  path: string
  includeSubdirs: boolean
  /** 上次成功同步的时间戳；0 表示尚未同步过 */
  lastSyncAt: number
  /**
   * 用户在同步结果里隐藏掉的条目（存绝对路径）。
   * 这是**用户意图**，所以跟分类一起存在 categories.json；
   * 扫描结果本身只进 `folderCache.json`，那个文件随时可以丢。
   */
  hiddenPaths?: string[]
  /**
   * 用户自定义的排序（存绝对路径，未列出的排在后面）。
   * 同样属于用户意图，与扫描结果分开存。
   */
  order?: string[]
}

export interface Category {
  id: string
  name: string
  icon: string
  order: number
  /** 分类条名称字号（px）；缺省时用全局设置 */
  fontSize?: number
  /** 分类条目高度（px） */
  itemHeight?: number
  /** 分类图标尺寸（px） */
  iconSize?: number
  /** 关联文件夹；null / 缺省表示未关联 */
  linkFolder?: CategoryLinkFolder | null
  /**
   * 访问口令。
   * ⚠️ 只用于防误触与防窥屏，**不是加密**——数据文件本身仍是明文 JSON，
   * 界面文案必须如实说明，不要给出虚假的安全承诺。
   */
  passwordHash?: string
}

export interface Subcategory {
  id: string
  name: string
  icon: string
  parentId: string | null
}

export interface SearchEngine {
  name: string
  url: string
}

/** 环境变量：项目路径 / 启动参数 / 起始位置里用 %KEY% 引用，常用路径只维护一处 */
export interface EnvVar {
  key: string
  value: string
}

/** 可用于打开网址的浏览器 */
export interface BrowserEntry {
  id: string
  name: string
  path: string
}

/** 主界面背景设置 */
export interface BackgroundSettings {
  kind: 'none' | 'color' | 'image'
  /** color 时是颜色值；image 时是本地图片绝对路径 */
  value?: string
  /** 背景模糊强度（px） */
  blur?: number
  /**
   * 遮罩暗化程度 0~1。
   * ⚠️ 不是纯装饰：玻璃面板上的浅色文字全靠这层遮罩保住对比度，
   * 亮度高的背景图不压暗会直接把文字糊掉。
   */
  dim?: number
}

export interface UISettings {
  gridColumns: number
  cardSize: 'small' | 'medium' | 'large'
  showIcon: boolean
  showName: boolean
  borderRadius: number
  theme?: 'aurora' | 'light' | 'dark' | 'system' | 'glass'
  layout?: 'command-rail' | 'horizon-workspace' | 'studio-split'
  sidebarWidth?: number
  accentColor?: string
  searchWidth?: number
  searchVerticalRatio?: number
  searchMaxResults?: number
  sortMode?: 'manual' | 'name' | 'launchCount' | 'recent'
  searchTheme?: 'dark' | 'light'
  searchOpacity?: number
  searchHintsVisible?: boolean
  toolbarIconOnly?: boolean
  /** 全局字体族；缺省跟随主题 */
  fontFamily?: string
  /** 全局字号缩放系数 0.8~1.4 */
  uiScale?: number
  background?: BackgroundSettings | null
  /** 自定义托盘图标（图片绝对路径）；null 表示用内置图标 */
  trayIcon?: string | null
  /** 快速搜索框的占位文字 */
  searchPlaceholder?: string
}

export interface AutoCategoryRule {
  id: string
  name: string
  categoryId: string
  match: string
}

export interface QuickAction {
  key: string
  name: string
  command: 'shutdown' | 'restart' | 'lock' | 'settings' | 'calculator' | 'notepad' | 'clipboard'
  enabled: boolean
}

export type UiCommand =
  | 'open-organizer'
  | 'health-check'
  | 'refresh-icons'
  | 'auto-categorize'
  | 'import-shortcuts'
  | 'restore-hidden'
  | 'export-backup'

export interface Config {
  hotkey: string
  searchHotkey?: string
  windowSize: {
    width: number
    height: number
  }
  windowPosition?: { x: number; y: number } | null
  searchEngines: {
    [key: string]: SearchEngine
  }
  autoStart?: boolean
  ui?: UISettings
  defaultEngine?: string
  autoCategoryRules?: AutoCategoryRule[]
  quickActions?: QuickAction[]
  onboardingCompleted?: boolean
  closeAction?: 'tray' | 'quit'
  lastActiveCategoryId?: string | null
  trayNotified?: boolean
  searchAutoHideOnBlur?: boolean
  startMinimizedToTray?: boolean
  mainAutoHideOnBlur?: boolean
  /**
   * 「旧默认主热键已迁移」标记。
   * 打上之后即使 hotkey 又被设回 Alt+Space 也不会再被自动改掉——
   * 那是用户自己选的，不是历史遗留。
   */
  hotkeyDefaultMigrated?: boolean
  /**
   * 「旧默认搜索热键已迁移」标记。
   *
   * 与 `hotkeyDefaultMigrated` **必须分开**：两个键的迁移时机与失败原因不同
   * （主热键是"Windows 保留组合、注册不上"，搜索热键是"能注册上、但会抢掉
   * 全系统的 Ctrl+K"）。共用一个标记会导致只迁移了一个时另一个永远不再被检查。
   */
  searchHotkeyDefaultMigrated?: boolean
  /** 环境变量表，供路径与参数里的 %KEY% 引用 */
  envVars?: EnvVar[]
  /**
   * 相对路径的基准目录。
   * 项目路径落在它之下时优先存相对路径，方便整包搬移；为空则回退到应用数据目录。
   */
  portableRoot?: string | null
  /** 新建项目时优先保存相对路径 */
  preferRelativePath?: boolean
  /** 全局快捷键是否已暂停（持久化，跨重启保持） */
  launchPaused?: boolean
  /** 可指定用于打开网址的浏览器列表 */
  browsers?: BrowserEntry[]
  /**
   * 添加网址项目时是否联网抓取标题与 favicon（默认开）。
   * 抓取会暴露用户添加过哪些网址，因此必须提供整体关闭的开关。
   */
  urlMetaEnabled?: boolean
  /**
   * 暂停 / 恢复全局快捷键：录制的全局组合，按一下切换 `launchPaused`。
   * 空串表示不启用「快捷键暂停」（只能从托盘菜单 / 设置里切换）。
   */
  pauseHotkey?: string
  /**
   * Everything 的 HTTP 接口端口。
   * 0 / 缺省 = **自动检测**（读 Everything.ini 里的 `http_server_port`）；
   * 非零时强制用该端口。检测不到、或探测失败时本机文件搜索不返回结果
   * （绝不硬依赖，见 §5.1）。
   */
  everythingHttpPort?: number
  /** 每日自动备份是否启用（缺省 = 开） */
  backupEnabled?: boolean
  /** 自动备份目录；null / 缺省 = 应用数据目录下的 `backups` */
  backupDir?: string | null
  /** 每个数据文件保留的备份份数（缺省 7，范围 1~50） */
  backupKeep?: number
}

/** 导出配置预设的结果 */
export interface PresetExportResult {
  ok: boolean
  /** 实际写入的文件路径；取消或失败时为空串 */
  path: string
  canceled: boolean
}

/**
 * 导入配置预设的结果。
 *
 * ⚠️ `config` 是**合并后但还没落盘**的完整配置：主进程只负责读取 + 校验 + 合并，
 * 写入由渲染层走既有的 `saveConfig` 链路完成（损坏保护、快捷键重注册、
 * 失败提示都复用那一套，不必在这里重写）。
 */
export interface PresetImportResult {
  ok: boolean
  /** 真正生效的字段名 */
  applied: string[]
  config: Config | null
  canceled: boolean
}

export interface AppsData {
  apps: AppItem[]
}

export interface CategoriesData {
  categories: Category[]
  subcategories?: Subcategory[]
}

/**
 * 收纳格：项目区里的一个容器，把若干项目聚在一起显示。
 *
 * ⚠️ 它**只影响"在哪里显示"，不改变项目的分类归属**——成员仍然带着自己原本的
 * `categoryId` / `subcategoryId`。所以收纳格与分类是并列的层级概念，不是分类的替代品。
 *
 * 存在独立的 `collections.json` 而不是塞进 `categories.json`：收纳格会频繁改变
 * 成员列表，跟分类混在一个文件里会让 `groupedApps` 那段（拖拽最敏感的地方）
 * 多出一层判断。
 */
export interface Collection {
  id: string
  name: string
  icon: string
  /** 显示在哪个分类下；null 表示显示在"全部项目"视图里 */
  categoryId: string | null
  /** 成员项目 id，数组顺序就是显示顺序 */
  memberIds: string[]
  /** 折叠状态跟着收纳格自己走，不放进 Config */
  collapsed: boolean
  order: number
}

export interface CollectionsData {
  collections: Collection[]
}

export interface ShortcutImportItem {
  name: string
  path: string
  targetPath: string
  icon: string
  type: 'app' | 'folder'
  /**
   * 来源。`appx` 是 Microsoft Store / UWP 应用——它们没有 .lnk 文件，
   * 由 `Get-StartApps` 扫描得到，path / targetPath 是 `shell:AppsFolder\<AUMID>`。
   */
  source: 'desktop' | 'startMenu' | 'appx' | 'other'
}

export interface DiagnosticExportResult {
  success: boolean
  filePath?: string
  error?: string
}

/** 网址元信息抓取的失败原因。渲染层据此决定提示文案，不解析字符串。 */
export type UrlMetaError =
  | 'invalid-url'
  | 'disabled'
  | 'timeout'
  | 'too-large'
  | 'http-error'
  | 'network'
  | 'empty-response'
  | 'no-icon'

export interface UrlMetaResult {
  ok: boolean
  title: string
  /** favicon 的 data URL；拿不到时为 null，渲染层降级为域名首字母头像 */
  icon: string | null
  error: UrlMetaError | null
}

/**
 * 组合启动的成员描述。
 * 渲染层把已在手的项目信息传下来，主进程不去读 apps.json——
 * 否则"界面上看到的"和"实际启动的"可能因为一次落盘时序而错位。
 */
export interface GroupLaunchMember {
  id: string
  name: string
  path: string
  type?: AppItemType
  /**
   * 启动参数 / 起始位置。
   *
   * 必须跟着成员一起传下去：同一个项目在网格里点、在组合里启动，
   * 行为不一致是用户最难理解的一类问题（"明明配了参数，单独点生效、组合启动就不生效"）。
   */
  args?: string
  workingDir?: string
  /** 「用指定程序打开」；组合成员同样要遵守 */
  openWith?: OpenWithCommand | null
}

export interface GroupLaunchMemberResult {
  id: string
  name: string
  path: string
  ok: boolean
  /** 失败原因：`invalid-path` / `invalid-url` / `unsupported-type` / 系统返回的错误文本 */
  error: string | null
}

export interface GroupLaunchResult {
  /** 全部成员都启动成功才为 true */
  ok: boolean
  launched: number
  failed: number
  results: GroupLaunchMemberResult[]
}

/* ------------------------------------------------------------- 关联文件夹同步 */

/** 关联文件夹同步的失败原因。`missing` 与 `permission-denied` 在界面上要有不同的提示。 */
export type FolderSyncError = 'missing' | 'not-a-directory' | 'permission-denied' | 'read-failed'

export interface FolderSyncEntry {
  name: string
  /** 绝对路径，同时是渲染层的稳定 key */
  path: string
  type: 'app' | 'folder'
  /** 相对根目录的层级，根目录直属子项为 1 */
  depth: number
  /** 首次出现的时间戳，界面用它标记"新增" */
  firstSeenAt: number
  hidden: boolean
  order: number
}

export interface FolderSyncSnapshot {
  path: string
  includeSubdirs: boolean
  lastSyncAt: number
  error: FolderSyncError | null
  /** 触到深度或数量上限——界面要如实提示"只显示了一部分" */
  truncated: boolean
  entries: FolderSyncEntry[]
}

/** 主进程后台同步后推给渲染层的变更通知 */
export interface FolderSyncUpdate {
  categoryId: string
  snapshot: FolderSyncSnapshot
}

/* ------------------------------------------------------------- 本机文件搜索 */

/** 本机文件搜索的单项结果。 */
export interface FileSearchResult {
  name: string
  /** 绝对路径 */
  path: string
  isDir: boolean
  size?: number
}

/** 本机文件搜索的结果来源。本机文件搜索只走 Everything，`none` 表示未连上 / 无结果。 */
export type FileSearchSource = 'everything' | 'none'

/** `search-files` 的返回体：结果 + 来源（供界面显示「结果是否来自 Everything」）。 */
export interface FileSearchResponse {
  results: FileSearchResult[]
  source: FileSearchSource
  /** 实际使用的 Everything 端口；未连接时为 0 */
  port: number
}

/** `detect-everything` 的返回体：本机 Everything 的检测结果（设置页展示用）。 */
export interface EverythingStatus {
  /** 是否装了 Everything（找到 ini 或 exe） */
  installed: boolean
  /** Everything 进程是否在运行 */
  running: boolean
  /** HTTP 服务是否已启用（ini 里 http_server_enabled=1 且 allow_http_server≠0） */
  httpEnabled: boolean
  /** 实际会使用的端口（显式配置优先，其次自动检测；0 = 不用 Everything） */
  port: number
  /** 该端口当前是否真的能连上（已发探测请求） */
  reachable: boolean
  /** 命中的 ini 路径（诊断用） */
  iniPath?: string
  /** 找到的 Everything.exe 路径（诊断用） */
  exePath?: string
}

/** 分类图标的编码形态。
 *  - `emoji:<字符>` 或纯字符（历史兼容）：Emoji / 文字
 *  - `image:<icons/ 下的文件名>`：本地图片（复制到图标缓存）
 *  - `url:<http(s) 地址>`：网络图片
 *  - `svg:<data url>`：内联 SVG（已转成 data url，避免注入）
 */
export type CategoryIconKind = 'emoji' | 'image' | 'url' | 'svg'

export interface ParsedCategoryIcon {
  kind: CategoryIconKind
  /** emoji = 字符；image = 文件名；url/svg = 完整地址 */
  value: string
}
