import type {
  AppItem,
  AppItemType,
  AppsData,
  AutoCategoryRule,
  BackgroundSettings,
  BrowserEntry,
  CategoriesData,
  Category,
  CategoryLinkFolder,
  Collection,
  CollectionsData,
  Config,
  EnvVar,
  NoteKind,
  OpenWithCommand,
  QuickAction,
  SearchEngine,
  Subcategory,
  TodoItem,
  UISettings
} from '../shared/types'
import { randomUUID } from 'node:crypto'

// ⚠️ 新增项目类型时必须同步这里，否则用户保存后会被静默降级成 'app'。
// 导出给 fileHandlers 的读取兜底共用，避免两处白名单各自漂移。
export const APP_ITEM_TYPES = new Set<AppItemType>(['app', 'folder', 'steam', 'url', 'note', 'group'])
const CARD_SIZES = new Set(['small', 'medium', 'large'])
const THEMES = new Set(['aurora', 'light', 'dark', 'system', 'glass'])
const LAYOUTS = new Set(['command-rail', 'horizon-workspace', 'studio-split'])
const QUICK_ACTIONS = new Set(['shutdown', 'restart', 'lock', 'settings', 'calculator', 'notepad', 'clipboard'])
const CLOSE_ACTIONS = new Set(['tray', 'quit'])
const SORT_MODES = new Set(['manual', 'name', 'launchCount', 'recent'])
const SEARCH_THEMES = new Set(['dark', 'light'])
const MAX_ITEMS = 5000
const MAX_STRING_LENGTH = 8192
const MAX_ICON_LENGTH = 2_000_000
const MAX_TODO_ITEMS = 500
const MAX_TODO_TEXT_LENGTH = 500
const MAX_COMMAND_PATH_LENGTH = 1024
const MAX_COMMAND_ARGS_LENGTH = 2048
const NOTE_KINDS = new Set<NoteKind>(['text', 'todo'])

/**
 * 这些类型的 `path` 必须非空。
 *
 * ⚠️ **文本（`note`）与组合（`group`）本来就没有路径**——表单里 path 固定存空串
 * （渲染层 `APP_TYPE_REQUIRES_PATH`）。如果在这里一并要求非空，`save-apps`
 * 会把它们整条丢掉：用户点保存、界面提示成功，卡片却再也没出现过。
 * 主进程不能 import 渲染层那份常量，所以在主进程单独维护一份，两边必须一致。
 */
const APP_TYPE_REQUIRES_PATH = new Set<AppItemType>(['app', 'folder', 'steam', 'url'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = '', maxLength = MAX_STRING_LENGTH): string {
  if (typeof value !== 'string') return fallback
  return value.slice(0, maxLength)
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? asString(value) : null
}

/**
 * 清洗「用指定程序打开」的命令行模板。
 *
 * 命令为空（或整块缺失 / 不是对象）一律收敛成 `null`，表示"走系统默认方式"——
 * 界面据此判断要不要显示"已指定程序"，比留一个半截对象（有 argsBefore 没 command）
 * 安全得多：那种状态执行起来必然是失败的。
 *
 * 参数本身**不做内容校验**（它是用户可控的任意字符串，无法白名单），
 * 安全边界由执行侧保证：主进程 `spawn` 时 `shell: false`，参数以数组传入，
 * 不经过任何 shell 解析。
 */
function sanitizeOpenWith(value: unknown): OpenWithCommand | null {
  if (!isRecord(value)) return null
  const command = asString(value.command, '', MAX_COMMAND_PATH_LENGTH).trim()
  if (!command) return null
  return {
    command,
    argsBefore: asString(value.argsBefore, '', MAX_COMMAND_ARGS_LENGTH),
    argsAfter: asString(value.argsAfter, '', MAX_COMMAND_ARGS_LENGTH)
  }
}

/**
 * 清洗待办条目。
 *
 * 三条规则都是为了让「勾掉某一条」永远有确定结果：
 *   · 空文本条目直接丢弃——否则界面上会出现看不见却占着位置的条目；
 *   · **id 缺失或重复就补一个新的**——`todoItems` 的 React key 与 toggle 目标
 *     都是 id，重复 id 会让"勾掉第 3 条"连带把第 7 条一起勾掉；
 *   · 超出上限直接截断，避免一份畸形数据把渲染拖死。
 */
function sanitizeTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return []
  const out: TodoItem[] = []
  const seenIds = new Set<string>()
  for (const raw of value.slice(0, MAX_TODO_ITEMS)) {
    if (!isRecord(raw)) continue
    const text = asString(raw.text, '', MAX_TODO_TEXT_LENGTH)
    if (!text.trim()) continue
    let id = asString(raw.id, '', 160).trim()
    if (!id || seenIds.has(id)) id = randomUUID()
    seenIds.add(id)
    out.push({ id, text, done: raw.done === true })
  }
  return out
}

