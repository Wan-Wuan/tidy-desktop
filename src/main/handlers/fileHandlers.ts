import { BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  readJsonFile,
  writeJsonFile,
  APPS_FILE,
  CATEGORIES_FILE,
  CONFIG_FILE,
  CONFIG_DIR,
  getDefaultConfig,
  getCorruptedFiles,
  isDataFileCorrupted,
  listCorruptBackups,
  restoreCorruptBackup
} from '../config'
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
    if (!config.closeAction) config.closeAction = defaults.closeAction
    if (config.lastActiveCategoryId === undefined) config.lastActiveCategoryId = defaults.lastActiveCategoryId ?? null
    if (config.trayNotified === undefined) config.trayNotified = false
    if (config.searchAutoHideOnBlur === undefined) config.searchAutoHideOnBlur = false
    if (config.startMinimizedToTray === undefined) config.startMinimizedToTray = false
    if (config.mainAutoHideOnBlur === undefined) config.mainAutoHideOnBlur = false
    return config
  })

  ipcMain.handle('save-config', (_, config: unknown) => {
    // 文件损坏时拒绝写入：当前内存里的 config 是解析失败后的默认值，
    // 写回去就等于用默认值覆盖用户配置
    if (isDataFileCorrupted(CONFIG_FILE)) return false
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
    // 同 save-config：损坏的 apps.json 解析出来是空列表，
    // 一旦写回去用户的整个应用库就真没了
    if (isDataFileCorrupted(APPS_FILE)) return false
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
    if (isDataFileCorrupted(CATEGORIES_FILE)) return false
    const sanitized = sanitizeCategoriesData(data)
    if (!sanitized) return false
    return writeJsonFile(CATEGORIES_FILE, sanitized)
  })

  /**
   * 数据健康状态。渲染层在启动时查询，若发现损坏留档就明确告知用户，
   * 而不是让"数据看起来空了、其实备份还在磁盘上"这种情况悄悄发生。
   */
  ipcMain.handle('get-data-health', () => {
    const backups = listCorruptBackups(CONFIG_DIR)
    return {
      corruptedNow: getCorruptedFiles(),
      backups: backups.map(b => ({
        fileName: b.fileName,
        backupPath: b.backupPath,
        targetFile: b.targetFile,
        size: b.size,
        createdAt: b.createdAt
      }))
    }
  })

  ipcMain.handle('restore-corrupt-backup', (_, payload: unknown) => {
    if (typeof payload !== 'object' || payload === null) return false
    const { backupPath, targetFile } = payload as { backupPath?: unknown; targetFile?: unknown }
    if (typeof backupPath !== 'string' || typeof targetFile !== 'string') return false
    // 只允许操作数据目录内的文件，避免这个入口被当成任意文件写入
    const resolvedDir = path.resolve(CONFIG_DIR)
    const resolvedBackup = path.resolve(backupPath)
    const resolvedTarget = path.resolve(targetFile)
    if (path.dirname(resolvedBackup) !== resolvedDir) return false
    if (path.dirname(resolvedTarget) !== resolvedDir) return false
    if (!fs.existsSync(resolvedBackup)) return false
    return restoreCorruptBackup(resolvedBackup, resolvedTarget)
  })

  ipcMain.handle('open-corrupt-backups-directory', async () => {
    const error = await shell.openPath(CONFIG_DIR)
    return !error
  })
}
