import { BrowserWindow, ipcMain } from 'electron'
import { readJsonFile, writeJsonFile, APPS_FILE, CATEGORIES_FILE, CONFIG_FILE, getDefaultConfig } from '../config'
import type { Config, AppsData, CategoriesData } from '../../shared/types'
import { sanitizeAppsData, sanitizeCategoriesData, sanitizeConfig } from '../validation'

export function registerFileHandlers(applyGlobalShortcuts?: (config: Config) => boolean) {
  ipcMain.handle('get-config', () => {
    const defaults = getDefaultConfig()
    const config: Config = readJsonFile<Config>(CONFIG_FILE, defaults)
    // 向后兼容：确保所有新字段都有默认值
    if (!config.searchEngines) {
      config.searchEngines = defaults.searchEngines
    } else {
      for (const [key, val] of Object.entries(defaults.searchEngines)) {
        const k = key as keyof typeof defaults.searchEngines
        if (!config.searchEngines[k]) {
          config.searchEngines[k] = val
        }
      }
    }
    if (!config.windowSize) config.windowSize = defaults.windowSize
    if (!config.hotkey) config.hotkey = defaults.hotkey
    if (!config.searchHotkey) config.searchHotkey = defaults.searchHotkey
    if (!config.ui) config.ui = defaults.ui
    config.ui = { ...defaults.ui, ...config.ui }
    if (config.autoStart === undefined) config.autoStart = defaults.autoStart
    if (!config.defaultEngine) config.defaultEngine = defaults.defaultEngine
    if (!config.autoCategoryRules) config.autoCategoryRules = defaults.autoCategoryRules
    if (!config.quickActions) config.quickActions = defaults.quickActions
    if (config.onboardingCompleted === undefined) config.onboardingCompleted = defaults.onboardingCompleted
    return config
  })

  ipcMain.handle('save-config', (_, config: unknown) => {
    const defaults = getDefaultConfig()
    const sanitized = sanitizeConfig(config, defaults)
    if (!sanitized) return false
    const previous = readJsonFile<Config>(CONFIG_FILE, defaults)
    const hotkeysChanged = previous.hotkey !== sanitized.hotkey || previous.searchHotkey !== sanitized.searchHotkey
    if (hotkeysChanged && applyGlobalShortcuts && !applyGlobalShortcuts(sanitized)) return false
    const success = writeJsonFile(CONFIG_FILE, sanitized)
    if (!success && hotkeysChanged && applyGlobalShortcuts) applyGlobalShortcuts(previous)
    return success
  })

  ipcMain.handle('get-apps', () => {
    const data = readJsonFile<AppsData>(APPS_FILE, { apps: [] })
    // 向后兼容：确保每个应用都有必需字段
    data.apps = (data.apps || []).map((app: any) => ({
      id: app.id || '',
      name: app.name || '',
      path: app.path || '',
      icon: app.icon || '',
      categoryId: app.categoryId || '',
      subcategoryId: app.subcategoryId || null,
      pinyin: app.pinyin || '',
      firstLetter: app.firstLetter || '',
      type: app.type || 'app',
      aliases: Array.isArray(app.aliases) ? app.aliases : [],
      launchCount: Number.isFinite(app.launchCount) ? app.launchCount : 0,
      lastOpenedAt: Number.isFinite(app.lastOpenedAt) ? app.lastOpenedAt : 0,
      hidden: !!app.hidden
    }))
    return data
  })

  ipcMain.handle('save-apps', (_, data: unknown) => {
    const sanitized = sanitizeAppsData(data)
    if (!sanitized) return false
    const success = writeJsonFile(APPS_FILE, sanitized)
    if (success) {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('apps-updated')
        }
      })
    }
    return success
  })

  ipcMain.handle('get-categories', () => {
    const data = readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [] })
    if (!data.subcategories) data.subcategories = []
    return data
  })

  ipcMain.handle('save-categories', (_, data: unknown) => {
    const sanitized = sanitizeCategoriesData(data)
    if (!sanitized) return false
    return writeJsonFile(CATEGORIES_FILE, sanitized)
  })
}