/** 可选数值：缺失时回落到 fallback（可以是 undefined，表示「不设置」），有值时夹到区间内 */
function asOptionalClampedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number | undefined
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 可空字符串：显式 null 保留为 null，空串也归一成 null，缺省时用 fallback */
function asNullableString(value: unknown, fallback: string | null, maxLength = 1024): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

/** 环境变量名只允许字母数字下划线——含 % 或空白会让 %KEY% 的替换规则产生歧义 */
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

function sanitizeEnvVar(value: unknown): EnvVar | null {
  if (!isRecord(value)) return null
  const key = asString(value.key, '', 80).trim()
  const val = asString(value.value, '', 2048).trim()
  if (!ENV_KEY_PATTERN.test(key)) return null
  return { key, value: val }
}

function sanitizeBrowser(value: unknown): BrowserEntry | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 80).trim()
  const name = asString(value.name, '', 120).trim()
  const browserPath = asString(value.path, '', 1024).trim()
  if (!id || !name || !browserPath) return null
  return { id, name, path: browserPath }
}

function sanitizeBackground(value: unknown, fallback: BackgroundSettings | null): BackgroundSettings | null {
  if (value === null) return null
  if (!isRecord(value)) return fallback
  const kind = asString(value.kind, 'none', 10)
  if (kind !== 'none' && kind !== 'color' && kind !== 'image') return fallback
  return {
    kind,
    value: asString(value.value, '', 2048).trim(),
    blur: Math.min(40, Math.max(0, Math.round(asFiniteNumber(value.blur, fallback?.blur ?? 0)))),
    // 遮罩上限 0.9：留一点背景可见度，同时保证玻璃面板上的文字仍过 WCAG AA
    dim: Math.min(0.9, Math.max(0, asFiniteNumber(value.dim, fallback?.dim ?? 0.35)))
  }
}

/** 隐藏 / 排序列表都是路径数组，去重、限量、去掉空串 */
function sanitizePathList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const entry = item.trim().slice(0, 4096)
    if (!entry) continue
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(entry)
    if (output.length >= limit) break
  }
  return output
}

