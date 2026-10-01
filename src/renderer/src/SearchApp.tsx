import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, Fragment } from 'react'
import { AppItem, Config, Category, UiCommand, FileSearchResult, FileSearchSource, FolderSyncSnapshot } from '../../shared/types'
import { getFolderSuggestion, checkSearchEngine } from '../../shared/utils'
import { hasDisplayableIcon } from './utils/iconUtils'
import { applyAccentScale, generateAccentScale } from './utils/colorScale'
import { matchesTerm, getSearchScore, compactSearchText } from './utils/searchScore'
import { launchAppTarget, launchAppAsAdmin } from './utils/launchApp'
import { persistApps, setPersistNotifier } from './utils/persist'
import { flattenSyncedApps } from './utils/syncedApps'
import { isSyncedAppId, parseSyncedAppId, syncedAppId } from './utils/syncedId'

interface SearchEngineInfo {
  key: string
  name: string
  url: string
}

type SearchResult = Omit<AppItem, 'type'> & {
  type?: AppItem['type'] | 'action' | 'file'
  actionCommand?: string
  uiCommand?: UiCommand
  /** 本机文件搜索命中项：是否为目录（用于图标与打开方式判断） */
  isDir?: boolean
}

/** 结果来源分组：命令（> 触发的内置/快捷命令）、应用（含文件夹/链接等）、文件（本机文件搜索） */
type ResultSource = 'command' | 'app' | 'file'

const SOURCE_TITLES: Record<ResultSource, string> = {
  command: '命令',
  app: '应用',
  file: '文件'
}

/** 文件结果的实际来源标签，拼在「文件」分组标题后面。本机文件搜索只走 Everything。 */
const FILE_SOURCE_LABELS: Record<FileSearchSource, string> = {
  everything: 'Everything',
  none: ''
}

function resultSource(app: SearchResult): ResultSource {
  if (app.type === 'action') return 'command'
  if (app.type === 'file') return 'file'
  return 'app'
}

interface BuiltInCommand {
  id: string
  name: string
  hint: string
  icon: string
  command: UiCommand
  keywords: string[]
}

const MAX_DISPLAY = 6
// 结果列表的最大高度由 CSS 决定，窗口高度再由 useLayoutEffect 实测 .search-container
// 后同步。以下三个常量仅用于计算 .search-results 的 max-height，不参与任何窗口高度计算——
// 这样"渲染细节"与"窗口控制"彻底解耦，任何 padding/font/border 变动都不会导致圆角被裁。
const RESULT_ITEM_HEIGHT = 51
const RESULT_ITEM_GAP = 4
const RESULTS_PADDING_Y = 8

const BUILT_IN_COMMANDS: BuiltInCommand[] = [
  {
    id: 'open-organizer',
    name: '打开整理中心',
    hint: '查看健康分、建议队列和维护工具',
    icon: '2.0',
    command: 'open-organizer',
    keywords: ['整理', '整理中心', 'organize', 'organizer', '2.0', '20']
  },
  {
    id: 'health-check',
    name: '数据健康检查',
    hint: '扫描失效路径、缺失图标和重复项',
    icon: 'OK',
    command: 'health-check',
    keywords: ['健康', '检查', '扫描', 'health', 'check']
  },
  {
    id: 'refresh-icons',
    name: '刷新全部图标',
    hint: '重新提取应用图标并同步到搜索框',
    icon: '↻',
    command: 'refresh-icons',
    keywords: ['刷新', '图标', 'icon', 'icons', 'refresh']
  },
  {
    id: 'auto-categorize',
    name: '自动分类',
    hint: '按规则和名称重新整理应用分类',
    icon: '#',
    command: 'auto-categorize',
    keywords: ['分类', '自动分类', 'category', 'categorize']
  },
  {
    id: 'import-shortcuts',
    name: '导入快捷方式',
    hint: '从桌面和开始菜单导入新项目',
    icon: '+',
    command: 'import-shortcuts',
    keywords: ['导入', '快捷方式', 'shortcut', 'shortcuts', 'import']
  },
  {
    id: 'restore-hidden',
    name: '恢复隐藏项',
    hint: '让搜索中隐藏的项目重新出现',
    icon: '<',
    command: 'restore-hidden',
    keywords: ['恢复', '隐藏', 'hidden', 'restore']
  },
  {
    id: 'export-backup',
    name: '导出备份',
    hint: '备份当前应用、分类和配置',
    icon: '↓',
    command: 'export-backup',
    keywords: ['备份', '导出', 'backup', 'export']
  }
]

