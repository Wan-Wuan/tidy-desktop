import { BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  readJsonFile,
  writeJsonFile,
  APPS_FILE,
  CATEGORIES_FILE,
  COLLECTIONS_FILE,
  CONFIG_FILE,
  CONFIG_DIR,
  getDefaultConfig,
  getCorruptedFiles,
  isDataFileCorrupted,
  listCorruptBackups,
  restoreCorruptBackup
} from '../config'
import type { AppItem, AppItemType, Config, AppsData, CategoriesData, CollectionsData } from '../../shared/types'
import { APP_ITEM_TYPES, sanitizeAppsData, sanitizeCategoriesData, sanitizeCollectionsData, sanitizeConfig } from '../validation'
import { assertSender } from '../ipcGuard'
import { invalidatePathResolveContext } from '../pathResolver'

export function registerFileHandlers(applyGlobalShortcuts?: (config: Config) => boolean) {
  ipcMain.handle('get-config', (event) => {
    if (!assertSender(event)) return getDefaultConfig()
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
    if (config.hotkeyDefaultMigrated === undefined) config.hotkeyDefaultMigrated = false
    return config
  })

  ipcMain.handle('save-config', (event, config: unknown) => {
    if (!assertSender(event)) return false
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
    // envVars / portableRoot 可能变了，路径解析上下文必须跟着失效
    if (success) invalidatePathResolveContext()
    return success
  })

  ipcMain.handle('get-apps', (event) => {
    if (!assertSender(event)) return { apps: [] }
    const data = readJsonFile<AppsData>(APPS_FILE, { apps: [] })
    /* 向后兼容：磁盘上的数据可能来自旧版本或被外部改过，逐字段兜底。
       这里刻意不用 any —— 走 Record<string, unknown> + 类型守卫，改动时能被编译器兜住。 */
    const rawApps: unknown[] = Array.isArray(data.apps) ? data.apps : []
    data.apps = rawApps.map((value): AppItem => {
      const item = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
      const type = item.type
      return {
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof item.name === 'string' ? item.name : '',
        path: typeof item.path === 'string' ? item.path : '',
        icon: typeof item.icon === 'string' ? item.icon : '',
        categoryId: typeof item.categoryId === 'string' ? item.categoryId : '',
        subcategoryId: typeof item.subcategoryId === 'string' ? item.subcategoryId : null,
        pinyin: typeof item.pinyin === 'string' ? item.pinyin : '',
        firstLetter: typeof item.firstLetter === 'string' ? item.firstLetter : '',
        // ⚠️ 新增项目类型必须同步这个白名单，否则旧版本写下的数据会被读成 'app'
        type: APP_ITEM_TYPES.has(type as AppItemType) ? type as AppItemType : 'app',
        aliases: Array.isArray(item.aliases)
          ? item.aliases.filter((alias): alias is string => typeof alias === 'string')
          : [],
        launchCount: typeof item.launchCount === 'number' && Number.isFinite(item.launchCount) ? item.launchCount : 0,
        lastOpenedAt: typeof item.lastOpenedAt === 'number' && Number.isFinite(item.lastOpenedAt) ? item.lastOpenedAt : 0,
        hidden: item.hidden === true,
        args: typeof item.args === 'string' ? item.args : '',
        workingDir: typeof item.workingDir === 'string' ? item.workingDir : '',
        browserId: typeof item.browserId === 'string' ? item.browserId : null,
        /* 命令行模板：命令缺失就整体收敛成 null（"走系统默认方式"），
           留一个半截对象只会在执行时失败。 */
        openWith: (() => {
          const raw = item.openWith
          if (typeof raw !== 'object' || raw === null) return null
          const record = raw as Record<string, unknown>
          const command = typeof record.command === 'string' ? record.command.trim() : ''
          if (!command) return null
          return {
            command,
            argsBefore: typeof record.argsBefore === 'string' ? record.argsBefore : '',
            argsAfter: typeof record.argsAfter === 'string' ? record.argsAfter : ''
          }
        })(),
        noteContent: typeof item.noteContent === 'string' ? item.noteContent : '',
        noteKind: item.noteKind === 'todo' ? 'todo' : 'text',
        /* 待办条目：只保留形状完整的。id 与 text 缺任何一个，这条在界面上
           既显示不出内容、也点不动（key 与 toggle 目标都是 id），留着只会让人困惑。
           正常路径下 validation 的 sanitizeTodoItems 已保证两者齐全。 */
        todoItems: Array.isArray(item.todoItems)
          ? item.todoItems
            .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
            .map(entry => ({
              id: typeof entry.id === 'string' ? entry.id : '',
              text: typeof entry.text === 'string' ? entry.text : '',
              done: entry.done === true
            }))
            .filter(entry => entry.id !== '' && entry.text.trim() !== '')
          : [],
        memberIds: Array.isArray(item.memberIds)
          ? item.memberIds.filter((id): id is string => typeof id === 'string')
          : [],
        confirmBeforeLaunch: item.confirmBeforeLaunch === true,
        sourceFolder: typeof item.sourceFolder === 'string' ? item.sourceFolder : '',
        isSynced: item.isSynced === true,
        hiddenInFolder: item.hiddenInFolder === true
      }
    })
    return data
  })

  ipcMain.handle('save-apps', (event, data: unknown) => {
    if (!assertSender(event)) return false
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

  ipcMain.handle('get-categories', (event) => {
    if (!assertSender(event)) return { categories: [], subcategories: [] }
    const data = readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [] })
    if (!data.subcategories) data.subcategories = []
    return data
  })

  ipcMain.handle('save-categories', (event, data: unknown) => {
    if (!assertSender(event)) return false
    if (isDataFileCorrupted(CATEGORIES_FILE)) return false
    const sanitized = sanitizeCategoriesData(data)
    if (!sanitized) return false
    return writeJsonFile(CATEGORIES_FILE, sanitized)
  })

  ipcMain.handle('get-collections', (event) => {
    if (!assertSender(event)) return { collections: [] }
    const data = readJsonFile<CollectionsData>(COLLECTIONS_FILE, { collections: [] })
    if (!Array.isArray(data.collections)) data.collections = []
    return data
  })

  ipcMain.handle('save-collections', (event, data: unknown) => {
    if (!assertSender(event)) return false
    if (isDataFileCorrupted(COLLECTIONS_FILE)) return false
    const sanitized = sanitizeCollectionsData(data)
    if (!sanitized) return false
    return writeJsonFile(COLLECTIONS_FILE, sanitized)
  })

  /**
   * 数据健康状态。渲染层在启动时查询，若发现损坏留档就明确告知用户，
   * 而不是让"数据看起来空了、其实备份还在磁盘上"这种情况悄悄发生。
   */
  ipcMain.handle('get-data-health', (event) => {
    if (!assertSender(event)) return { corruptedNow: [], backups: [] }
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

  ipcMain.handle('restore-corrupt-backup', (event, payload: unknown) => {
    if (!assertSender(event)) return false
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

  ipcMain.handle('open-corrupt-backups-directory', async (event) => {
    if (!assertSender(event)) return false
    const error = await shell.openPath(CONFIG_DIR)
    return !error
  })
}