function sanitizeLinkFolder(value: unknown): CategoryLinkFolder | null {
  if (!isRecord(value)) return null
  const folderPath = asString(value.path, '', 1024).trim()
  if (!folderPath) return null
  return {
    path: folderPath,
    includeSubdirs: asBoolean(value.includeSubdirs, true),
    lastSyncAt: Math.max(0, Math.round(asFiniteNumber(value.lastSyncAt, 0))),
    /* 隐藏与排序是**用户意图**，丢了就得重新点一遍，所以要跟分类一起持久化。
       上限跟单次扫描的条目上限对齐（500），再多也没有对应的条目可指。 */
    hiddenPaths: sanitizePathList(value.hiddenPaths, 500),
    order: sanitizePathList(value.order, 500)
  }
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeSearchEngine(value: unknown): SearchEngine | null {
  if (!isRecord(value)) return null
  const name = asString(value.name, '', 120).trim()
  const url = asString(value.url, '', 2048).trim()
  if (!name || !isSafeHttpUrl(url)) return null
  return { name, url }
}

function sanitizeUiSettings(value: unknown, defaults: UISettings): UISettings {
  if (!isRecord(value)) return defaults
  const cardSize = asString(value.cardSize, defaults.cardSize)
  const theme = asString(value.theme, defaults.theme || 'aurora')
  const layout = asString(value.layout, defaults.layout || 'horizon-workspace')
  return {
    gridColumns: Math.min(12, Math.max(1, Math.round(asFiniteNumber(value.gridColumns, defaults.gridColumns)))),
    cardSize: CARD_SIZES.has(cardSize) ? cardSize as UISettings['cardSize'] : defaults.cardSize,
    showIcon: asBoolean(value.showIcon, defaults.showIcon),
    showName: asBoolean(value.showName, defaults.showName),
    borderRadius: Math.min(32, Math.max(0, Math.round(asFiniteNumber(value.borderRadius, defaults.borderRadius)))),
    theme: THEMES.has(theme) ? theme as UISettings['theme'] : defaults.theme,
    layout: LAYOUTS.has(layout) ? layout as UISettings['layout'] : defaults.layout,
    sidebarWidth: Math.min(420, Math.max(180, Math.round(asFiniteNumber(value.sidebarWidth, defaults.sidebarWidth || 240)))),
    accentColor: asString(value.accentColor, defaults.accentColor || '', 9).trim(),
    searchWidth: Math.min(900, Math.max(380, Math.round(asFiniteNumber(value.searchWidth, defaults.searchWidth || 600)))),
    searchVerticalRatio: Math.min(0.8, Math.max(0.1, asFiniteNumber(value.searchVerticalRatio, defaults.searchVerticalRatio || 0.3))),
    searchMaxResults: Math.min(12, Math.max(4, Math.round(asFiniteNumber(value.searchMaxResults, defaults.searchMaxResults || 6)))),
    sortMode: SORT_MODES.has(asString(value.sortMode, defaults.sortMode || 'manual', 20))
      ? asString(value.sortMode, defaults.sortMode || 'manual', 20) as UISettings['sortMode']
      : 'manual',
    searchTheme: SEARCH_THEMES.has(asString(value.searchTheme, defaults.searchTheme || 'dark', 10))
      ? asString(value.searchTheme, defaults.searchTheme || 'dark', 10) as UISettings['searchTheme']
      : 'dark',
    searchOpacity: Math.min(0.95, Math.max(0.5, asFiniteNumber(value.searchOpacity, defaults.searchOpacity || 0.72))),
    searchHintsVisible: asBoolean(value.searchHintsVisible, defaults.searchHintsVisible !== false),
    toolbarIconOnly: asBoolean(value.toolbarIconOnly, defaults.toolbarIconOnly === true),
    fontFamily: asString(value.fontFamily, defaults.fontFamily || '', 120).trim(),
    uiScale: asOptionalClampedNumber(value.uiScale, 0.8, 1.4, defaults.uiScale),
    background: sanitizeBackground(value.background, defaults.background ?? null),
    trayIcon: asNullableString(value.trayIcon, defaults.trayIcon ?? null),
    searchPlaceholder: asString(value.searchPlaceholder, defaults.searchPlaceholder || '', 60)
  }
}

function sanitizeQuickAction(value: unknown): QuickAction | null {
  if (!isRecord(value)) return null
  const command = asString(value.command)
  if (!QUICK_ACTIONS.has(command)) return null
  const key = asString(value.key, '', 80).trim()
  const name = asString(value.name, '', 120).trim()
  if (!key || !name) return null
  return {
    key,
    name,
    command: command as QuickAction['command'],
    enabled: asBoolean(value.enabled, true)
  }
}

function sanitizeAutoCategoryRule(value: unknown): AutoCategoryRule | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 120).trim()
  const name = asString(value.name, '', 120).trim()
  const categoryId = asString(value.categoryId, '', 120).trim()
  const match = asString(value.match, '', 240).trim()
  if (!id || !name || !categoryId || !match) return null
  return { id, name, categoryId, match }
}