function SearchApp() {
  const [query, setQuery] = useState('')
  const [apps, setApps] = useState<AppItem[]>([])
  /* 关联文件夹同步出来的条目（内存态，不进 apps.json）。搜索窗是独立文档，
     主窗口那份状态过不来，只能自己按 folderCache.json + 分类绑定关系现算一份。 */
  const [syncedApps, setSyncedApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [activeEngine, setActiveEngine] = useState<SearchEngineInfo | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef('')
  const resultsRef = useRef<SearchResult[]>([])
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const appsRef = useRef<AppItem[]>([])
  const syncedAppsRef = useRef<AppItem[]>([])
  /* 项目数据是否已经成功拉过一次。
     用途见 `loadData` 的 `skipApps` 选项：唤出时没必要重复拉 1.58MB 的 apps.json。 */
  const appsLoadedRef = useRef(false)
  const isActiveRef = useRef(false)
  const dataReloadTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 本机文件搜索：请求序号（防竞态）、防抖计时器、加载态（避免空窗期闪烁"无结果"）
  const searchTokenRef = useRef(0)
  const fileSearchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  // 文件结果实际来自哪（本机文件搜索只走 Everything）。用于在分组标题上标明来源，
  // 让用户能确认「到底连没连上我的 Everything」，而不是猜。
  const [fileSource, setFileSource] = useState<FileSearchSource>('none')
  /* 挂载期 effect（[] deps）要能触发"整体复位"，而 resetAll 是 useCallback（reactive）。
     用 ref 转发最新实现，既避免把它塞进空依赖数组，也保证调用的是当前闭包。 */
  const resetAllRef = useRef<() => void>(() => {})
  // 0 表示"尚未测量"，首次 useLayoutEffect 会填入实测值并同步窗口
  const currentHeightRef = useRef(0)
  /* 每收到一次「重置」就 +1，用来**强制**跑一遍高度实测。
     为什么需要：重置后容器往往只是"从有结果变回只有输入框"，若此前已经在隐藏时
     重置过一次，这次重置就不再产生任何布局变化，`ResizeObserver` 不会回调——
     于是窗口停留在上一次的高度（多出一块透明区域）。把 tick 塞进那个 effect 的
     deps 里，就能在 React 提交后保证测一次。 */
  const [heightSyncTick, setHeightSyncTick] = useState(0)

  /* 落盘失败提示：搜索窗口没有 App 层的 ToastStack，这里自带一个极简提示条。
     持久化模块（utils/persist）的 notifier 是入口级单例——两个 HTML 入口各自有
     独立的 JS 上下文，互不冲突，所以本窗口挂载时注入自己的实现、卸载时归还。 */
  const [persistError, setPersistError] = useState<string | null>(null)
  const persistErrorTimerRef = useRef<number | null>(null)
  useEffect(() => {
    setPersistNotifier((message) => {
      setPersistError(message)
      if (persistErrorTimerRef.current) window.clearTimeout(persistErrorTimerRef.current)
      persistErrorTimerRef.current = window.setTimeout(() => {
        persistErrorTimerRef.current = null
        setPersistError(null)
      }, 4000)
    })
    return () => {
      setPersistNotifier(null)
      if (persistErrorTimerRef.current) {
        window.clearTimeout(persistErrorTimerRef.current)
        persistErrorTimerRef.current = null
      }
    }
  }, [])

  /* 外观个性化（P2）：字体族与字号缩放跟主窗口保持一致。
     搜索窗是**独立文档**——主窗口写在 documentElement 上的 CSS 变量不会自动带过来，
     必须在这里自己应用一次，否则"全局字体"在搜索框里不生效。 */
  useEffect(() => {
    const root = document.documentElement
    const family = config?.ui?.fontFamily?.trim()
    root.style.setProperty(
      '--ui-font',
      family
        ? `'${family}', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif`
        : "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    )
    const scale = config?.ui?.uiScale
    root.style.fontSize = scale && scale !== 1 ? `${(16 * scale).toFixed(2)}px` : ''
  }, [config?.ui?.fontFamily, config?.ui?.uiScale])

  useEffect(() => {
    loadData()
    // 窗口高度不再手算：由下方 useLayoutEffect 实测 .search-container 后同步
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)
    const removeBlur = window.electronAPI.onBlur(() => {
      if (configRef.current?.searchAutoHideOnBlur) {
        window.electronAPI.hideSearchWindow()
      }
    })

    /* 唤出 / 隐藏都会收到这一条。
       主进程在 `win.on('hide')` 时先发一次——那时窗口已经不可见，把查询、结果、
       高度一起复位，用户下次唤出看到的就是"本来就该是这样"的空搜索框，
       而不是"先闪一下上次的结果、再跳一下高度"。
       唤出时（`showSearchWindow` 的 reveal）仍会补发一次，作为兜底：
       内容已是空的，这一步退化成一次廉价的重渲染。 */
    const removeReset = window.electronAPI.onResetSearch(() => {
      if (dataReloadTimerRef.current) clearTimeout(dataReloadTimerRef.current)
      resetAllRef.current()
      // 强制在提交后重测一次高度，避免"重置没产生布局变化 → 窗口停在旧高度"
      setHeightSyncTick(tick => tick + 1)
      // 先聚焦再拉数据：别让输入框的可用时机被 IPC 往返拖住
      setTimeout(() => inputRef.current?.focus(), 50)
      /* 项目数据靠 `apps-updated` 广播保鲜（见 loadData 注释），
         这里只补拉配置 / 分类 / 关联文件夹缓存这几份小数据。 */
      void loadData({ skipApps: appsLoadedRef.current })
    })

    const removeAppsUpdated = window.electronAPI.onAppsUpdated(() => {
      if (dataReloadTimerRef.current) clearTimeout(dataReloadTimerRef.current)
      dataReloadTimerRef.current = setTimeout(() => {
        dataReloadTimerRef.current = null
        loadData()
      }, 180)
    })

    return () => {
      clearTimeout(focusTimer)
      if (dataReloadTimerRef.current) clearTimeout(dataReloadTimerRef.current)
      if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current)
      removeBlur()
      removeReset()
      removeAppsUpdated()
    }
  }, [])

  // activeIndex 变化时滚动到可视区域
  useLayoutEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return

    const item = container.querySelector<HTMLElement>('.search-result-item.active')
    if (!item) return

    const style = window.getComputedStyle(container)
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    const containerRect = container.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    const visibleTop = containerRect.top + paddingTop
    const visibleBottom = containerRect.bottom - paddingBottom

    if (itemRect.top < visibleTop) {
      container.scrollTop += itemRect.top - visibleTop
    } else if (itemRect.bottom > visibleBottom) {
      container.scrollTop += itemRect.bottom - visibleBottom
    }
  }, [activeIndex, results])

  /* 窗口高度唯一来源：实时测量 .search-container 实际渲染高度并同步窗口。
     ⚠️ 必须用 ResizeObserver 持续监听，**不能**只在 deps 变化时测一次：
     容器高度还会因 filesLoading 结束、「无结果」占位显隐、分组标题出现、
     图标/字体异步加载等原因变化，这些都挂不进 deps。漏测一次 → 窗口高度偏小 →
     overflow:hidden 的容器底部（含 26px 圆角）被窗口边界裁掉，
     表现就是「搜索框圆角显示异常 / 底部被切平」。 */
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const sync = () => {
      const height = Math.ceil(container.getBoundingClientRect().height)
      if (height > 0 && height !== currentHeightRef.current) {
        currentHeightRef.current = height
        window.electronAPI.resizeSearchWindow(height)
      }
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(container)
    return () => observer.disconnect()
    // heightSyncTick：重置时强制重跑一次（原因见 heightSyncTick 的声明处）
  }, [heightSyncTick])

  const configRef = useRef(config)
  configRef.current = config

  const searchTheme = config?.ui?.searchTheme || 'dark'
  const searchOpacity = config?.ui?.searchOpacity || 0.72
  const hintsVisible = config?.ui?.searchHintsVisible !== false

  // 主题色（accent）：搜索窗是独立 document，需要自行注入
  useEffect(() => {
    const accent = config?.ui?.accentColor?.trim()
    applyAccentScale(accent ? generateAccentScale(accent) : null, document.documentElement)
  }, [config?.ui?.accentColor])

  /**
   * 拉取搜索窗需要的全部数据。
   *
   * ## 为什么要能跳过 apps
   *
   * `apps.json` 实测 1.58MB（94% 是图标 base64），一次 `get-apps` 要走
   * 主进程读盘 + 结构化克隆序列化 + 渲染层反序列化，再触发一轮 `setApps` 重渲染。
   * 而搜索窗**每次唤出**都会走一次 `reset-search`——把它挂在唤出路径上纯属浪费。
   *
   * 项目数据的保鲜由主进程的 `apps-updated` 广播负责（`save-apps` 发给所有窗口），
   * 所以只要成功拉过一次，之后的唤出就不必再拉。首次唤出仍会拉（`appsLoadedRef` 为 false），
   * 这样即便挂载那次请求失败也还能自愈。
   *
   * ⚠️ 配置 / 分类 / 关联文件夹缓存**没有**对应的广播，只能每次重拉——
   * 这三份都很小，代价可忽略，而漏掉它们会让「设置页改完主题，搜索框还是旧样子」。
   */
  const loadData = async (options: { skipApps?: boolean } = {}) => {
    try {
      const [configData, appsData, categoriesData] = await Promise.all([
        window.electronAPI.getConfig(),
        options.skipApps ? Promise.resolve(null) : window.electronAPI.getApps(),
        window.electronAPI.getCategories()
      ])
      const loadedCategories: Category[] = categoriesData?.categories || []
      if (appsData) {
        const loadedApps = appsData.apps || []
        appsRef.current = loadedApps
        appsLoadedRef.current = true
        setApps(loadedApps)
        setResults(prev => {
          if (prev.length === 0) return prev
          const appsById = new Map(loadedApps.map(app => [app.id, app]))
          const updated = prev.map(result => {
            if (result.id.startsWith('__') || result.type === 'action') return result
            const fresh = appsById.get(result.id)
            return fresh ? { ...result, ...fresh } : result
          })
          resultsRef.current = updated
          return updated
        })
      }
      setConfig(configData)
      setCategories(loadedCategories)

      /* 关联文件夹的同步条目**不落 apps.json**，主窗口那份只活在它自己的内存里，
         所以搜索窗必须自己去主进程取一份快照再铺平——否则「主界面看得到、
         搜索框搜不到」。读的是 folderCache.json，不触发扫盘。
         图标拿不到（那份缓存同样只在主窗口内存里），退回按类型显示占位图标，
         与「文件」分组里的结果表现一致。 */
      let snapshots: Record<string, FolderSyncSnapshot> = {}
      try {
        snapshots = (await window.electronAPI.getFolderSyncCache()) || {}
      } catch {
        // 旧版 preload / 主进程异常：当作"没有关联文件夹"，不影响其它结果
      }
      const synced = flattenSyncedApps({ categories: loadedCategories, snapshots })
      syncedAppsRef.current = synced
      setSyncedApps(synced)
    } catch (err) {
      console.error('SearchApp: loadData failed:', err)
    }
  }

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return ''
    const cat = categories.find(c => c.id === categoryId)
    return cat ? cat.name : ''
  }


  const getQuickActionResults = useCallback((searchQuery: string): SearchResult[] => {
    const normalized = searchQuery.trim().toLowerCase()
    if (!normalized.startsWith('>')) return []
    return (config?.quickActions || [])
      .filter(action => action.enabled && (
        action.key.toLowerCase().includes(normalized) ||
        action.name.toLowerCase().includes(normalized.slice(1))
      ))
      .map(action => ({
        id: `__action_${action.command}`,
        name: action.name,
        path: action.key,
        icon: '',
        categoryId: null,
        subcategoryId: null,
        pinyin: '',
        firstLetter: '',
        type: 'action',
        actionCommand: action.command
      }))
  }, [config])

  const getBuiltInCommandResults = useCallback((searchQuery: string): SearchResult[] => {
    const raw = searchQuery.trim()
    const normalized = raw.toLowerCase()
    const commandMode = normalized.startsWith('>')
    if (!commandMode) return []

    const term = normalized.slice(1).trim()
    const compactTerm = compactSearchText(term)

    return BUILT_IN_COMMANDS
      .map<SearchResult | null>(command => {
        const searchText = compactSearchText([
          command.name,
          command.hint,
          command.command,
          ...command.keywords
        ].join(' '))
        const keywordHit = command.keywords.some(keyword => compactSearchText(keyword).includes(compactTerm))
        const nameHit = searchText.includes(compactTerm)
        const commandModeFallback = commandMode && compactTerm.length === 0
        if (!commandModeFallback && !keywordHit && !nameHit) return null
        return {
          id: `__ui_${command.id}`,
          name: command.name,
          path: command.hint,
          icon: command.icon,
          categoryId: null,
          subcategoryId: null,
          pinyin: '',
          firstLetter: '',
          type: 'action' as const,
          uiCommand: command.command
        }
      })
      .filter((item): item is SearchResult => !!item)
  }, [])

  const filterApps = useCallback((searchQuery: string): SearchResult[] => {
    const actionResults = [...getBuiltInCommandResults(searchQuery), ...getQuickActionResults(searchQuery)]
    if (actionResults.length > 0) return actionResults

    const terms = searchQuery.toLowerCase().trim().split(/\s+/).filter(term => compactSearchText(term))
    if (terms.length === 0) return []
    /* 关联文件夹的同步条目和手工项目**一起参与过滤与排序**：对用户来说它们都是
       "我放进去的东西"，凭什么一个能搜到一个搜不到。 */
    const candidates = syncedApps.length > 0 ? [...apps, ...syncedApps] : apps
    const matched = candidates.filter(app => {
      if (app.hidden) return false
      return terms.every(term => matchesTerm(app, term))
    }).sort((a, b) => getSearchScore(b, terms) - getSearchScore(a, terms))

    const suggestion = getFolderSuggestion(searchQuery)
    if (suggestion && matched.length === 0) {
      return [suggestion]
    }
    if (suggestion) {
      return [suggestion, ...matched]
    }

    return matched
  }, [apps, syncedApps, getBuiltInCommandResults, getQuickActionResults])

  /* 统一的搜索入口：先同步给出命令/应用结果（即时反馈），再以防抖方式异步叠加
     本机文件搜索结果。searchTokenRef 用于丢弃过期请求，避免快速输入时旧结果覆盖新结果。
     ⚠️ 只要非命令模式（>）、非搜索引擎激活就尝试搜文件；有没有 Everything 由主进程判定
     （它读 ini 拿端口，没有就秒回空结果）。渲染层不做任何门禁——装了 Everything 就能搜全盘。 */
  const runSearch = useCallback(async (value: string) => {
    const token = ++searchTokenRef.current

    const appResults = filterApps(value)
    if (token !== searchTokenRef.current) return
    setResults(appResults)
    resultsRef.current = appResults
    setActiveIndex(0)

    const trimmed = value.trim()
    const canFileSearch = !activeEngine && !value.startsWith('>') && trimmed.length > 0

    if (!canFileSearch) {
      setFilesLoading(false)
      setFileSource('none')
      if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current)
      return
    }

    // 已有应用结果时不必显示"无结果"占位，等文件结果回来；无应用结果则进入加载态
    setFilesLoading(true)
    if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current)
    fileSearchTimerRef.current = setTimeout(async () => {
      if (token !== searchTokenRef.current) return
      try {
        // limit 放大到 60：同名文件可能散落在多块磁盘上，过小的 limit 会在渲染层
        // 二次截断（主进程 handler 已放宽到 300），导致部分磁盘的同名结果整批看不到。
        const response = await window.electronAPI.searchFiles({ query: trimmed, limit: 60 })
        if (token !== searchTokenRef.current) return
        setFileSource(response.source)
        const fileResults: SearchResult[] = response.results.map((f: FileSearchResult) => ({
          id: `__file_${f.path}`,
          name: f.name,
          path: f.path,
          icon: '',
          categoryId: null,
          subcategoryId: null,
          pinyin: '',
          firstLetter: '',
          type: 'file',
          isDir: f.isDir
        }))
        /* 只保留非文件项（理论上此时已无文件项），再追加本次文件结果。
           ⚠️ 按 id（`__file_${完整路径}`）去重：对同一条命中可能返回大小写/分隔符略有
           差异的路径，直接 concat 会渲染出重复行；React 也会因重复 key 复用节点导致互相覆盖。
           注意 id 用的是**完整路径**而非文件名——
           多磁盘同名文件路径不同，必须全部保留，绝不能按文件名去重。 */
        const base = resultsRef.current.filter(r => r.type !== 'file')
        const seen = new Set(base.map(r => r.id))
        const merged = [...base]
        for (const fr of fileResults) {
          if (seen.has(fr.id)) continue
          seen.add(fr.id)
          merged.push(fr)
        }
        setResults(merged)
        resultsRef.current = merged
      } catch (err) {
        console.error('SearchApp: searchFiles failed:', err)
      } finally {
        if (token === searchTokenRef.current) setFilesLoading(false)
      }
    }, 150)
  }, [activeEngine, filterApps])

  /* 取消进行中的文件搜索：递增 token 让在途请求的 `token !== searchTokenRef.current`
     分支直接返回（否则清空输入/切换引擎后，旧请求仍会把过期文件结果写回列表），
     同时清掉防抖计时器与加载态。凡是不走 runSearch 的"清空结果"路径都要调用它。 */
  const cancelFileSearch = useCallback(() => {
    searchTokenRef.current++
    if (fileSearchTimerRef.current) {
      clearTimeout(fileSearchTimerRef.current)
      fileSearchTimerRef.current = null
    }
    setFilesLoading(false)
    setFileSource('none')
  }, [])

  /* 把某个应用项"定位"回主界面：切到它所属分类、滚动并高亮（见 App.tsx 的 onLocateApp）。
     文件/命令/虚拟项（id 以 __ 开头）无法定位，直接忽略。定义见下方 getCurrentResult 之后。 */

  const getDefaultSearchEngine = useCallback((): SearchEngineInfo | null => {
    const key = config?.defaultEngine || 'b'
    const engine = config?.searchEngines?.[key] || config?.searchEngines?.b
    return engine ? { key, name: engine.name, url: engine.url } : null
  }, [config])

  const resetAll = useCallback(() => {
    setQuery('')
    queryRef.current = ''
    setResults([])
    resultsRef.current = []
    setActiveEngine(null)
    setActiveIndex(0)
    // 取消在途文件搜索，否则窗口已重置后旧结果仍会写回列表
    cancelFileSearch()
    // 窗口高度由 useLayoutEffect 实测同步
  }, [cancelFileSearch])
  resetAllRef.current = resetAll

  /* 落盘走 utils/persist：失败时经本窗口注入的 notifier 弹提示条（见上方 persistError）。
     ⚠️ 一律从 appsRef.current 取基准，不要用渲染闭包里的 apps：本窗口会收到 apps-updated
     并异步 loadData，用旧闭包写回会把那次刷新（以及别的窗口的改动）整体覆盖掉。 */
  const recordLaunch = async (app: SearchResult) => {
    if (app.id.startsWith('__')) return
    /* 关联文件夹的同步项不在 apps.json 里，没有地方存启动次数。
       硬写一次等于把整份 apps.json 原样重写一遍，纯属多余。 */
    if (isSyncedAppId(app.id)) return
    const nextApps = appsRef.current.map(item => item.id === app.id
      ? { ...item, launchCount: (item.launchCount || 0) + 1, lastOpenedAt: Date.now() }
      : item
    )
    appsRef.current = nextApps
    setApps(nextApps)
    await persistApps(nextApps, '启动记录')
  }

  const handleOpenItem = async (app: SearchResult) => {
    isActiveRef.current = true
    let launched = true
    if (app.type === 'action' && app.actionCommand) {
      const completed = await window.electronAPI.runQuickAction(app.actionCommand)
      if (!completed) {
        isActiveRef.current = false
        inputRef.current?.focus()
        return
      }
      window.electronAPI.hideSearchWindow()
      resetAll()
    } else if (app.type === 'action' && app.uiCommand) {
      window.electronAPI.hideSearchWindow()
      resetAll()
      await window.electronAPI.runUiCommand(app.uiCommand)
    } else if (app.type === 'file') {
      window.electronAPI.hideSearchWindow()
      resetAll()
      launched = await window.electronAPI.openPath(app.path)
    } else {
      window.electronAPI.hideSearchWindow()
      resetAll()
      /* 从**最新数据**里取原始项目，而不是拿搜索结果快照去启动：
         SearchResult 只带搜索结果用得上的字段（名称/路径/图标/分类），
         而启动还需要 openWith / args / workingDir / browserId 这些字段。
         以前这里直接 `openApp(app.path)`，结果是"配了指定程序的项目
         在主界面点生效、在搜索窗点不生效"——同一张卡片两套行为。
         关联文件夹的同步项不在 apps.json 里，去 syncedApps 那份里找；
         它的 type 可能是 folder，交给 launchAppTarget 统一分派（别自己 if/else）。 */
      const source = appsRef.current.find(item => item.id === app.id)
        ?? syncedAppsRef.current.find(item => item.id === app.id)
      launched = source
        ? await launchAppTarget(source, config)
        : await window.electronAPI.openApp({ path: app.path })
    }
    // 打开失败（路径失效等）不计入启动统计
    if (launched) await recordLaunch(app)
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  // 记忆化：否则每次渲染都是新函数，会让依赖它的 useCallback（locateCurrentResult）失去意义
  const getCurrentResult = useCallback((): SearchResult | null => {
    return resultsRef.current[activeIndex] || resultsRef.current[0] || null
  }, [activeIndex])

  /* 把某个应用项"定位"回主界面：切到它所属分类、滚动并高亮（见 App.tsx 的 onLocateApp）。
     文件/命令/虚拟项（id 以 __ 开头）无法定位，直接忽略。 */
  const locateResult = useCallback(async (app: SearchResult | null) => {
    if (!app || app.id.startsWith('__') || app.type === 'action' || app.type === 'file') return
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    await window.electronAPI.requestLocateApp({ appId: app.id, categoryId: app.categoryId })
    setTimeout(() => { isActiveRef.current = false }, 200)
  }, [resetAll])

  const locateCurrentResult = useCallback(async () => {
    const app = getCurrentResult()
    await locateResult(app)
  }, [getCurrentResult, locateResult])

  /* 隐藏一条**关联文件夹同步项**。
     它不是 apps.json 里的项目，写 `hidden: true` 没有意义（那份数据里根本没有它），
     必须写回分类的 `linkFolder.hiddenPaths`——那是"用户意图"，才会在下次扫描后依然生效。
     写完之后顺手让主进程用新 hiddenPaths 重算一次快照（rescan:false，不扫盘）：
     主窗口订阅着 folder-sync-updated，这样它不用等下一次聚焦就能同步隐藏掉。 */
  const hideSyncedEntry = useCallback(async (categoryId: string, entryPath: string) => {
    try {
      const data = await window.electronAPI.getCategories()
      const allCategories = data?.categories || []
      const target = allCategories.find(category => category.id === categoryId)
      const link = target?.linkFolder
      if (!target || !link) return

      const hiddenPaths = Array.from(new Set([...(link.hiddenPaths ?? []), entryPath]))
      const saved = await window.electronAPI.saveCategories({
        categories: allCategories.map(category =>
          category.id === categoryId ? { ...category, linkFolder: { ...link, hiddenPaths } } : category
        ),
        subcategories: data?.subcategories || []
      })
      if (!saved) return

      /* ⚠️ `order` 必须原样带上：主进程把缺省当成空数组，
         空 order 会把用户自定义的排序整体抹平（全部落到"未列出"档）。 */
      await window.electronAPI.syncLinkFolder({
        categoryId,
        path: link.path,
        includeSubdirs: link.includeSubdirs,
        hiddenPaths,
        order: link.order ?? [],
        rescan: false
      })
    } catch {
      return
    }
    const remaining = syncedAppsRef.current.filter(item => item.id !== syncedAppId(categoryId, entryPath))
    syncedAppsRef.current = remaining
    setSyncedApps(remaining)
  }, [])

  const hideCurrentResult = async () => {
    const app = getCurrentResult()
    if (!app || app.id.startsWith('__')) return
    const synced = parseSyncedAppId(app.id)
    if (synced) {
      await hideSyncedEntry(synced.categoryId, synced.path)
    } else {
      const nextApps = appsRef.current.map(item => item.id === app.id ? { ...item, hidden: true } : item)
      appsRef.current = nextApps
      setApps(nextApps)
      await persistApps(nextApps, '隐藏')
    }
    const nextResults = resultsRef.current.filter(item => item.id !== app.id)
    resultsRef.current = nextResults
    setResults(nextResults)
    setActiveIndex(index => Math.max(0, Math.min(index, nextResults.length - 1)))
    // 窗口高度由 useLayoutEffect 实测同步
  }

  const openCurrentContainingFolder = async () => {
    const app = getCurrentResult()
    if (!app || app.type === 'action') return
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    await window.electronAPI.openContainingFolder(app.path)
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  const openCurrentAsAdmin = async () => {
    const app = getCurrentResult()
    if (!app || app.type !== 'app') return
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    // 同 handleOpenItem：拿最新数据里的原始项目，别用搜索结果快照（它没有 args / workingDir）
    const source = appsRef.current.find(item => item.id === app.id)
      ?? syncedAppsRef.current.find(item => item.id === app.id)
    const launched = source
      ? await launchAppAsAdmin(source)
      : await window.electronAPI.openAppAsAdmin({ path: app.path })
    if (launched) await recordLaunch(app)
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  const tryOpenPrefixedSearch = async (): Promise<boolean> => {
    const value = queryRef.current.trim()
    const [prefix, ...rest] = value.split(/\s+/)
    const term = rest.join(' ')
    if (!prefix || !term || !config?.searchEngines) return false
    const engineCheck = checkSearchEngine(`${prefix} `, config.searchEngines)
    if (!engineCheck.isEngine || !engineCheck.engine) return false
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    const url = engineCheck.engine.url + encodeURIComponent(term)
    resetAll()
    await window.electronAPI.openUrl(url)
    setTimeout(() => { isActiveRef.current = false }, 200)
    return true
  }

  const handleSearchRef = useRef<() => void>(() => {})
  handleSearchRef.current = async () => {
    if (activeEngine) {
      if (queryRef.current.trim()) {
        isActiveRef.current = true
        window.electronAPI.hideSearchWindow()
        const url = activeEngine.url + encodeURIComponent(queryRef.current.trim())
        resetAll()
        await window.electronAPI.openUrl(url)
        setTimeout(() => { isActiveRef.current = false }, 200)
      }
      return
    }
    if (resultsRef.current.length > 0) {
      const app = resultsRef.current[activeIndex] || resultsRef.current[0]
      await handleOpenItem(app)
    } else if (queryRef.current.trim()) {
      if (await tryOpenPrefixedSearch()) return
      const engine = getDefaultSearchEngine()
      if (!engine) return
      isActiveRef.current = true
      window.electronAPI.hideSearchWindow()
      const url = engine.url + encodeURIComponent(queryRef.current.trim())
      resetAll()
      await window.electronAPI.openUrl(url)
      setTimeout(() => { isActiveRef.current = false }, 200)
    }
  }

  const clearActiveEngine = useCallback(() => {
    const currentQuery = queryRef.current
    setActiveEngine(null)
    if (!currentQuery.trim()) {
      setResults([])
      resultsRef.current = []
      setActiveIndex(0)
      cancelFileSearch()
    } else {
      // 清掉引擎后，之前被引擎"占位"而没参与过滤的查询要重新走一次搜索（含文件）
      runSearch(currentQuery)
    }
    // 窗口高度由 useLayoutEffect 实测同步
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [runSearch, cancelFileSearch])

  const handleSearch = useCallback(() => handleSearchRef.current(), [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    queryRef.current = value

    if (value.endsWith(' ') && config?.searchEngines) {
      const engineCheck = checkSearchEngine(value, config.searchEngines)
      if (engineCheck.isEngine && engineCheck.engine) {
        setActiveEngine(engineCheck.engine)
        setQuery('')
        queryRef.current = ''
        setResults([])
        resultsRef.current = []
        setActiveIndex(0)
        // 引擎激活：输入内容发往引擎，本地结果（含在途文件搜索）一律作废
        cancelFileSearch()
        // 窗口高度由 useLayoutEffect 实测同步
        return
      }
    }

    if (activeEngine) {
      return
    }

    if (!value.trim()) {
      setResults([])
      resultsRef.current = []
      setActiveIndex(0)
      cancelFileSearch()
      // 窗口高度由 useLayoutEffect 实测同步
      return
    }

    // 同步给出命令/应用结果，并异步叠加本机文件搜索结果（带防抖 + 防竞态）
    runSearch(value)
  }, [activeEngine, config, runSearch, cancelFileSearch])

  /* 刻意不用 useCallback：它只作为输入框的 onKeyDown 使用，标识稳定没有收益；
     而它用到的 hideCurrentResult / openCurrentAsAdmin / openCurrentContainingFolder
     都是每次渲染重建的普通函数，塞进依赖数组只会把警告换成另一种形式。
     不记忆化反而更安全——每次按键用的都是最新一次渲染的闭包。 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // 有内容（结果或输入）时先清空，无内容时才隐藏
      if (resultsRef.current.length > 0 || queryRef.current || activeEngine) {
        setResults([])
        resultsRef.current = []
        setActiveIndex(0)
        setQuery('')
        queryRef.current = ''
        if (activeEngine) setActiveEngine(null)
        cancelFileSearch()
        // 窗口高度由 useLayoutEffect 实测同步
      } else {
        window.electronAPI.hideSearchWindow()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Ctrl+Shift+Enter：把当前应用项定位回主界面（切分类 + 滚动 + 高亮）
      if (e.ctrlKey && e.shiftKey) {
        locateCurrentResult()
      } else if (e.ctrlKey) {
        openCurrentContainingFolder()
      } else if (e.shiftKey) {
        openCurrentAsAdmin()
      } else {
        handleSearch()
      }
    } else if (e.key === 'Delete') {
      e.preventDefault()
      hideCurrentResult()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const len = resultsRef.current.length
      if (len > 0) {
        setActiveIndex(prev => {
          const next = prev + 1
          return next >= len ? 0 : next
        })
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const len = resultsRef.current.length
      if (len > 0) {
        setActiveIndex(prev => {
          const next = prev - 1
          return next < 0 ? len - 1 : next
        })
      }
    } else if (e.key === 'Backspace' && queryRef.current === '' && activeEngine) {
      // 复用 clearActiveEngine 统一处理状态清理；窗口高度由 useLayoutEffect 实测同步
      clearActiveEngine()
    }
  }

  const hasResults = results.length > 0

  // 结果列表最大高度：跟随 searchMaxResults 配置，窗口再由 useLayoutEffect 实测同步。
  // 这样既保留了"自定义显示条数"的能力，又让高度只有一个来源（CSS），不会与窗口高度打架。
  const maxDisplay = config?.ui?.searchMaxResults || MAX_DISPLAY
  const resultsMaxHeight =
    RESULTS_PADDING_Y * 2 + maxDisplay * RESULT_ITEM_HEIGHT + Math.max(0, maxDisplay - 1) * RESULT_ITEM_GAP

  // 按来源分组（命令 / 应用 / 文件），顺序固定：命令仅在 > 模式出现，文件仅在配置了搜索根时出现。
  // 分组标题 + 每项右侧来源标签共同呈现"这条结果来自哪"。flat 顺序与 results 数组一致（command→app→file）。
  const resultGroups: { key: ResultSource; title: string; items: SearchResult[] }[] = (() => {
    const buckets: Record<ResultSource, SearchResult[]> = { command: [], app: [], file: [] }
    for (const r of results) buckets[resultSource(r)].push(r)
    return (['command', 'app', 'file'] as ResultSource[])
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({ key: k, title: SOURCE_TITLES[k], items: buckets[k] }))
  })()

  return (
    <div
      ref={containerRef}
      className={`search-container theme-${config?.ui?.theme || 'aurora'} ${searchTheme === 'light' ? 'search-container--light' : ''}`}
      style={{ '--glass-alpha': searchOpacity } as React.CSSProperties}
    >
      <div className="search-input-wrapper">
        {/* 搜索引擎徽章与搜索图标互斥：激活引擎时徽章顶替图标，清除后图标回归。
            徽章为纯展示标签（方案 C：纯文字 + 右侧分隔竖线），清除走 Backspace / Esc。 */}
        {activeEngine ? (
          <span className="search-engine-badge" key={activeEngine.key} title={`正在使用 ${activeEngine.name} 搜索`}>
            {activeEngine.name}
          </span>
        ) : (
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}

        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { /* isActiveRef intentionally NOT set here — only set on mousedown/open to allow blur-refocus */ }}
          onBlur={() => {
            setTimeout(() => {
              if (!isActiveRef.current) {
                inputRef.current?.focus()
              }
            }, 150)
          }}
          placeholder={activeEngine ? `在 ${activeEngine.name} 中搜索…` : (config?.ui?.searchPlaceholder?.trim() || '搜索应用或文件夹…')}
          autoFocus
        />
      </div>

      {hasResults && (
        <div
          className="search-results"
          ref={resultsContainerRef}
          style={{ maxHeight: resultsMaxHeight }}
        >
          {resultGroups.map((group) => (
            <Fragment key={group.key}>
              {resultGroups.length > 1 && (
                <div className="search-group-header" key={`${group.key}-header`}>
                  {group.key === 'file' && FILE_SOURCE_LABELS[fileSource]
                    ? `${group.title} · ${FILE_SOURCE_LABELS[fileSource]}`
                    : group.title}
                </div>
              )}
              {group.items.map((app) => {
                // 用引用定位在 results 中的扁平下标，与 results 顺序（command→app→file）一致
                const index = results.indexOf(app)
                const isFile = app.type === 'file'
                const isAction = app.type === 'action'
                const isLocatable = !isFile && !isAction && !app.id.startsWith('__')
                const fallbackIcon = isAction
                  ? (app.icon || '>')
                  : isFile
                    ? (app.isDir ? '📁' : '📄')
                    : app.type === 'folder'
                      ? '📁'
                      : '📦'
                return (
                  <div
                    key={app.id}
                    className={`search-result-item ${index === activeIndex ? 'active' : ''} ${isFile ? 'is-file' : ''}`}
                    onClick={() => handleOpenItem(app)}
                    onMouseDown={(e) => { e.preventDefault(); isActiveRef.current = true }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className={`search-result-icon ${app.type === 'folder' ? 'folder' : ''} ${isFile ? 'file' : ''} ${isAction ? 'action' : ''}`}>
                      {hasDisplayableIcon(app.icon) ? (
                        <img src={app.icon} alt={app.name} width="28" height="28" />
                      ) : (
                        <span className="app-icon">{fallbackIcon}</span>
                      )}
                    </div>
                    <div className="search-result-info">
                      <div className="search-result-name">{app.name}</div>
                      <div className="search-result-path">
                        {isAction ? (
                          <span>{app.path}</span>
                        ) : isFile ? (
                          <span className="search-result-path-full" title={app.path}>{app.path}</span>
                        ) : getCategoryName(app.categoryId) && (
                          <span className="search-result-category">{getCategoryName(app.categoryId)}</span>
                        )}
                      </div>
                    </div>
                    <div className="search-result-tags">
                      {isLocatable && (
                        <button
                          type="button"
                          className="search-result-locate"
                          title="在主界面中显示（Ctrl+Shift+Enter）"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); locateResult(app) }}
                        >
                          定位
                        </button>
                      )}
                      {/* 来源标签：本机文件搜索项区分"文件夹/文件"，其余按来源分组名。
                          同名文件夹与同名文件混在一组里时，靠这个标签一眼区分类型。 */}
                      <span className="search-result-source">
                        {isFile ? (app.isDir ? '文件夹' : '文件') : SOURCE_TITLES[group.key]}
                      </span>
                    </div>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      )}

      {/* 搜索引擎激活时输入内容是发给引擎的，不走本地应用过滤，"无匹配"提示没有意义；
          本机文件搜索异步返回期间（filesLoading）也不显示，避免空窗期误报 */}
      {!hasResults && query.trim() && !activeEngine && !filesLoading && (
        <div className="search-no-results">
          <span>没有找到匹配的应用、文件夹或文件</span>
        </div>
      )}
      {!hasResults && !query.trim() && !activeEngine && hintsVisible && (
        <div className="search-command-hints">
          <span>输入 <kbd>&gt;</kbd> 查看快捷命令</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 打开所在文件夹</span>
          <span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> 定位到主界面</span>
          <span><kbd>Delete</kbd> 隐藏结果</span>
        </div>
      )}

      {/* 落盘失败提示。⚠️ 必须 fixed + 条件渲染：本窗口高度由 useLayoutEffect 实测
          .search-container 后同步给主进程，常驻元素（哪怕隐藏）会改变实测高度。 */}
      {persistError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 left-1/2 z-[95] -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900/85 px-4 py-2 text-xs font-medium text-white shadow-xl shadow-slate-900/25"
        >
          {persistError}
        </div>
      )}
    </div>
  )
}

export default SearchApp
