import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export const CONFIG_DIR = path.join(app.getPath('userData'), 'data')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
export const APPS_FILE = path.join(CONFIG_DIR, 'apps.json')
export const CATEGORIES_FILE = path.join(CONFIG_DIR, 'categories.json')
export const ICONS_DIR = path.join(CONFIG_DIR, 'icons')

export function ensureDataDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true })
  }
  // 只清理空文件（0 字节），避免误删有效图标
  try {
    const files = fs.readdirSync(ICONS_DIR)
    for (const file of files) {
      const filePath = path.join(ICONS_DIR, file)
      const stat = fs.statSync(filePath)
      if (stat.size === 0) {
        fs.unlinkSync(filePath)
      }
    }
  } catch { /* ignore */ }
}

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data) as T
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
  }
  return defaultValue
}

export function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    ensureDataDir()
    // Atomic write: write to temp file first, then rename (rename is atomic on most filesystems)
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
    return true
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
    // Clean up temp file if it exists
    try { fs.unlinkSync(filePath + '.tmp') } catch { /* ignore */ }
    return false
  }
}

export function getDefaultConfig() {
  return {
    hotkey: 'Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1050, height: 800 },
    searchEngines: {
      b: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
      g: { name: 'Google', url: 'https://www.google.com/search?q=' },
      bd: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
      yh: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
      ddg: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
      gh: { name: 'GitHub', url: 'https://github.com/search?q=' },
      so: { name: 'StackOverflow', url: 'https://stackoverflow.com/search?q=' },
      zhihu: { name: '知乎', url: 'https://www.zhihu.com/search?q=' },
      bilibili: { name: 'B站', url: 'https://search.bilibili.com/all?keyword=' }
    },
    autoStart: false,
    ui: {
      gridColumns: 6,
      cardSize: 'medium' as const,
      showIcon: true,
      showName: true,
      borderRadius: 8
    },
    defaultEngine: 'b'
  }
}
