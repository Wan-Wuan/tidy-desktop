export interface AppItem {
  id: string
  name: string
  path: string
  icon: string
  categoryId: string
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

export interface SearchEngine {
  name: string
  url: string
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
  theme?: string
}

export interface AppsData {
  apps: AppItem[]
}

export interface CategoriesData {
  categories: Category[]
}
