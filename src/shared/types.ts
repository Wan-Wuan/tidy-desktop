export interface AppItem {
  id: string
  name: string
  path: string
  icon: string
  categoryId: string | null
  subcategoryId?: string | null
  pinyin: string
  firstLetter: string
  type?: 'app' | 'folder' | 'steam'
  aliases?: string[]
  launchCount?: number
  lastOpenedAt?: number
  hidden?: boolean
}

export interface Category {
  id: string
  name: string
  icon: string
  order: number
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

export interface UISettings {
  gridColumns: number
  cardSize: 'small' | 'medium' | 'large'
  showIcon: boolean
  showName: boolean
  borderRadius: number
  theme?: 'aurora' | 'light' | 'dark' | 'system'
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

export interface Config {
  hotkey: string
  searchHotkey?: string
  windowSize: {
    width: number
    height: number
  }
  searchEngines: {
    [key: string]: SearchEngine
  }
  autoStart?: boolean
  ui?: UISettings
  defaultEngine?: string
  autoCategoryRules?: AutoCategoryRule[]
  quickActions?: QuickAction[]
  onboardingCompleted?: boolean
}

export interface AppsData {
  apps: AppItem[]
}

export interface CategoriesData {
  categories: Category[]
  subcategories?: Subcategory[]
}

export interface ShortcutImportItem {
  name: string
  path: string
  targetPath: string
  icon: string
  type: 'app' | 'folder'
  source: 'desktop' | 'startMenu' | 'other'
}

export interface DiagnosticExportResult {
  success: boolean
  filePath?: string
  error?: string
}