export function sanitizeConfig(input: unknown, defaults: Config): Config | null {
  if (!isRecord(input)) return null

  const searchEngines: Config['searchEngines'] = { ...defaults.searchEngines }
  if (isRecord(input.searchEngines)) {
    for (const [key, value] of Object.entries(input.searchEngines)) {
      const safeKey = key.slice(0, 40)
      const engine = sanitizeSearchEngine(value)
      if (safeKey && engine) searchEngines[safeKey] = engine
    }
  }

  const windowSizeValue = isRecord(input.windowSize) ? input.windowSize : {}
  const windowPositionValue = isRecord(input.windowPosition) ? input.windowPosition : null
  const closeAction = asString(input.closeAction, defaults.closeAction || 'tray', 10)
  const lastActiveCategoryId = asStringOrNull(input.lastActiveCategoryId)
  const quickActions = Array.isArray(input.quickActions)
    ? input.quickActions.slice(0, 100).map(sanitizeQuickAction).filter((item): item is QuickAction => !!item)
    : defaults.quickActions
  const autoCategoryRules = Array.isArray(input.autoCategoryRules)
    ? input.autoCategoryRules.slice(0, 300).map(sanitizeAutoCategoryRule).filter((item): item is AutoCategoryRule => !!item)
    : defaults.autoCategoryRules

  return {
    hotkey: asString(input.hotkey, defaults.hotkey, 80).trim() || defaults.hotkey,
    searchHotkey: asString(input.searchHotkey, defaults.searchHotkey, 80).trim() || defaults.searchHotkey,
    windowSize: {
      width: Math.min(3840, Math.max(600, Math.round(asFiniteNumber(windowSizeValue.width, defaults.windowSize.width)))),
      height: Math.min(2160, Math.max(400, Math.round(asFiniteNumber(windowSizeValue.height, defaults.windowSize.height))))
    },
    windowPosition: windowPositionValue
      ? {
        x: Math.round(asFiniteNumber(windowPositionValue.x, 0)),
        y: Math.round(asFiniteNumber(windowPositionValue.y, 0))
      }
      : null,
    searchEngines,
    autoStart: asBoolean(input.autoStart, defaults.autoStart),
    ui: sanitizeUiSettings(input.ui, defaults.ui || {
      gridColumns: 6,
      cardSize: 'medium',
      showIcon: true,
      showName: true,
      borderRadius: 8,
      theme: 'aurora',
      layout: 'horizon-workspace',
      sidebarWidth: 240
    }),
    defaultEngine: searchEngines[asString(input.defaultEngine, defaults.defaultEngine, 40)]
      ? asString(input.defaultEngine, defaults.defaultEngine, 40)
      : defaults.defaultEngine,
    autoCategoryRules,
    quickActions,
    onboardingCompleted: asBoolean(input.onboardingCompleted, defaults.onboardingCompleted),
    closeAction: CLOSE_ACTIONS.has(closeAction) ? closeAction as Config['closeAction'] : 'tray',
    lastActiveCategoryId: lastActiveCategoryId ? lastActiveCategoryId.slice(0, 160) : null,
    trayNotified: asBoolean(input.trayNotified, defaults.trayNotified === true),
    searchAutoHideOnBlur: asBoolean(input.searchAutoHideOnBlur, defaults.searchAutoHideOnBlur === true),
    startMinimizedToTray: asBoolean(input.startMinimizedToTray, defaults.startMinimizedToTray === true),
    mainAutoHideOnBlur: asBoolean(input.mainAutoHideOnBlur, defaults.mainAutoHideOnBlur === true),
    hotkeyDefaultMigrated: asBoolean(input.hotkeyDefaultMigrated, defaults.hotkeyDefaultMigrated === true),
    envVars: Array.isArray(input.envVars)
      ? input.envVars.slice(0, 100).map(sanitizeEnvVar).filter((item): item is EnvVar => !!item)
      : defaults.envVars ?? [],
    portableRoot: asNullableString(input.portableRoot, defaults.portableRoot ?? null),
    preferRelativePath: asBoolean(input.preferRelativePath, defaults.preferRelativePath === true),
    launchPaused: asBoolean(input.launchPaused, defaults.launchPaused === true),
    urlMetaEnabled: asBoolean(input.urlMetaEnabled, defaults.urlMetaEnabled !== false),
    browsers: Array.isArray(input.browsers)
      ? input.browsers.slice(0, 20).map(sanitizeBrowser).filter((item): item is BrowserEntry => !!item)
      : defaults.browsers ?? [],
    pauseHotkey: asString(input.pauseHotkey, defaults.pauseHotkey || '', 80).trim(),
    everythingHttpPort: Math.min(65535, Math.max(0, Math.round(asFiniteNumber(input.everythingHttpPort, defaults.everythingHttpPort ?? 0)))),
    backupEnabled: asBoolean(input.backupEnabled, defaults.backupEnabled !== false),
    backupDir: asNullableString(input.backupDir, defaults.backupDir ?? null),
    backupKeep: Math.min(50, Math.max(1, Math.round(asFiniteNumber(input.backupKeep, defaults.backupKeep ?? 7))))
  }
}

