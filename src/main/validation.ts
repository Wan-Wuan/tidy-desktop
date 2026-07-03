import type {
  AppItem,
  AppsData,
  AutoCategoryRule,
  CategoriesData,
  Category,
  Config,
  QuickAction,
  SearchEngine,
  Subcategory,
  UISettings
} from '../shared/types'

const APP_TYPES = new Set(['app', 'folder', 'steam'])
const CARD_SIZES = new Set(['small', 'medium', 'large'])
const THEMES = new Set(['aurora', 'light', 'dark', 'system'])
const QUICK_ACTIONS = new Set(['shutdown', 'restart', 'lock', 'settings', 'calculator', 'notepad', 'clipboard'])
const MAX_ITEMS = 5000
const MAX_STRING_LENGTH = 8192

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
  return {
    gridColumns: Math.min(12, Math.max(1, Math.round(asFiniteNumber(value.gridColumns, defaults.gridColumns)))),
    cardSize: CARD_SIZES.has(cardSize) ? cardSize as UISettings['cardSize'] : defaults.cardSize,
    showIcon: asBoolean(value.showIcon, defaults.showIcon),
    showName: asBoolean(value.showName, defaults.showName),
    borderRadius: Math.min(32, Math.max(0, Math.round(asFiniteNumber(value.borderRadius, defaults.borderRadius)))),
    theme: THEMES.has(theme) ? theme as UISettings['theme'] : defaults.theme
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
    searchEngines,
    autoStart: asBoolean(input.autoStart, defaults.autoStart),
    ui: sanitizeUiSettings(input.ui, defaults.ui || {
      gridColumns: 6,
      cardSize: 'medium',
      showIcon: true,
      showName: true,
      borderRadius: 8,
      theme: 'aurora'
    }),
    defaultEngine: searchEngines[asString(input.defaultEngine, defaults.defaultEngine, 40)]
      ? asString(input.defaultEngine, defaults.defaultEngine, 40)
      : defaults.defaultEngine,
    autoCategoryRules,
    quickActions,
    onboardingCompleted: asBoolean(input.onboardingCompleted, defaults.onboardingCompleted)
  }
}

function sanitizeAppItem(value: unknown): AppItem | null {
  if (!isRecord(value)) return null
  const id = asString(value.id, '', 160).trim()
  const name = asString(value.name, '', 240).trim()
  const appPath = asString(value.path).trim()
  if (!id || !name || !appPath) return null
  const type = asString(value.type, 'app')
  return {
    id,
    name,
    path: appPath,
    icon: asString(value.icon),
    categoryId: asStringOrNull(value.categoryId),
    subcategoryId: asStringOrNull(value.subcategoryId),
    pinyin: asString(value.pinyin, '', 1000),
    firstLetter: asString(value.firstLetter, '', 1000),
    type: APP_TYPES.has(type) ? type as AppItem['type'] : 'app',
    aliases: Array.isArray(value.aliases)
      ? value.aliases.slice(0, 30).map(alias => asString(alias, '', 120).trim()).filter(Boolean)
      : [],
    launchCount: Math.max(0, Math.round(asFiniteNumber(value.launchCount, 0))),
    lastOpenedAt: Math.max(0, Math.round(asFiniteNumber(value.lastOpenedAt, 0))),
    hidden: asBoolean(value.hidden, false)
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
    icon: asString(value.icon, '', 40),
    order: Math.round(asFiniteNumber(value.order, 0))
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
    icon: asString(value.icon, '', 40),
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
