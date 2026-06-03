export interface AppItem {
  id: string
  name: string
  path: string
  icon: string
  categoryId: string
  subcategoryId?: string | null
  pinyin: string
  firstLetter: string
  type?: 'app' | 'folder'
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
}

export interface AppsData {
  apps: AppItem[]
}

export interface CategoriesData {
  categories: Category[]
  subcategories?: Subcategory[]
}