function sanitizeAppItem(value: unknown): AppItem | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 160).trim()
  const name = asString(value.name, '', 240).trim()
  const appPath = asString(value.path).trim()
  const rawType = asString(value.type, 'app')
  const type = APP_ITEM_TYPES.has(rawType as AppItemType) ? rawType as AppItemType : 'app'
  if (!id || !name) return null
  /* 只有"有路径"的类型才要求路径。文本与组合的 path 恒为空串，
     在这里卡掉等于让它们存不下来（见 APP_TYPE_REQUIRES_PATH 的注释）。 */
  if (APP_TYPE_REQUIRES_PATH.has(type) && !appPath) return null
  return {
    id,
    name,
    path: appPath,
    icon: asString(value.icon, '', MAX_ICON_LENGTH),
    categoryId: asStringOrNull(value.categoryId),
    subcategoryId: asStringOrNull(value.subcategoryId),
    pinyin: asString(value.pinyin, '', 1000),
    firstLetter: asString(value.firstLetter, '', 1000),
    type,
    aliases: Array.isArray(value.aliases)
      ? value.aliases.slice(0, 30).map(alias => asString(alias, '', 120).trim()).filter(Boolean)
      : [],
    launchCount: Math.max(0, Math.round(asFiniteNumber(value.launchCount, 0))),
    lastOpenedAt: Math.max(0, Math.round(asFiniteNumber(value.lastOpenedAt, 0))),
    hidden: asBoolean(value.hidden, false),
    args: asString(value.args, '', 2048),
    workingDir: asString(value.workingDir, '', 1024),
    browserId: asStringOrNull(value.browserId),
    openWith: sanitizeOpenWith(value.openWith),
    noteContent: asString(value.noteContent, '', 20000),
    noteKind: NOTE_KINDS.has(value.noteKind as NoteKind) ? value.noteKind as NoteKind : 'text',
    todoItems: sanitizeTodoItems(value.todoItems),
    memberIds: Array.isArray(value.memberIds)
      ? value.memberIds.slice(0, 200).map(id => asString(id, '', 160).trim()).filter(Boolean)
      : [],
    confirmBeforeLaunch: asBoolean(value.confirmBeforeLaunch, false),
    sourceFolder: asString(value.sourceFolder, '', 1024),
    isSynced: asBoolean(value.isSynced, false),
    hiddenInFolder: asBoolean(value.hiddenInFolder, false)
  }
}

export function sanitizeAppsData(input: unknown): AppsData | null {
  if (!isRecord(input) || !Array.isArray(input.apps)) return null
  return {
    apps: input.apps.slice(0, MAX_ITEMS).map(sanitizeAppItem).filter((item): item is AppItem => !!item)
  }
}

function sanitizeCategory(value: unknown): Category | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 160).trim()
  const name = asString(value.name, '', 120).trim()
  if (!id || !name) return null
  return {
    id,
    name,
    icon: asString(value.icon, '', 4096),
    order: Math.round(asFiniteNumber(value.order, 0)),
    fontSize: asOptionalClampedNumber(value.fontSize, 10, 24, undefined),
    itemHeight: asOptionalClampedNumber(value.itemHeight, 24, 72, undefined),
    iconSize: asOptionalClampedNumber(value.iconSize, 12, 48, undefined),
    linkFolder: sanitizeLinkFolder(value.linkFolder),
    passwordHash: asString(value.passwordHash, '', 200)
  }
}

function sanitizeSubcategory(value: unknown): Subcategory | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 160).trim()
  const name = asString(value.name, '', 120).trim()
  if (!id || !name) return null
  return {
    id,
    name,
    icon: asString(value.icon, '', 4096),
    parentId: asStringOrNull(value.parentId)
  }
}

export function sanitizeCategoriesData(input: unknown): CategoriesData | null {
  if (!isRecord(input) || !Array.isArray(input.categories)) return null
  return {
    categories: input.categories.slice(0, MAX_ITEMS).map(sanitizeCategory).filter((item): item is Category => !!item),
    subcategories: Array.isArray(input.subcategories)
      ? input.subcategories.slice(0, MAX_ITEMS).map(sanitizeSubcategory).filter((item): item is Subcategory => !!item)
      : []
  }
}

function sanitizeCollection(value: unknown): Collection | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 160).trim()
  const name = asString(value.name, '', 120).trim()
  if (!id || !name) return null
  return {
    id,
    name,
    icon: asString(value.icon, '', 4096),
    categoryId: asStringOrNull(value.categoryId),
    // 成员上限与组合的成员上限保持一致：都是"一次要显示/启动的一串项目"
    memberIds: Array.isArray(value.memberIds)
      ? value.memberIds.slice(0, 200).map(item => asString(item, '', 160).trim()).filter(Boolean)
      : [],
    collapsed: asBoolean(value.collapsed, false),
    order: Math.round(asFiniteNumber(value.order, 0))
  }
}

export function sanitizeCollectionsData(input: unknown): CollectionsData | null {
  if (!isRecord(input) || !Array.isArray(input.collections)) return null
  return {
    collections: input.collections
      .slice(0, MAX_ITEMS)
      .map(sanitizeCollection)
      .filter((item): item is Collection => !!item)
  }
}
