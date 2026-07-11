import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export { writeJsonFilesAtomically } from './jsonTransaction'

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
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
    return true
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
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
      yt: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
      npm: { name: 'npm', url: 'https://www.npmjs.com/search?q=' },
      mdn: { name: 'MDN', url: 'https://developer.mozilla.org/search?q=' },
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
      borderRadius: 8,
      theme: 'aurora' as const
    },
    defaultEngine: 'b',
    onboardingCompleted: false,
    autoCategoryRules: [],
    quickActions: [
      { key: '>shutdown', name: '关机', command: 'shutdown' as const, enabled: true },
      { key: '>restart', name: '重启', command: 'restart' as const, enabled: true },
      { key: '>lock', name: '锁定电脑', command: 'lock' as const, enabled: true },
      { key: '>settings', name: '系统设置', command: 'settings' as const, enabled: true },
      { key: '>calc', name: '计算器', command: 'calculator' as const, enabled: true },
      { key: '>notepad', name: '记事本', command: 'notepad' as const, enabled: true },
      { key: '>clipboard', name: '剪贴板历史', command: 'clipboard' as const, enabled: true }
    ]
  }
}
