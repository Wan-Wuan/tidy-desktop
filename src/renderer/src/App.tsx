import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AppItem, AutoCategoryRule, Category, CategoryLinkFolder, Subcategory, Config, UiCommand } from '../../shared/types'
import type { CorruptBackupInfo, DataHealth, HotkeyIssue } from '../../shared/electron'
import { parseSteamUrl } from '../../shared/utils'
import { DEFAULT_HOTKEY, DEFAULT_SEARCH_HOTKEY } from '../../shared/defaults'
import { getPinyin, getFirstLetter } from './utils/pinyin'
import { sortAppsForDisplay as sortAppsForDisplayPure } from './utils/sortApps'
import { persistApps, persistCategories, persistConfig, setPersistNotifier } from './utils/persist'
import { resolveMainKeyAction } from './utils/keyboard'
import {
  removeCategoryFromApps,
  removeSubcategoryFromApps
} from './utils/categoryDeletion'
import { useAppCrud } from './hooks/useAppCrud'
import { useLaunchGroups } from './hooks/useLaunchGroups'
import { useCollections } from './hooks/useCollections'
import { useFolderSync } from './hooks/useFolderSync'
import { useUpdate } from './hooks/useUpdate'
import { applyAccentScale, generateAccentScale } from './utils/colorScale'
import { useDragGhost } from './hooks/useDragGhost'
import { useStableCallback } from './hooks/useStableCallback'
import { useMaintenance } from './hooks/useMaintenance'
import { useAppData } from './hooks/useAppData'
import { useIconBackfill, appNeedsIconUpdate } from './hooks/useIconBackfill'
import { useUndoSnapshot, type MaintenanceApi } from './hooks/useUndoSnapshot'
import { useAppSelection } from './hooks/useAppSelection'
import { useCategoryDialogs, type CategoryCrudApi } from './hooks/useCategoryDialogs'
import { AppNoticeDialog } from './components/AppNoticeDialog'
import { UpdateDialog } from './components/UpdateButton'
import { SidebarResizeHandle } from './components/SidebarResizeHandle'
import { WindowResizeHandles } from './components/WindowResizeHandles'
import {
  CategoryContextMenuOverlay,
  CategoryDeleteDialogOverlay,
  CategoryEditDialogOverlay
} from './components/CategoryOverlays'
import { AppContextMenuOverlay } from './components/AppContextMenuOverlay'
import { LaunchGroupPanel } from './components/LaunchGroupPanel'
import { FolderSyncBanner } from './components/FolderSyncBanner'
import type { CollectionGroup } from './components/AppGrid'
import { parseSyncedAppId } from './utils/syncedId'
import { launchAppAsAdmin } from './utils/launchApp'
import { safePickFolder } from './utils/nativeDialog'
import { SIDEBAR_DRAG_THRESHOLD, useSidebarResize } from './hooks/useSidebarResize'
import { toggleTodoItem, clearCompletedTodos, formatTodosAsMarkdown } from './utils/todo'
// 第 7 步：把顶部概览 / 分类导航 / 卡片网格 / 多选条 / 提示栈拆成纯展示组件，
// App 只负责把状态与回调透传过去，行为与原来内联 JSX 完全一致。
import { HeaderOverview } from './components/HeaderOverview'
import { CategoryNav } from './components/CategoryNav'
import { AppGrid } from './components/AppGrid'
import { SelectionBar } from './components/SelectionBar'
import { ToastStack } from './components/ToastStack'
import { CategoryIcon } from './components/CategoryIcon'
import { useDragAndDrop } from './hooks/useDragAndDrop'
import type { AppContextMenuState } from './components/AppContextMenuOverlay'
import {
  AddAppModal,
  CategoryManagerModal,
  EditAppModal,
  NoteViewerModal,
  OnboardingModal,
  SettingsModal,
  SmartOrganizeModal,
  UsageInsightsModal,
} from './components/modals'


function App() {
  // 集中持有应用数据五组状态 + 对应 ref 镜像（含跨 await 前刷新镜像的逻辑）。
  const {
    config,
    setConfig,
    apps,
    setApps,
    appsRef,
    categories,
    setCategories,
    categoriesRef,
    subcategories,
    setSubcategories,
    activeCategory,
    setActiveCategory,
    activeCategoryRef
  } = useAppData()
  const {
    state: updateState,
    version: updateVersion,
    progress: updateProgress,
    releaseNotes: updateReleaseNotes,
    source: updateSource,
    error: updateError,
    currentVersion,
    portable: updatePortable,
    releaseUrl: updateReleaseUrl,
    checkForUpdate: manualCheckForUpdate,
    startDownload,
    confirmInstall,
    dismissUpdate
  } = useUpdate()
  const [showSettings, setShowSettings] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [showEditApp, setShowEditApp] = useState(false)
  const [editingApp, setEditingApp] = useState<AppItem | null>(null)
  const [showSmartOrganize, setShowSmartOrganize] = useState(false)
  const [showUsageInsights, setShowUsageInsights] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [launchPaused, setLaunchPaused] = useState<boolean>(config?.launchPaused === true)
  /** 收到"定位项目"请求后，记下待滚动高亮的卡片，等分类切换渲染完成再处理 */
  const pendingLocateAppIdRef = useRef<string | null>(null)
  /** 每次定位请求自增，作为滚动高亮 effect 的触发源——否则目标卡片恰好在当前分类时，
      activeCategory / apps 都不变，effect 不会重跑，用户看到窗口打开却没有高亮 */
  const [locateNonce, setLocateNonce] = useState(0)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const categoryBarRef = useRef<HTMLDivElement>(null)
  const subcategoryBarRef = useRef<HTMLDivElement>(null)

  // 创建跟随鼠标的幽灵卡片（左键自绘拖拽引擎使用；幽灵自身的 DOM 引用在 useDragGhost 内部维护）
  const { createDragGhost, moveDragGhost, removeDragGhost } = useDragGhost(appsRef, config?.ui)

  /* 拖拽引擎的动作（重排/归类）在本函数更靠后才定义，经 ref 转发给 useDragAndDrop。
     监听只挂一次，动作实现每次渲染刷新进 ref，避免闭包过期（细节见 useDragAndDrop
     里的 leftDragActionsRef 说明）。 */
  const leftDragActionsRef = useRef<{
    reorder: (sourceId: string, targetId: string, insertAfter?: boolean) => Promise<void>
    toCategory: (appId: string, categoryId: string) => Promise<void>
    toSubcategory: (appId: string, subcategoryId: string | null) => Promise<void>
    toCollection: (appId: string, collectionId: string) => Promise<void>
  } | null>(null)

  // 拖拽引擎：左键自绘拖拽 + 外部文件拖入守卫。整套手势/落点/收尾逻辑从本文件
  // 搬迁到 useDragAndDrop（拆分第 6 步），App 只保留数据层动作（reorder/toCategory/toSubcategory）。
  const {
    draggedAppId,
    isDragEngaged,
    dragOverCategory,
    setDragOverCategory,
    dragOverAppId,
    dragOverSubId,
    dragOverGroupSubId,
    dragOverCollectionId,
    dropInsertAfter,
    draggedSubId,
    setDraggedSubId,
    setDragOverSubId,
    suppressNextCardClickRef,
    draggedAppIdRef,
    clearDragState,
    resetExternalDrag,
    handleCardMouseDown,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDragEnd
  } = useDragAndDrop({ ghost: { createDragGhost, moveDragGhost, removeDragGhost }, actions: leftDragActionsRef.current! })

  // 图标按需补全：载入后、拖入新应用后把缺图标的补上（细节见 useIconBackfill）。
  const { scheduleIconBackfill, extractIconsForApps } = useIconBackfill({ appsRef, setApps })

  // 撤销快照：破坏性操作前拍下整份数据，用户点撤销时整份还原（细节见 useUndoSnapshot）。
  // 维护模块在本函数更靠后才调用，它的两个输出经 maintenanceApiRef 转发给撤销逻辑。
  const maintenanceApiRef = useRef<MaintenanceApi | null>(null)
  const { undoSnapshot, setUndoSnapshot, captureUndoSnapshot, restoreUndoSnapshot } = useUndoSnapshot({
    appsRef,
    categoriesRef,
    subcategories,
    activeCategoryRef,
    setApps,
    setCategories,
    setSubcategories,
    setActiveCategory,
    maintenanceApiRef
  })

  // 多选状态（选中集合 / 框选锚点 / 一键清空），细节见 useAppSelection。
  const { selectedAppIds, setSelectedAppIds, selectedAppIdSet, lastClickedIndexRef, clearAppSelection, toggleSelectAll } = useAppSelection()

  // 维护操作集（图标刷新/自动分类/健康检查/导入/备份等）
  const {
    maintenanceSummary,
    clearMaintenanceSummary,
    iconRefreshProgress,
    healthReport,
    showMaintenanceSummary,
    handleRefreshAllIcons,
    handleAutoCategorize,
    handleCleanupInvalidApps,
    handleRelocateInvalidApps,
    handleRestoreHiddenApps,
    handleExportBackup,
    handleImportBackup,
    handleRunHealthCheck,
    handleFixHealthIssues,
    handleImportShortcuts
  } = useMaintenance({
    appsRef,
    categoriesRef,
    categories,
    subcategories,
    config,
    activeCategoryRef,
    setActiveCategory,
    setApps,
    setCategories,
    setSubcategories,
    captureUndoSnapshot,
    loadData: () => loadData(),
    scheduleIconBackfill: (apps) => scheduleIconBackfill(apps)
  })

  useEffect(() => {
    if (!currentVersion) return
    const key = 'tidy-desktop:last-version'
    const lastVersion = localStorage.getItem(key)
    if (lastVersion && lastVersion !== currentVersion) {
      setTimeout(() => {
        showMaintenanceSummary({
          title: `已更新到 v${currentVersion}`,
          items: ['数据已自动备份。如遇问题，可在「设置 → 关于」中导出诊断信息。']
        })
      }, 400)
    }
    localStorage.setItem(key, currentVersion)
  }, [currentVersion, showMaintenanceSummary])

  // 主题色（accent）：写入 brand 色阶 CSS 变量；留空回落到默认靛蓝
  useEffect(() => {
    const accent = config?.ui?.accentColor?.trim()
    applyAccentScale(accent ? generateAccentScale(accent) : null, document.documentElement)
  }, [config?.ui?.accentColor])

  /* 外观个性化（P2）：自定义背景图。
     config 里存的是**本地图片的绝对路径**，渲染层不能直接加载，需要经主进程换成 file:// URL。
     文件被移走 / 换名后 getLocalImageUrl 返回 null，背景自动失效回退到主题背景。
     ⚠️ effect 里只用拆出来的原始值（kind / value），不要把整个 background 对象塞进来：
     否则依赖数组要么漏项、要么每次 config 重载都换引用导致重复请求。 */
  const background = config?.ui?.background
  const backgroundKind = background?.kind
  const backgroundValue = background?.value
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  useEffect(() => {
    if (backgroundKind !== 'image' || !backgroundValue) {
      setBackgroundUrl(null)
      return
    }
    let cancelled = false
    window.electronAPI
      .getLocalImageUrl(backgroundValue)
      .then(url => { if (!cancelled) setBackgroundUrl(url) })
      .catch(() => { if (!cancelled) setBackgroundUrl(null) })
    return () => { cancelled = true }
  }, [backgroundKind, backgroundValue])

  /* 外观个性化（P2）：字体族 / 字号缩放 / 背景参数，统一写进 documentElement 的 CSS 变量，
     让挂在 .app-shell 之外的浮层（模态框、toast）也能一起生效。
     ⚠️ 字号缩放走 html 的 font-size：Tailwind 的 text-* 都是 rem，跟着一起缩放；
     而图标（Phosphor 传的是 px）与网格列数 / 卡片尺寸（都是 px 计算）不受影响——
     这正是"不影响图标与网格尺寸计算"要的效果。 */
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

    const bg = config?.ui?.background
    const enabled = !!bg && bg.kind !== 'none'
    /* 模糊 / 暗化只对图片有意义：纯色是用户自己挑的，再压暗只会让颜色失真。 */
    const isImage = enabled && bg?.kind === 'image'
    root.style.setProperty('--app-bg-image', isImage && backgroundUrl ? `url("${backgroundUrl}")` : 'none')
    root.style.setProperty('--app-bg-blur', isImage ? `${Math.max(0, bg?.blur ?? 0)}px` : '0px')
    root.style.setProperty('--app-bg-dim', isImage ? String(Math.min(0.9, Math.max(0, bg?.dim ?? 0))) : '0')
    root.style.setProperty(
      '--app-bg-color',
      enabled && bg?.kind === 'color' && bg.value ? bg.value : 'transparent'
    )
  }, [config?.ui?.fontFamily, config?.ui?.uiScale, config?.ui?.background, backgroundUrl])

  // 记住上次浏览的分类，跳过首次挂载（loadData 已按持久化值恢复）
  useEffect(() => {
    if (skipActiveCategoryPersistRef.current) {
      skipActiveCategoryPersistRef.current = false
      return
    }
    /* 这里刻意不走 persistConfig：切换分类很频繁，失败时弹提示会打扰用户，
       而「记住上次分类」本身是非关键信息（丢了只是下次打开回到「全部」）。
       但必须 catch——否则 getConfig 失败会成为未捕获的 rejection。 */
    window.electronAPI.getConfig()
      .then(latest => window.electronAPI.saveConfig({ ...latest, lastActiveCategoryId: activeCategory }))
      .catch(() => { /* 记住上次分类失败不影响使用，静默 */ })
  }, [activeCategory])

  /* 复制结果的轻提示：以前用 alert()，会弹出系统模态框打断操作 */
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const copyToastTimerRef = useRef<number | null>(null)
  const showCopyToast = useCallback((message: string) => {
    setCopyToast(message)
    if (copyToastTimerRef.current) window.clearTimeout(copyToastTimerRef.current)
    copyToastTimerRef.current = window.setTimeout(() => {
      setCopyToast(null)
      copyToastTimerRef.current = null
    }, 1800)
  }, [])
  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        window.clearTimeout(copyToastTimerRef.current)
        copyToastTimerRef.current = null
      }
    }
  }, [])
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null)

  /* 把界面上的轻提示注入持久化模块，让 useIconBackfill / useMaintenance /
     useUndoSnapshot 那些 hook 落盘失败时也能告知用户（细节见 utils/persist.ts）。
     卸载时归还，避免 notifier 指向已卸载的组件。 */
  useEffect(() => {
    setPersistNotifier(showCopyToast)
    return () => setPersistNotifier(null)
  }, [showCopyToast])

  /* 应用数据的全部变更操作（增删改 / 归类 / 排序 / 批量 / 拖入解析）。
     内部统一走 commitApps 收口「写 ref + 写 state + 落盘」三件事，避免漏写 ref
     导致 await 之后读到旧数组；细节与动机见 useAppCrud。 */
  const {
    commitApps,
    mutateApps,
    recordAppLaunch,
    handleOpenApp,
    handleOpenAppWithSystem,
    handleSendFile,
    handleAddApp,
    handleUpdateApp,
    handleAddFolder,
    handleDeleteApp,
    handleMoveAppToCategory,
    handleMoveAppToSubcategory,
    handleContextMenuMove,
    handleContextMenuHide,
    handleReorderApp,
    batchMoveToCategory,
    batchMoveToSubcategory,
    batchHideApps,
    batchRestoreApps,
    batchDeleteApps,
    hideAppsByIds,
    parsePathsToApps,
    showDropResult,
    getDroppedPathsFromEvent
  } = useAppCrud({
    appsRef,
    setApps,
    categoriesRef,
    activeCategoryRef,
    config,
    selectedAppIds,
    setShowAddApp,
    setShowEditApp,
    setEditingApp,
    clearAppSelection,
    showToast: showCopyToast,
    showSummary: showMaintenanceSummary,
    captureUndoSnapshot
  })

  /* 组合启动（多项目运行）。成员解析走 appsRef，结果汇总走维护提示条。
     需要「启动前确认」时把 pendingGroup 抛给 LaunchGroupPanel。 */
  const {
    pendingGroup,
    launching: groupLaunching,
    resolveGroupMembers,
    requestLaunchGroup,
    confirmLaunchGroup,
    cancelLaunchGroup
  } = useLaunchGroups({
    appsRef,
    recordLaunch: recordAppLaunch,
    showSummary: showMaintenanceSummary
  })

  /**
   * 正在阅读的文本项目 **id**（文本项目没有"启动"这个动作，点开是阅读面板）。
   *
   * 刻意存 id 而不是对象：待办面板里勾一条就立刻落盘，如果存的是打开那一刻的
   * 对象快照，勾完界面还是旧的那份（勾不动、进度不变）。派生自 `apps` 就自动跟上，
   * 项目被删掉时面板也会自己关掉。
   */
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null)
  const viewingNote = useMemo(
    () => (viewingNoteId ? apps.find(app => app.id === viewingNoteId) ?? null : null),
    [viewingNoteId, apps]
  )

  /* 分类数据的落盘入口。与 useAppCrud 的 commitApps 同构——一次写 ref + state + 落盘，
     漏写 ref 会在 await 之后读到旧数组。 */
  const commitCategories = useCallback(async (next: Category[], hint: string) => {
    categoriesRef.current = next
    setCategories(next)
    return persistCategories(next, subcategories, hint)
  }, [categoriesRef, setCategories, subcategories])

  /* 收纳格：只影响"在哪里显示"，不碰 apps.json，所以与 useAppCrud 完全解耦 */
  const {
    collections,
    collectionsRef,
    createCollection,
    renameCollection,
    deleteCollection,
    toggleCollapsed: toggleCollectionCollapsed,
    addAppsToCollection,
    removeAppsFromCollections,
    pruneMissingMembers
  } = useCollections()

  /** 改某个分类的 linkFolder 并落盘；next 为 null 表示解除关联 */
  const updateLinkFolder = useCallback(async (categoryId: string, next: CategoryLinkFolder | null) => {
    await commitCategories(
      categoriesRef.current.map(category => (category.id === categoryId
        ? { ...category, linkFolder: next }
        : category)),
      next ? '关联文件夹' : '解除关联'
    )
  }, [categoriesRef, commitCategories])

  /* 关联文件夹同步：扫描在主进程，这里只读缓存 + 订阅通知 + 维护用户意图 */
  const {
    syncingIds: syncingCategoryIds,
    errorsByCategory,
    syncedApps,
    syncCategory,
    hideEntry: hideSyncedEntry,
    bindFolder,
    unbindFolder
  } = useFolderSync({
    categories,
    categoriesRef,
    activeCategory,
    showSummary: showMaintenanceSummary,
    updateLinkFolder
  })

  const [sidebarWidthDraft, setSidebarWidthDraft] = useState<number | null>(null)
  // 分类右键菜单 + 编辑/删除弹窗的全部状态与接线（细节见 useCategoryDialogs）。
  // 底层 CRUD handler 在本函数更靠后才定义，经 crudApiRef 转发，避免闭包踩 TDZ。
  const crudApiRef = useRef<CategoryCrudApi | null>(null)
  const {
    categoryContextMenu,
    setCategoryContextMenu,
    categoryEditDialog,
    setCategoryEditDialog,
    categoryDeleteDialog,
    setCategoryDeleteDialog,
    categoryManagerOpen,
    openCategoryManager,
    closeCategoryManager,
    openCategoryContextMenu,
    createCategoryFromMenu,
    renameCategoryFromMenu,
    addSubcategoryFromMenu,
    deleteCategoryFromMenu,
    renameSubcategoryFromMenu,
    deleteSubcategoryFromMenu,
    submitCategoryEditDialog
  } = useCategoryDialogs({
    subcategories,
    appsRef,
    setActiveCategory,
    activeCategoryRef,
    crudApiRef
  })
  const [appContextMenu, setAppContextMenu] = useState<AppContextMenuState | null>(null)
  const skipActiveCategoryPersistRef = useRef(true)

  /* 分类右键菜单的关闭兜底：点击任意处 / 右键 / Esc / 窗口失焦都关掉。
     （拖拽的 dragend 兜底已随拖拽引擎迁到 useDragAndDrop，不在这里。） */
  useEffect(() => {
    if (!categoryContextMenu) return
    const closeMenu = () => setCategoryContextMenu(null)
    const closeOnKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('contextmenu', closeMenu)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('blur', closeMenu)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('contextmenu', closeMenu)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('blur', closeMenu)
    }
  }, [categoryContextMenu, setCategoryContextMenu])

  useEffect(() => {
    if (!appContextMenu) return
    const closeMenu = () => setAppContextMenu(null)
    const closeOnKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('contextmenu', closeMenu)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('blur', closeMenu)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('contextmenu', closeMenu)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('blur', closeMenu)
    }
  }, [appContextMenu])

  /* 加载数据。包一层 useStableCallback 让它有稳定标识：
     它自己只用到 setState / ref / 导入的纯函数，但调用它的两处（挂载 effect、
     从损坏备份恢复）都需要"最新实现"——普通函数写完每次渲染都是新引用，
     挂进依赖数组就会变成"依赖每次都变"，挂载 effect 更会退化成每渲染跑一次。 */
  const loadDataFn = async () => {
    const [configData, appsData, categoriesData] = await Promise.all([
      window.electronAPI.getConfig(),
      window.electronAPI.getApps(),
      window.electronAPI.getCategories()
    ])
    setConfig(configData)
    if (!configData.onboardingCompleted) {
      setShowOnboarding(true)
    }

    const loadedApps = (appsData.apps || []).map(app => ({
      ...app,
      id: app.id || '',
      name: app.name || '',
      path: app.path || '',
      icon: app.icon || '',
      categoryId: app.categoryId || '',
      subcategoryId: app.subcategoryId || null,
      pinyin: app.pinyin || '',
      firstLetter: app.firstLetter || '',
      type: app.type || 'app'
    }))
    setApps(loadedApps)

    const sortedCats = (categoriesData.categories || []).sort((a, b) => a.order - b.order)
    setCategories(sortedCats)
    setSubcategories(categoriesData.subcategories || [])

    if (!activeCategoryRef.current && sortedCats.length > 0) {
      const savedId = configData.lastActiveCategoryId
      const saved = savedId ? sortedCats.find(cat => cat.id === savedId) : null
      const initialCategory = saved ? saved.id : sortedCats[0].id
      setActiveCategory(initialCategory)
      activeCategoryRef.current = initialCategory
    }

    const appsNeedingIconUpdate = loadedApps.filter(appNeedsIconUpdate)
    if (appsNeedingIconUpdate.length > 0) {
      scheduleIconBackfill(appsNeedingIconUpdate)
    }
  }
  const loadData = useStableCallback(loadDataFn)

  /* 挂载时加载一次数据。
     放在 loadData 声明之后：依赖数组在渲染期求值，写在前面会踩 TDZ。
     loadData 的标识稳定，所以这个 effect 仍然只跑一次。 */
  useEffect(() => {
    void loadData()
  }, [loadData])

  /* 数据健康检查。
     数据文件损坏时主进程会拒绝写入并把原始内容留档成 .corrupt-*，
     但以前没有任何入口能发现这些留档——用户看到的是"数据空了"，
     其实备份还在磁盘上。这里在启动时查一次，并在设置页给出恢复入口。 */
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null)
  const refreshDataHealth = useCallback(async () => {
    try {
      setDataHealth(await window.electronAPI.getDataHealth())
    } catch {
      /* 读不到不提示，不影响主流程 */
    }
  }, [])
  useEffect(() => {
    void refreshDataHealth()
  }, [refreshDataHealth])

  const handleRestoreCorruptBackup = useCallback(async (backup: CorruptBackupInfo) => {
    const confirmed = await window.electronAPI.confirm(
      `确定用备份「${backup.fileName}」覆盖当前数据文件吗？\n\n备份文件本身会保留，可以重复恢复。`
    )
    if (!confirmed) return
    const ok = await window.electronAPI.restoreCorruptBackup({
      backupPath: backup.backupPath,
      targetFile: backup.targetFile
    })
    if (!ok) {
      showCopyToast('恢复失败：备份内容无法解析。')
      return
    }
    await refreshDataHealth()
    await loadData()
    showCopyToast('已从备份恢复，请核对数据是否完整。')
  }, [refreshDataHealth, loadData, showCopyToast])

  /* 展示用的项目集合 = 手工项目（apps.json）+ 关联文件夹同步出来的项目（内存态）。
     同步项**不落 apps.json**，所以只在这一层合并；所有写操作仍然只走 appsRef。 */
  const displayApps = useMemo(() => (syncedApps.length > 0 ? [...apps, ...syncedApps] : apps), [apps, syncedApps])

  const filteredApps = useMemo(() => {
    if (activeCategory) {
      return displayApps.filter(app => app.categoryId === activeCategory)
    }
    return displayApps
  }, [displayApps, activeCategory])

  /* 当前视图要显示的收纳格：
     · 未选中分类（"全部"视图）→ 显示没有绑定分类的收纳格
     · 选中某分类 → 显示绑定到该分类的收纳格
     收纳格只影响显示位置，成员项目本身的 categoryId 不变。 */
  const collectionGroups = useMemo<CollectionGroup[]>(() => {
    if (collections.length === 0) return []
    const byId = new Map(displayApps.map(app => [app.id, app]))
    return collections
      .filter(collection => (activeCategory ? collection.categoryId === activeCategory : collection.categoryId === null))
      .sort((a, b) => a.order - b.order)
      .map(collection => ({
        collection,
        apps: collection.memberIds
          .map(id => byId.get(id))
          .filter((app): app is AppItem => Boolean(app))
      }))
  }, [collections, displayApps, activeCategory])

  /* 已收进当前视图收纳格的项目 id：这些卡片只在收纳格里画一份，
     不再在下面的子分类分组里重复出现（同一张卡片画两次，改一个另一个不跟着变）。 */
  const groupedAppIds = useMemo(() => {
    const ids = new Set<string>()
    for (const group of collectionGroups) {
      for (const app of group.apps) ids.add(app.id)
    }
    return ids
  }, [collectionGroups])

  /* 右键菜单里「移出收纳格」要知道这张卡现在在哪个格子里。
     只在**当前视图**的收纳格里找：菜单本来就是从当前视图的卡片上弹出来的。 */
  const contextMenuCollection = useMemo(() => {
    if (!appContextMenu) return null
    const group = collectionGroups.find(item => item.apps.some(app => app.id === appContextMenu.app.id))
    return group?.collection ?? null
  }, [appContextMenu, collectionGroups])

  /* 全选的目标：当前可见（未隐藏）的项目。隐藏项本来就不显示在网格里，
     把它们也圈进「全选」会让用户莫名其妙地选中看不见的东西。
     同步项同样排除——它们不在 apps.json 里，选中了也删不掉、改不了。 */
  const visibleAppIds = useMemo(
    () => filteredApps.filter(app => !app.hidden && !app.isSynced).map(app => app.id),
    [filteredApps]
  )

  /* 任何弹窗 / 菜单打开时，主界面的键盘操作整体让位。 */
  const overlayOpen = showSettings || showAddApp || showEditApp || showSmartOrganize || showUsageInsights
    || !!appContextMenu || !!categoryContextMenu || !!categoryEditDialog || !!categoryDeleteDialog
    || !!viewingNote || !!pendingGroup

  /* 主界面的键盘操作。
     三类快捷键的边界正是「热键互相干扰」的根源（完整说明见 utils/keyboard.ts）。
     判定顺序全部收在 resolveMainKeyAction 里——**顺序就是逻辑**，
     尤其 Esc 必须排在 isEditableTarget 之前，别再挪回这里手写。 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = resolveMainKeyAction(e, {
        overlayOpen,
        hasSelection: selectedAppIds.length > 0,
        visibleCount: visibleAppIds.length
      })
      switch (action?.type) {
        case 'clear-selection':
          setSelectedAppIds([])
          return
        /* Ctrl/Cmd+A：全选当前可见项目，与工具条上的「全选」同一语义。
           必须 preventDefault——否则浏览器会把界面上的文字整片选蓝。 */
        case 'select-all':
          e.preventDefault()
          setSelectedAppIds(visibleAppIds)
          return
        /* Delete：删除选中项。走与工具条按钮完全相同的入口——
           确认框与撤销快照都在 batchDeleteApps 里，这里不重复实现。 */
        case 'delete-selection':
          e.preventDefault()
          void batchDeleteApps()
          return
        case 'hide-window':
          window.electronAPI.hideMainWindow()
          return
        default:
          return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [overlayOpen, selectedAppIds, visibleAppIds, setSelectedAppIds, batchDeleteApps])

  const activeCategoryLabel = useMemo(() => {
    if (!activeCategory) return '全部项目'
    return categories.find(category => category.id === activeCategory)?.name || '当前分类'
  }, [activeCategory, categories])

  const activeCategoryObject = useMemo(
    () => (activeCategory ? categories.find(category => category.id === activeCategory) ?? null : null),
    [activeCategory, categories]
  )

  const overviewStats = useMemo(() => ({
    total: filteredApps.length,
    folders: filteredApps.filter(app => app.type === 'folder').length,
    missingIcons: filteredApps.filter(appNeedsIconUpdate).length,
    hidden: filteredApps.filter(app => app.hidden).length,
    visible: filteredApps.filter(app => !app.hidden).length
  }), [filteredApps])

  const overviewHealth = useMemo(() => {
    if (overviewStats.missingIcons > 0 || overviewStats.hidden > 0) return '需要维护'
    if (overviewStats.total === 0) return '等待导入'
    return '状态良好'
  }, [overviewStats.hidden, overviewStats.missingIcons, overviewStats.total])

  const smartLaunchApps = useMemo(() => {
    const now = Date.now()
    return filteredApps
      .filter(app => !app.hidden)
      .map(app => {
        const launchScore = (app.launchCount || 0) * 12
        const recentScore = app.lastOpenedAt ? Math.max(0, 30 - Math.floor((now - app.lastOpenedAt) / 86400000)) : 0
        return { app, score: launchScore + recentScore }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(item => item.app)
  }, [filteredApps])

  const handleUpdateConfig = async (newConfig: Config) => {
    const hotkeysChanged = !!config && (
      config.hotkey !== newConfig.hotkey || config.searchHotkey !== newConfig.searchHotkey
    )
    const success = await window.electronAPI.saveConfig(newConfig)
    if (!success) {
      /* 主进程对多种失败都只回 false，这里按已知条件给出更准确的解释。
         以前一律说成「快捷键被占用」——数据文件损坏、磁盘写失败时会把用户引向错误方向。 */
      const reason = hotkeysChanged
        ? '新的全局快捷键可能已被其它程序占用，已恢复原快捷键。'
        : (dataHealth?.corruptedNow.length ?? 0) > 0
          ? '数据文件已损坏。为避免覆盖现有数据，本次保存已被拒绝，请先在数据健康面板中恢复备份。'
          : '写入磁盘失败，请检查数据目录权限或磁盘空间。'
      alert(`配置保存失败：${reason}`)
      return false
    }
    setConfig(newConfig)
    return true
  }

  const handleAddCategory = async (name: string, icon: string) => {
    const newCategory: Category = {
      id: crypto.randomUUID(),
      name,
      icon,
      order: categories.length + 1
    }
    const updatedCategories = [...categories, newCategory]
    categoriesRef.current = updatedCategories
    setCategories(updatedCategories)
    setActiveCategory(newCategory.id)
    activeCategoryRef.current = newCategory.id
    await persistCategories(updatedCategories, subcategories, '新建分类')
  }

  const persistCategoryDeletion = async (
    nextApps: AppItem[],
    nextCategories: Category[],
    nextSubcategories: Subcategory[]
  ): Promise<boolean> => {
    const previousApps = appsRef.current
    const previousCategories = categoriesRef.current
    const previousSubcategories = subcategories

    try {
      const [categoriesSaved, appsSaved] = await Promise.all([
        window.electronAPI.saveCategories({ categories: nextCategories, subcategories: nextSubcategories }),
        window.electronAPI.saveApps({ apps: nextApps })
      ])
      if (categoriesSaved && appsSaved) return true
    } catch {
      // Roll back both files below because either write may already have completed.
    }

    await Promise.allSettled([
      window.electronAPI.saveCategories({ categories: previousCategories, subcategories: previousSubcategories }),
      window.electronAPI.saveApps({ apps: previousApps })
    ])
    alert('删除保存失败，已恢复原数据，请重试。')
    return false
  }

  const handleDeleteCategory = async (id: string, keepApps: boolean) => {
    const deletedSubcategoryIds = subcategories.filter(sub => sub.parentId === id).map(sub => sub.id)
    const updatedCategories = categories.filter(cat => cat.id !== id)
    const updatedSubcategories = subcategories.filter(sub => sub.parentId !== id)
    const updatedApps = removeCategoryFromApps(appsRef.current, id, deletedSubcategoryIds, keepApps)
    if (!await persistCategoryDeletion(updatedApps, updatedCategories, updatedSubcategories)) return

    captureUndoSnapshot('删除分类')
    categoriesRef.current = updatedCategories
    appsRef.current = updatedApps
    setCategories(updatedCategories)
    setSubcategories(updatedSubcategories)
    setApps(updatedApps)
    
    if (activeCategory === id) {
      setActiveCategory(null)
      activeCategoryRef.current = null
    }

  }

  const handleUpdateCategory = async (
    id: string,
    name: string,
    icon: string,
    appearance?: { fontSize?: number; itemHeight?: number; iconSize?: number }
  ) => {
    /* 外观字段（P2-3）显式覆盖：传了 undefined 就写 undefined，
       JSON 序列化时会被丢掉 = 回到"用默认"，这样"清空输入框"才能真的恢复默认。 */
    const updatedCategories = categories.map(cat => 
      cat.id === id ? { ...cat, name, icon, ...(appearance ?? {}) } : cat
    )
    categoriesRef.current = updatedCategories
    setCategories(updatedCategories)
    await persistCategories(updatedCategories, subcategories, '修改分类')
  }

  const handleAddSubcategory = async (name: string, icon: string, parentId: string | null) => {
    const newSub: Subcategory = { id: crypto.randomUUID(), name, icon, parentId }
    const updated = [...subcategories, newSub]
    setSubcategories(updated)
    await persistCategories(categories, updated, '新建子分类')
  }

  const handleDeleteSubcategory = async (id: string, keepApps: boolean) => {
    const updated = subcategories.filter(s => s.id !== id)
    const updatedApps = removeSubcategoryFromApps(appsRef.current, id, keepApps)
    if (!await persistCategoryDeletion(updatedApps, categories, updated)) return

    captureUndoSnapshot('删除子分类')
    appsRef.current = updatedApps
    setSubcategories(updated)
    setApps(updatedApps)
  }

  const handleUpdateSubcategory = async (id: string, name: string, icon: string) => {
    const updated = subcategories.map(s => s.id === id ? { ...s, name, icon } : s)
    setSubcategories(updated)
    await persistCategories(categories, updated, '修改子分类')
  }

  /* 改挂父分类。只动 parentId，**不动它下面的项目**——项目归属看的是 subcategoryId，
     子分类换到哪个分类下，项目就跟着出现在那个分类里，这正是用户期望的。
     （删掉再重建则相反：项目的 subcategoryId 会被清空，归属丢失。） */
  const handleMoveSubcategory = async (id: string, parentId: string) => {
    const target = subcategories.find(s => s.id === id)
    if (!target || target.parentId === parentId) return
    const updated = subcategories.map(s => s.id === id ? { ...s, parentId } : s)
    setSubcategories(updated)
    await persistCategories(categories, updated, '移动子分类')
  }

  const handleReorderSubcategory = async (sourceId: string, targetId: string, insertAfter: boolean) => {
    const sourceIndex = subcategories.findIndex(s => s.id === sourceId)
    const targetIndex = subcategories.findIndex(s => s.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    const updated = [...subcategories]
    const [moved] = updated.splice(sourceIndex, 1)
    /* ⚠️ 必须在移除 source 之后的数组上重新定位 target：
       source 在 target 前面时，删除会让 target 的下标整体前移一位，
       沿用删除前的 targetIndex 就会插错一格——表现正是"拖到哪、落点却差一位"。
       与 utils/reorder.ts 里应用重排的语义保持一致。 */
    const insertAt = updated.findIndex(s => s.id === targetId)
    if (insertAt === -1) return
    updated.splice(insertAfter ? insertAt + 1 : insertAt, 0, moved)
    setSubcategories(updated)
    await persistCategories(categories, updated, '子分类排序')
  }

  const openAppContextMenu = (e: React.MouseEvent, app: AppItem) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 208
    const menuHeight = 380
    setAppContextMenu({
      app,
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - menuHeight - 8))
    })
  }

  const handleContextMenuOpenAsAdmin = (app: AppItem) => {
    if (app.type !== 'app') return
    void launchAppAsAdmin(app)
  }

  const handleContextMenuCopyPath = async (app: AppItem) => {
    const success = await window.electronAPI.copyTextToClipboard(app.path)
    showMaintenanceSummary({
      title: success ? '路径已复制' : '复制失败',
      items: [success ? app.path : '无法写入剪贴板，请重试。']
    })
  }

  /**
   * 复制链接（网址）/ 正文（文本）/ 清单（文本·待办）——
   * 三者在右键菜单里是同一个入口，只是取的值不同。
   */
  const handleContextMenuCopyContent = async (app: AppItem) => {
    const isNote = app.type === 'note'
    const value = isNote
      /* 待办导出成 Markdown 任务列表（`- [x]` / `- [ ]`）：粘到任何编辑器都看得懂，
         也还能被再解析回来。复制成纯文本会丢完成状态，复制成 JSON 又没人看得懂。 */
      ? (app.noteKind === 'todo'
        ? formatTodosAsMarkdown(app.todoItems ?? [])
        : (app.noteContent || ''))
      : app.path
    if (!value.trim()) {
      showMaintenanceSummary({ title: '无可复制的内容', items: ['该项目暂无内容。'] })
      return
    }
    const success = await window.electronAPI.copyTextToClipboard(value)
    showMaintenanceSummary({
      title: success ? (isNote ? '内容已复制' : '链接已复制') : '复制失败',
      items: [success ? value : '无法写入剪贴板，请重试。']
    })
  }

  /**
   * 待办：勾选 / 取消勾选。
   *
   * 点一下就落盘——勾选是待办里最高频的动作，要是每次都得进编辑弹窗再保存，
   * 那就不叫待办了。改条目文字、增删条目仍然走编辑弹窗，职责分开。
   */
  const handleToggleTodo = useCallback((app: AppItem, itemId: string) => {
    void mutateApps(
      list => list.map(item => (
        item.id === app.id ? { ...item, todoItems: toggleTodoItem(item.todoItems ?? [], itemId) } : item
      )),
      '待办清单'
    )
  }, [mutateApps])

  /** 待办：一键清掉所有已完成条目，未完成的保持原顺序 */
  const handleClearCompletedTodos = useCallback((app: AppItem) => {
    void mutateApps(
      list => list.map(item => (
        item.id === app.id ? { ...item, todoItems: clearCompletedTodos(item.todoItems ?? []) } : item
      )),
      '待办清单'
    )
  }, [mutateApps])

  const handleContextMenuOpenWithBrowser = async (app: AppItem, browserId: string) => {
    const browser = (config?.browsers || []).find(item => item.id === browserId)
    if (!browser) return
    const success = await window.electronAPI.openUrlWithBrowser({ url: app.path, browserPath: browser.path })
    if (!success) {
      showMaintenanceSummary({
        title: '打开失败',
        items: [`无法用「${browser.name}」打开，请检查该浏览器在设置中的路径是否有效。`]
      })
    }
  }

  /* 卡片点击的最终分派。
     组合与文本需要界面状态（确认面板 / 阅读面板），交给各自的入口；
     其余类型落到 useAppCrud 的 handleOpenApp——它按 type 分派
     openApp / openFolder / openSteam / openUrl。 */
  const openCardTarget = (app: AppItem) => {
    if (app.type === 'group') {
      requestLaunchGroup(app)
      return
    }
    if (app.type === 'note') {
      setViewingNoteId(app.id)
      return
    }
    void handleOpenApp(app)
  }

  const handleCardClick = (e: React.MouseEvent, app: AppItem) => {
    // 刚拖拽过：这次 click 是左键松手后浏览器补发的，应当忽略。
    // 否则每次拖动排序都会顺手把应用打开。
    if (suppressNextCardClickRef.current) {
      suppressNextCardClickRef.current = false
      return
    }
    const flat = groupedApps.flatMap(group => group.apps)
    const index = flat.findIndex(item => item.id === app.id)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setSelectedAppIds(prev => prev.includes(app.id) ? prev.filter(id => id !== app.id) : [...prev, app.id])
      if (index !== -1) lastClickedIndexRef.current = index
      return
    }
    if (e.shiftKey && index !== -1) {
      e.preventDefault()
      const startIndex = lastClickedIndexRef.current ?? index
      const [lo, hi] = startIndex <= index ? [startIndex, index] : [index, startIndex]
      const range = flat.slice(lo, hi + 1).map(item => item.id)
      setSelectedAppIds(prev => Array.from(new Set([...prev, ...range])))
      return
    }
    if (selectedAppIds.length > 0) {
      // 已有多选时，普通点击只清除选择，避免误启动
      setSelectedAppIds([])
      lastClickedIndexRef.current = index === -1 ? null : index
      return
    }
    if (index !== -1) lastClickedIndexRef.current = index
    openCardTarget(app)
  }

  const handleCardContextMenu = (e: React.MouseEvent, app: AppItem) => {
    // 右键只弹菜单。以前这里还要处理"右键拖拽释放后 Windows 补发 contextmenu"，
    // 拖拽改到左键之后那条链路不存在了，屏蔽逻辑一并删掉。
    e.preventDefault()
    openAppContextMenu(e, app)
  }

  // 键盘导航：方向键按网格移动焦点（左右 ±1，上下 ±每行列数），Enter/Space 打开，F2 编辑
  const moveCardFocus = (appId: string, key: string) => {
    const flat = groupedApps.flatMap(group => group.apps)
    const index = flat.findIndex(item => item.id === appId)
    if (index === -1) return
    const columns = config?.ui?.gridColumns || 6
    let next = index
    if (key === 'ArrowRight') next = index + 1
    else if (key === 'ArrowLeft') next = index - 1
    else if (key === 'ArrowDown') next = index + columns
    else if (key === 'ArrowUp') next = index - columns
    if (next === index || next < 0 || next >= flat.length) return
    document.querySelector<HTMLElement>(`[data-app-id="${flat[next].id}"]`)?.focus()
  }

  const handleCardKeyDown = (e: React.KeyboardEvent, app: AppItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openCardTarget(app)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      moveCardFocus(app.id, e.key)
    } else if (e.key === 'F2') {
      e.preventDefault()
      setEditingApp(app)
      setShowEditApp(true)
    }
  }

  /* ── 收纳格 ── */

  const handleCreateCollection = async () => {
    const created = await createCollection(`收纳格 ${collections.length + 1}`, activeCategory)
    // 新建后立刻进入行内重命名，用户不用再点一次铅笔
    showCopyToast(`已创建「${created.name}」，点击标题即可重命名`)
  }

  const handleRenameCollection = (id: string, name: string) => {
    void renameCollection(id, name)
  }

  const handleToggleCollectionCollapsed = (id: string) => {
    void toggleCollectionCollapsed(id)
  }

  const handleDeleteCollection = async (id: string) => {
    const target = collectionsRef.current.find(item => item.id === id)
    const confirmed = await window.electronAPI.confirm(
      `确定删除收纳格「${target?.name ?? ''}」吗？\n格内项目不会被删除，只会回到原分类。`
    )
    if (!confirmed) return
    await deleteCollection(id)
  }

  /* 把卡片从收纳格里摘出来，回到它本来所属的分类网格里。
     收纳格只影响"在哪里显示"，所以这一步**不动 apps.json**，项目本身毫无变化。 */
  const handleRemoveFromCollection = async (app: AppItem) => {
    await removeAppsFromCollections([app.id])
    showCopyToast(`已将「${app.name}」移出收纳格`)
  }

  /* ── 关联文件夹 ── */

  /** 同步条目是只读的：能做的只有"在这个文件夹里不显示" */
  const handleHideSyncedEntry = async (app: AppItem) => {
    const parsed = parseSyncedAppId(app.id)
    if (!parsed) return
    await hideSyncedEntry(parsed.categoryId, parsed.path)
    showMaintenanceSummary({
      title: '已在关联文件夹中隐藏',
      items: [`「${app.name}」不会再出现在这个关联文件夹中，磁盘上的文件未受影响。`]
    })
  }

  const handleDeleteSyncedEntry = async (app: AppItem) => {
    const confirmed = await window.electronAPI.confirm(
      `「${app.name}」来自关联文件夹，不能从磁盘删除。\n改为在关联文件夹中隐藏它吗？`
    )
    if (!confirmed) return
    await handleHideSyncedEntry(app)
  }

  const handleBindFolder = async (category: Category) => {
    /* 走 safePickFolder 而不是裸 selectFolder：主进程异常 / 旧版 preload 时
       await 会抛未捕获 rejection，表现为"点了没反应"，而单测 mock 永远 resolve。 */
    const folderPath = await safePickFolder()
    if (!folderPath) return

    /* 选完目录就直接绑定，**不再弹任何确认框**：默认只显示这一层。
       以前这里拿 confirm 问"是否同时同步子文件夹内容"，那是非题里塞了三个选项——
       "取消"同时背着"不含子文件夹"和"算了不弄了"两个意思。
       改成三选一之后问题没消失，只是换了个地方：用户还是得先做一道选择题。
       既然绝大多数人只想要本层，就别问了；想连子文件夹一起显示，
       去「管理分类」里勾一下（改完立刻重扫，不用重新选目录）。 */
    const snapshot = await bindFolder(category.id, folderPath, false)
    const entryCount = snapshot?.entries.length ?? 0
    showMaintenanceSummary({
      title: '已关联文件夹',
      items: [
        /* 只说"关联到哪了"。刻意不写"仅当前层"——绑定时根本没让用户做选择，
           提示里再提一句范围，等于把一件用户没参与的决策摆到眼前。
           想改范围的人自己会去「管理分类」里找那个复选框。 */
        `「${category.name}」已关联到「${folderPath}」，内容将随该文件夹自动更新。`,
        /* 绑定完必须给个明确结果：目录是空的、或者读不出来，都比"一片空白"更需要说清楚。 */
        snapshot?.error
          ? '未能读取该文件夹，原因见上方横幅；处理后可点击「重试」。'
          : entryCount === 0
            ? '已同步 0 个条目：该文件夹当前为空。'
            : `已同步 ${entryCount} 个条目。`
      ]
    })
  }

  /* 「含子文件夹」的开关放在「管理分类」里，而不是绑定时问一次。
     改完立刻重扫，不需要重新选目录。 */
  const handleSetIncludeSubdirs = async (category: Category, includeSubdirs: boolean) => {
    const link = category.linkFolder
    if (!link) return
    await updateLinkFolder(category.id, { ...link, includeSubdirs })
    await Promise.resolve()
    await syncCategory(category.id, true)
  }

  const handleUnbindFolder = async (category: Category) => {
    const confirmed = await window.electronAPI.confirm(
      `解除「${category.name}」的文件夹关联？\n同步出来的条目会消失，磁盘上的文件不受影响。`
    )
    if (!confirmed) return
    await unbindFolder(category.id)
  }

  /* 应用被删除后清掉收纳格里的残留 id，否则会留下永远点不动的空位 */
  useEffect(() => {
    void pruneMissingMembers(apps.map(app => app.id))
  }, [apps, pruneMissingMembers])

  /* AppCard 是 memo 组件，网格里可能有几百个实例。上面这些回调若每次渲染都是新引用，
     memo 就会被完全击穿——拖拽时 dragover 高频 setState，会让每张卡片全量重渲染
     （这正是卡顿的根因）。这里统一换成标识稳定的版本，内部调用的仍是最新实现。 */
  const cardOnOpen = useStableCallback(handleCardClick)
  const cardOnEdit = useStableCallback((app: AppItem) => {
    if (app.isSynced) return
    setEditingApp(app)
    setShowEditApp(true)
  })
  const cardOnDelete = useStableCallback((app: AppItem) => {
    // 同步条目删不掉磁盘上的文件，退化成"在这个文件夹里隐藏"
    if (app.isSynced) { void handleDeleteSyncedEntry(app); return }
    void handleDeleteApp(app.id)
  })
  const cardOnSendFile = useStableCallback(handleSendFile)
  const cardOnMouseDown = useStableCallback(handleCardMouseDown)
  const cardOnContextMenu = useStableCallback(handleCardContextMenu)
  const cardOnKeyDown = useStableCallback(handleCardKeyDown)
  /* 空状态的「关联文件夹…」按钮。AppGrid 是 memo，回调引用必须稳定。 */
  const bindFolderStable = useStableCallback(handleBindFolder)

  const handleSaveAutoCategoryRules = async (rules: AutoCategoryRule[]) => {
    if (!config) return false
    return handleUpdateConfig({ ...config, autoCategoryRules: rules })
  }

  const displaySubcategories = useMemo(
    () => (activeCategory ? subcategories.filter(s => s.parentId === activeCategory) : subcategories),
    [activeCategory, subcategories]
  )

  const sortMode = config?.ui?.sortMode || 'manual'
  const sortAppsForDisplay = useCallback(
    (list: AppItem[]) => sortAppsForDisplayPure(list, sortMode),
    [sortMode]
  )

  // 与主区域渲染共用同一份分组数据：键盘导航按此顺序在卡片间移动焦点
  const isDraggingApp = draggedAppId !== null

  const groupedApps = useMemo(() => {
    /* 注意：这里**不能**把 draggedAppId 过滤掉。
       源卡片一旦从 DOM 移除，HTML5 拖拽的 dragend 就再也不会触发，
       清理逻辑全部失效、拖拽状态永久错乱（排序会整个坏掉）。
       要表达"已被拖走"，改用 CSS 把源卡片画成虚线空框（见 index.css）。 */
    const groups: { sub: Subcategory | null; apps: AppItem[] }[] = []
    /* 已收进收纳格的项目不再出现在子分类分组里——同一张卡片画两次，
       改一个另一个不跟着变，用户会以为数据坏了。
       ⚠️ 这里过滤掉的是"已经在收纳格里的"，不是"正在被拖的"——
       绝不能把正在拖拽的源卡片移出 DOM（dragend 会丢，拖拽状态永久错乱）。 */
    const gridApps = filteredApps.filter(a => !groupedAppIds.has(a.id))
    const noSub = sortAppsForDisplay(gridApps.filter(a => !a.subcategoryId))
    if (noSub.length > 0) groups.push({ sub: null, apps: noSub })
    for (const s of displaySubcategories) {
      const sApps = sortAppsForDisplay(gridApps.filter(a => a.subcategoryId === s.id))
      // 拖动应用时把"还没有任何应用"的子分类也渲染出来：
      // 否则网格里根本没有这一块，用户没法把应用归到空子分类上。
      if (sApps.length > 0 || isDraggingApp) groups.push({ sub: s, apps: sApps })
    }
    return groups
  }, [filteredApps, groupedAppIds, displaySubcategories, sortAppsForDisplay, isDraggingApp])

  useEffect(() => {
    setActiveSubcategoryId(null)
    setSelectedAppIds([])
  }, [activeCategory, setSelectedAppIds])

  const handleSubcategoryWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    if (maxScrollLeft <= 0) return

    const wheelDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (wheelDelta === 0) return

    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, el.scrollLeft + wheelDelta))
    if (nextScrollLeft === el.scrollLeft) return

    e.preventDefault()
    el.scrollLeft = nextScrollLeft
  }, [])

  // 渲染子分类按钮（内联下拉与独立栏共用）
  const renderSubcategoryButton = (sub: Subcategory) => (
    <button
      key={sub.id}
      data-subcategory-id={sub.id}
      data-dragover={dragOverSubId === sub.id ? 'true' : undefined}
      draggable
      onContextMenu={(e) => openCategoryContextMenu(e, { type: 'subcategory', id: sub.id })}
      onClick={() => {
        setActiveSubcategoryId(sub.id)
        const el = document.getElementById(`subcat-${sub.id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      data-active={activeSubcategoryId === sub.id}
      aria-current={activeSubcategoryId === sub.id ? 'location' : undefined}
      onDragStart={(e) => {
        setDraggedSubId(sub.id)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', sub.id)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        moveDragGhost(e.clientX, e.clientY)
        if (draggedSubId && draggedSubId !== sub.id) {
          e.dataTransfer.dropEffect = 'move'
          setDragOverSubId(sub.id)
        } else {
          const appId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
          if (appId) {
            e.dataTransfer.dropEffect = 'move'
            // 拖应用归类到子分类时同样要高亮：之前只在拖子分类排序时设置，
            // 导致把应用拖上来毫无反馈，看不出这里可以放。
            setDragOverSubId(sub.id)
          }
        }
      }}
      onDragLeave={() => setDragOverSubId(null)}
      onDrop={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        // 先把要做的事取出来，再统一收尾（拖到别的子分类会换分组、丢 dragend）
        const reorderSubId = draggedSubId && draggedSubId !== sub.id ? draggedSubId : null
        const appId = reorderSubId ? null : (draggedAppIdRef.current || e.dataTransfer.getData('text/plain'))
        clearDragState()
        if (reorderSubId) {
          /* 用松手位置在 chip 上的左右半边决定插到目标前还是后：
             拖到哪就停在哪，与应用卡片的网格重排同一套语义。 */
          const rect = e.currentTarget.getBoundingClientRect()
          const insertAfter = e.clientX > rect.left + rect.width / 2
          await handleReorderSubcategory(reorderSubId, sub.id, insertAfter)
        } else if (appId) {
          await handleMoveAppToSubcategory(appId, sub.id)
        }
      }}
      onDragEnd={() => {
        removeDragGhost()
        setDraggedSubId(null)
        setDragOverSubId(null)
      }}
      className={`focus-ring cursor-pointer px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
        dragOverSubId === sub.id
          ? draggedAppId
            ? 'bg-brand-600 text-white scale-105 shadow-lg shadow-brand-500/30 ring-2 ring-brand-300'
            : 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-400/30 ring-2 ring-emerald-300'
          : draggedSubId === sub.id
            ? 'opacity-40 scale-95'
            : activeSubcategoryId === sub.id
              ? 'bg-brand-600 text-white border border-brand-600 shadow-sm shadow-brand-500/20'
              : 'bg-white/50 text-slate-700 hover:bg-brand-500 hover:text-white hover:border-brand-500 border border-brand-100/40'
      }`}
    >
      <CategoryIcon icon={sub.icon} size={14} className="shrink-0" />
      <span>{sub.name}</span>
    </button>
  )

  const handleContentScroll = useCallback(() => {
    const container = dropZoneRef.current
    if (!container || displaySubcategories.length === 0) return
    const threshold = container.getBoundingClientRect().top + 88
    let current: string | null = null
    for (const subcategory of displaySubcategories) {
      const section = document.getElementById(`subcat-${subcategory.id}`)
      if (section && section.getBoundingClientRect().top <= threshold) {
        current = subcategory.id
      }
    }
    setActiveSubcategoryId(previous => previous === current ? previous : current)
  }, [displaySubcategories])

  /* 这里刻意不用 useCallback：它只挂在 shell 的 onDrop 上，不是 memo 组件的 props，
     标识稳定没有任何收益；而它依赖的 parsePathsToApps / showDropResult 都是每次渲染
     重建的普通函数，硬塞进依赖数组只会让"依赖每次都变"，警告换个形式再来一遍。 */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resetExternalDrag()

    // 拖应用落到网格空白处（不属于任何分组/卡片）时走到这里。
    // 不能只 return——拖拽态要等 100ms 后的 dragend 才清，这段时间预览贴图还挂在屏幕上
    if (draggedAppIdRef.current) {
      clearDragState()
      return
    }

    // Check for Steam URL in dragged text (e.g. dragging from browser)
    const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list')
    const steamMatch = textData ? parseSteamUrl(textData) : null

    if (steamMatch) {
      if (categoriesRef.current.length === 0) {
        alert('请先创建一个分类，再添加项目。')
        return
      }

      // Get real game name from Steam API
      let gameName = `Steam Game ${steamMatch.appId}`
      try {
        const realName = await window.electronAPI.getSteamGameName(steamMatch.steamUrl)
        if (realName) gameName = realName
      } catch {}

      const newApp: AppItem = {
        id: crypto.randomUUID(),
        name: gameName,
        path: steamMatch.steamUrl,
        icon: '',
        categoryId: activeCategoryRef.current || categoriesRef.current[0].id,
        subcategoryId: null,
        pinyin: getPinyin(gameName),
        firstLetter: getFirstLetter(gameName),
        type: 'steam'
      }
      await commitApps([...appsRef.current, newApp], 'Steam 游戏')

      // Extract Steam icon (from local cache or Steam CDN)
      const iconPath = await window.electronAPI.extractSteamIcon(steamMatch.steamUrl)
      if (iconPath) {
        await commitApps(
          appsRef.current.map(a => (a.id === newApp.id ? { ...a, icon: iconPath } : a)),
          'Steam 图标'
        )
      }
      return
    }

    const filePaths = getDroppedPathsFromEvent(e.dataTransfer)
    if (filePaths.length === 0) return

    if (categoriesRef.current.length === 0) {
      alert('请先创建一个分类，再添加项目。')
      return
    }

    const targetCategory = activeCategoryRef.current || (categoriesRef.current.length > 0 ? categoriesRef.current[0].id : '')
    const result = await parsePathsToApps(filePaths, targetCategory)
    const newApps = result.apps

    if (newApps.length > 0) {
      await commitApps([...appsRef.current, ...newApps], '导入')
      await extractIconsForApps(newApps)
    }
    showDropResult(result)
  }

  /* 每次渲染后把最新的实现放进 ref，供只挂一次的右键拖拽监听取用。
     不写依赖数组：目的就是「每次渲染都刷新一遍」，代价只是几次赋值。 */
  useEffect(() => {
    leftDragActionsRef.current = {
      reorder: handleReorderApp,
      toCategory: handleMoveAppToCategory,
      toSubcategory: handleMoveAppToSubcategory,
      toCollection: async (appId: string, collectionId: string) => {
        await addAppsToCollection(collectionId, [appId])
      }
    }
  })

  const handleExportDiagnostics = async () => {
    const result = await window.electronAPI.exportDiagnostics()
    if (result.success) {
      alert(`诊断日志已导出到：\n${result.filePath}`)
    } else if (result.error) {
      alert(`导出诊断日志失败：${result.error}`)
    }
  }

  const completeOnboarding = async () => {
    if (!config) return
    const nextConfig = { ...config, onboardingCompleted: true }
    setConfig(nextConfig)
    await persistConfig(nextConfig, '引导状态')
    setShowOnboarding(false)
  }

  const runUiCommand = useCallback(async (command: UiCommand) => {
    switch (command) {
      case 'open-organizer':
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'health-check':
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'refresh-icons':
        setShowSmartOrganize(true)
        await handleRefreshAllIcons()
        break
      case 'auto-categorize':
        await handleAutoCategorize()
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'import-shortcuts':
        setShowSmartOrganize(true)
        await handleImportShortcuts()
        await handleRunHealthCheck()
        break
      case 'restore-hidden':
        await handleRestoreHiddenApps()
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'export-backup':
        await handleExportBackup()
        break
    }
  }, [
    handleAutoCategorize,
    handleExportBackup,
    handleImportShortcuts,
    handleRefreshAllIcons,
    handleRestoreHiddenApps,
    handleRunHealthCheck
  ])

  useEffect(() => {
    return window.electronAPI.onUiCommand((command) => {
      void runUiCommand(command)
    })
  }, [runUiCommand])

  /* 暂停状态变化（托盘菜单 / 设置页按钮 / 暂停热键）→ 同步本地展示。
     配置里也可能带着 launchPaused，loadData 后一并刷新。 */
  useEffect(() => {
    const off = window.electronAPI.onLaunchPausedChanged((paused) => setLaunchPaused(paused))
    return off
  }, [])
  useEffect(() => {
    if (config) setLaunchPaused(config.launchPaused === true)
  }, [config])

  /* 搜索窗请求"在主界面中显示"某个项目：切到所属分类、清空子分类，并记下卡片 id。
     真正的滚动与高亮在下面的 effect 里等分类切换渲染完成后做。 */
  useEffect(() => {
    const off = window.electronAPI.onLocateApp(({ appId, categoryId }) => {
      if (categoryId) {
        setActiveCategory(categoryId)
        activeCategoryRef.current = categoryId
      }
      setActiveSubcategoryId(null)
      pendingLocateAppIdRef.current = appId
      setLocateNonce((n) => n + 1)
    })
    return off
  }, [])

  /* 分类切换 / 数据刷新后，若有待定位的卡片，滚动到它并临时高亮。
     高亮用 CSS 类 .locate-highlight（见 index.css），1.8s 后自动移除。 */
  useEffect(() => {
    const appId = pendingLocateAppIdRef.current
    if (!appId) return
    pendingLocateAppIdRef.current = null
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-app-id="${appId}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('locate-highlight')
      window.setTimeout(() => el.classList.remove('locate-highlight'), 1800)
    })
    return () => cancelAnimationFrame(raf)
  }, [activeCategory, apps, locateNonce])

  /* 全局快捷键注册失败时，主进程会推一条 hotkey-issue 过来——最常见的是启动时
     用户设的组合已经被别的程序占了。以前这种情况只有主进程的 console.error，
     界面上毫无反馈，用户只能自己猜"为什么按了没反应"。
     用自增 id 去重：补查通道和事件通道可能各送一次同一件事。 */
  const handledHotkeyIssueIdRef = useRef(0)
  /* 最近一次热键提示。除了弹 toast，还要把「实际生效的组合」传给设置页——
     用户在那里改键时得看到真相，否则「设置里写着 A、实际是 B」会让他反复改也找不到原因。 */
  const [hotkeyIssue, setHotkeyIssue] = useState<HotkeyIssue | null>(null)
  const notifyHotkeyIssue = useStableCallback((issue: HotkeyIssue) => {
    if (issue.id <= handledHotkeyIssueIdRef.current) return
    handledHotkeyIssueIdRef.current = issue.id
    setHotkeyIssue(issue)

    /* 旧默认热键迁移：与「注册失败」是两回事，措辞必须分开，
       否则用户会以为自己的快捷键被别的程序占用了。
       两个热键的迁移原因不同，所以两条文案也分开写。 */
    if (issue.migratedFrom || issue.searchMigratedFrom) {
      const items: string[] = []
      if (issue.migratedFrom) {
        items.push(`${issue.migratedFrom} 是 Windows 系统保留组合，无法注册。`)
        items.push(`默认全局快捷键已改为 ${issue.effectiveHotkey ?? DEFAULT_HOTKEY}，可在设置中修改。`)
      }
      if (issue.searchMigratedFrom) {
        items.push(
          `原搜索快捷键 ${issue.searchMigratedFrom} 会被本程序独占，导致其它软件无法使用该组合。`
        )
        items.push(
          `搜索快捷键已改为 ${issue.effectiveSearchHotkey ?? DEFAULT_SEARCH_HOTKEY}，可在设置中修改。`
        )
      }
      showMaintenanceSummary({ title: '默认全局快捷键已更新', items })
      return
    }

    const occupied = issue.keys.join('、')
    if (issue.recovered && issue.effectiveHotkey) {
      showMaintenanceSummary({
        title: '已自动改用备用组合',
        items: [
          `${occupied} 注册失败，可能已被其它程序占用。`,
          `已临时改用 ${issue.effectiveHotkey}；可在设置中更换为未被占用的组合。`
        ]
      })
      return
    }

    showMaintenanceSummary({
      title: '全局快捷键未生效',
      items: [
        `注册失败的组合：${occupied}。`,
        '请在设置中更换为未被占用的组合。'
      ]
    })
  })

  useEffect(() => {
    let disposed = false
    const handle = (issue: HotkeyIssue | null) => {
      if (!disposed && issue) notifyHotkeyIssue(issue)
    }
    // 挂载后补查一次：注册失败可能发生在页面加载完成之前，那时事件可能没送到
    void window.electronAPI.getHotkeyStatus()
      .then(handle)
      .catch(() => { /* 查不到不影响使用，静默 */ })
    const off = window.electronAPI.onHotkeyIssue(handle)
    return () => {
      disposed = true
      off()
    }
  }, [notifyHotkeyIssue])

  const toolbarIconOnly = config?.ui?.toolbarIconOnly !== false
  const activeLayout = config?.ui?.layout || 'horizon-workspace'
  const sidebarWidth = sidebarWidthDraft ?? config?.ui?.sidebarWidth ?? 240
  const shellStyle = { '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties
  const commitSidebarWidth = async (width: number) => {
    if (!config) return
    const currentUi = config.ui || {
      gridColumns: 6,
      cardSize: 'medium' as const,
      showIcon: true,
      showName: true,
      borderRadius: 8,
      theme: 'aurora' as const,
      layout: 'horizon-workspace' as const,
      sidebarWidth: 240
    }
    const success = await handleUpdateConfig({
      ...config,
      ui: { ...currentUi, sidebarWidth: width }
    })
    setSidebarWidthDraft(null)
    return success
  }

  /* 侧边栏宽度拖拽。两个入口共用这一套（见 useSidebarResize 的说明）：
     右边缘的手柄按下即生效；侧边栏任意位置则要横向移动超过阈值。 */
  const { begin: beginSidebarResize, consumeSuppressedClick } = useSidebarResize({
    value: sidebarWidth,
    onChange: setSidebarWidthDraft,
    onCommit: width => void commitSidebarWidth(width)
  })

  /* 把"整个侧边栏"变成拖拽热区。
     判定用几何而不是 closest('.category-nav')：两种布局下侧边栏的组成并不一样——
     command-rail 只有 .category-nav（row 2/5），studio-split 是 .category-nav（row 2）
     接 .subcategory-nav（row 3/5）。但两者都是**第一列**，宽度就是 --sidebar-width，
     上下界是 header 与 footer 之间。按这个框判定，布局差异被完全抹平。

     之前热区只有右边缘 14px、且 grid-row 停在 2/4（侧边栏实际到第 4 行结束），
     侧边栏最高那一段根本没有热区——这就是"位置变了"的来源。 */
  const handleShellPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    /* 横向工作区没有侧边栏，sidebarWidth 对它是一份死配置 */
    if (activeLayout === 'horizon-workspace') return
    /* 子分类按钮带 HTML5 draggable（拖拽排序），在它上面按下是想排序，不是改宽度 */
    if ((event.target as HTMLElement).closest('[draggable="true"]')) return
    const shell = shellRef.current
    if (!shell) return

    const shellRect = shell.getBoundingClientRect()
    const header = shell.querySelector('.app-header')
    const footer = shell.querySelector('.app-footer')
    const top = header ? header.getBoundingClientRect().bottom : shellRect.top
    const bottom = footer ? footer.getBoundingClientRect().top : shellRect.bottom

    const { clientX, clientY } = event
    if (clientX > shellRect.left + sidebarWidth) return
    if (clientY < top || clientY > bottom) return

    beginSidebarResize(event, { threshold: SIDEBAR_DRAG_THRESHOLD })
  }

  /* 把维护模块、底层 CRUD 的最新实现写进 ref，供 useUndoSnapshot / useCategoryDialogs
     在用户触发时读取。它们在本函数更靠后才就绪，不能用闭包直接捕获（会踩 TDZ），
     因此走 ref 转发——和 leftDragActionsRef 同一套路。每轮渲染都刷新，保证拿到最新闭包。 */
  maintenanceApiRef.current = {
    showMaintenanceSummary,
    handleRunHealthCheck
  }
  crudApiRef.current = {
    handleAddCategory,
    handleUpdateCategory,
    handleAddSubcategory,
    handleUpdateSubcategory
  }

  return (
    <div
      ref={shellRef}
      className={`app-shell layout-${activeLayout} flex flex-col h-screen relative theme-${config?.ui?.theme || 'aurora'}`}
      /* 拖拽进行中给 CSS 一个总开关：冻结卡片 hover 的过渡与模糊变化。
         hover 过渡期间每帧都要重绘该卡片（含 backdrop-filter 重新算模糊），
         鼠标快速划过一排卡片时会有十几条这样的动画同时在跑，是掉帧主力之一。 */
      data-drag-active={isDragEngaged || draggedSubId !== null ? 'true' : undefined}
      data-bg-kind={background && background.kind !== 'none' ? background.kind : undefined}
      style={shellStyle}
      onPointerDown={handleShellPointerDown}
      /* 在侧边栏里拖完宽度后，浏览器还会补一次 click——那次 click 的语义是
         "切换分类"，不吞掉就会出现"拖完宽度顺带换了分类"。捕获阶段拦，避免
         分类按钮的 onClick 先跑。 */
      onClickCapture={event => {
        if (!consumeSuppressedClick()) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
    >
      {/* 自定义背景（P2）：背景层 + 暗化遮罩层。
          两者都是绝对定位子项，脱离 .app-shell 那套显式网格，不必补 grid-row。 */}
      {background && background.kind !== 'none' && (
        <>
          <div className="app-bg-layer" aria-hidden="true" />
          <div className="app-bg-dim" aria-hidden="true" />
        </>
      )}
      {/* Aurora background orbs */}
      <div className="aurora-bg">
        <div className="aurora-orb aurora-orb--indigo" />
        <div className="aurora-orb aurora-orb--frost" />
        <div className="aurora-orb aurora-orb--violet" />
        <div className="aurora-orb aurora-orb--amber" />
        <div className="aurora-orb aurora-orb--rose" />
      </div>
      <WindowResizeHandles />
      <SidebarResizeHandle
        value={sidebarWidth}
        onChange={setSidebarWidthDraft}
        onCommit={(width) => void commitSidebarWidth(width)}
        begin={beginSidebarResize}
      />

      <HeaderOverview
        toolbarIconOnly={toolbarIconOnly}
        setShowAddApp={setShowAddApp}
        handleAddFolder={handleAddFolder}
        setShowSmartOrganize={setShowSmartOrganize}
        setShowSettings={setShowSettings}
        setShowUsageInsights={setShowUsageInsights}
        updateState={updateState}
        updateVersion={updateVersion}
        updateProgress={updateProgress}
        currentVersion={currentVersion}
        activeCategoryLabel={activeCategoryLabel}
        overviewHealth={overviewHealth}
        overviewStats={overviewStats}
        displaySubcategories={displaySubcategories}
        handleRefreshAllIcons={handleRefreshAllIcons}
        iconRefreshProgress={iconRefreshProgress}
        handleRestoreHiddenApps={handleRestoreHiddenApps}
        smartLaunchApps={smartLaunchApps}
        handleOpenApp={handleOpenApp}
      />

      <CategoryNav
        categoryBarRef={categoryBarRef}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        openCategoryContextMenu={openCategoryContextMenu}
        categories={categories}
        subcategories={subcategories}
        dragOverCategory={dragOverCategory}
        setDragOverCategory={setDragOverCategory}
        draggedAppIdRef={draggedAppIdRef}
        moveDragGhost={moveDragGhost}
        clearDragState={clearDragState}
        handleMoveAppToCategory={handleMoveAppToCategory}
        getDroppedPathsFromEvent={getDroppedPathsFromEvent}
        appsRef={appsRef}
        setApps={setApps}
        persistApps={persistApps}
        parsePathsToApps={parsePathsToApps}
        extractIconsForApps={extractIconsForApps}
        showDropResult={showDropResult}
        renderSubcategoryButton={renderSubcategoryButton}
        createCategoryFromMenu={createCategoryFromMenu}
        addSubcategoryFromMenu={addSubcategoryFromMenu}
        subcategoryBarRef={subcategoryBarRef}
        handleSubcategoryWheel={handleSubcategoryWheel}
        displaySubcategories={displaySubcategories}
        syncingCategoryIds={syncingCategoryIds}
        onCreateCollection={handleCreateCollection}
        onManageCategories={openCategoryManager}
      />

      {activeCategoryObject?.linkFolder && (
        <FolderSyncBanner
          folderPath={activeCategoryObject.linkFolder.path}
          error={errorsByCategory[activeCategoryObject.id] ?? null}
          syncing={syncingCategoryIds.includes(activeCategoryObject.id)}
          entryCount={syncedApps.filter(app => app.categoryId === activeCategoryObject.id).length}
          onResync={() => void syncCategory(activeCategoryObject.id, true)}
          onRebind={() => void handleBindFolder(activeCategoryObject)}
          onUnbind={() => void handleUnbindFolder(activeCategoryObject)}
        />
      )}

      <AppGrid
        dropZoneRef={dropZoneRef}
        handleContentScroll={handleContentScroll}
        activeCategory={activeCategory}
        dragOverGroupSubId={dragOverGroupSubId}
        groupedApps={groupedApps}
        collectionGroups={collectionGroups}
        dragOverCollectionId={dragOverCollectionId}
        onToggleCollectionCollapse={handleToggleCollectionCollapsed}
        onRenameCollection={handleRenameCollection}
        onDeleteCollection={handleDeleteCollection}
        config={config}
        draggedAppId={draggedAppId}
        dragOverAppId={dragOverAppId}
        dropInsertAfter={dropInsertAfter}
        selectedAppIdSet={selectedAppIdSet}
        cardOnOpen={cardOnOpen}
        cardOnEdit={cardOnEdit}
        cardOnDelete={cardOnDelete}
        cardOnSendFile={cardOnSendFile}
        cardOnMouseDown={cardOnMouseDown}
        cardOnContextMenu={cardOnContextMenu}
        cardOnKeyDown={cardOnKeyDown}
        filteredApps={filteredApps}
        /* 分类条目高度（P2-3）：取当前分类的 itemHeight；"全部"视图没有分类，走自适应 */
        activeItemHeight={categories.find(c => c.id === activeCategory)?.itemHeight}
        activeCategoryObject={activeCategoryObject}
        onBindFolder={bindFolderStable}
      />


      <SelectionBar
        selectedAppIds={selectedAppIds}
        categories={categories}
        subcategories={displaySubcategories}
        visibleAppIds={visibleAppIds}
        batchMoveToCategory={batchMoveToCategory}
        batchMoveToSubcategory={batchMoveToSubcategory}
        batchHideApps={batchHideApps}
        batchRestoreApps={batchRestoreApps}
        batchDeleteApps={batchDeleteApps}
        toggleSelectAll={toggleSelectAll}
        clearAppSelection={clearAppSelection}
      />

      <ToastStack
        undoSnapshot={undoSnapshot}
        restoreUndoSnapshot={restoreUndoSnapshot}
        setUndoSnapshot={setUndoSnapshot}
        copyToast={copyToast}
        maintenanceSummary={maintenanceSummary}
        showSmartOrganize={showSmartOrganize}
        clearMaintenanceSummary={clearMaintenanceSummary}
      />

      {categoryContextMenu && (
        <CategoryContextMenuOverlay
          menu={categoryContextMenu}
          categories={categories}
          subcategories={subcategories}
          onCreateCategory={createCategoryFromMenu}
          onManageCategories={openCategoryManager}
          onSelectCategory={category => {
            setActiveCategory(category.id)
            activeCategoryRef.current = category.id
            setCategoryContextMenu(null)
          }}
          onRenameCategory={renameCategoryFromMenu}
          onAddSubcategory={addSubcategoryFromMenu}
          onDeleteCategory={deleteCategoryFromMenu}
          onLocateSubcategory={subcategory => {
            setActiveSubcategoryId(subcategory.id)
            document.getElementById(`subcat-${subcategory.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            setCategoryContextMenu(null)
          }}
          onRenameSubcategory={renameSubcategoryFromMenu}
          onMoveSubcategory={(subcategory, parentId) => {
            void handleMoveSubcategory(subcategory.id, parentId)
            setCategoryContextMenu(null)
          }}
          onDeleteSubcategory={deleteSubcategoryFromMenu}
          onBindFolder={category => void handleBindFolder(category)}
          onResyncFolder={category => void syncCategory(category.id, true)}
          onUnbindFolder={category => void handleUnbindFolder(category)}
        />
      )}

      {appContextMenu && (
        <AppContextMenuOverlay
          menu={appContextMenu}
          categories={categories}
          subcategories={subcategories}
          browsers={config?.browsers || []}
          onOpen={app => openCardTarget(app)}
          onOpenAsAdmin={handleContextMenuOpenAsAdmin}
          onOpenWithSystem={app => void handleOpenAppWithSystem(app)}
          onLocate={app => { void window.electronAPI.showItemInFolder(app.path) }}
          onCopyPath={app => void handleContextMenuCopyPath(app)}
          onCopyLink={app => void handleContextMenuCopyContent(app)}
          onOpenWithBrowser={(app, browserId) => void handleContextMenuOpenWithBrowser(app, browserId)}
          onMoveTo={(app, target) => void handleContextMenuMove(app, target)}
          onHide={app => void handleContextMenuHide(app)}
          onHideInFolder={app => void handleHideSyncedEntry(app)}
          onEdit={app => { setEditingApp(app); setShowEditApp(true) }}
          onDelete={app => void handleDeleteApp(app.id)}
          onClose={() => setAppContextMenu(null)}
          collectionName={contextMenuCollection?.name ?? null}
          onRemoveFromCollection={app => void handleRemoveFromCollection(app)}
        />
      )}

      {/* 管理分类：图标 / 名称 / 外观 / 关联文件夹。
          这个组件此前只写好了、没有任何渲染点——分类字号与条目高度（P2-3）、
          以及「关联文件夹」都做在里面，等于整块功能不可达。入口见侧边栏的
          「管理分类」按钮与分类右键菜单。 */}
      {categoryManagerOpen && (
        <CategoryManagerModal
          categories={categories}
          onClose={closeCategoryManager}
          onAdd={(name, icon) => void handleAddCategory(name, icon)}
          /* keepApps = true：分类下的项目保留并回到「全部」视图，与弹窗里的确认文案一致 */
          onDelete={id => void handleDeleteCategory(id, true)}
          onUpdate={(id, name, icon, appearance) => void handleUpdateCategory(id, name, icon, appearance)}
          onBindFolder={category => void handleBindFolder(category)}
          onResyncFolder={category => void syncCategory(category.id, true)}
          onUnbindFolder={category => void handleUnbindFolder(category)}
          onSetIncludeSubdirs={(category, includeSubdirs) => void handleSetIncludeSubdirs(category, includeSubdirs)}
        />
      )}

      {categoryEditDialog && (
        <CategoryEditDialogOverlay
          dialog={categoryEditDialog}
          onChange={setCategoryEditDialog}
          onClose={() => setCategoryEditDialog(null)}
          onSubmit={submitCategoryEditDialog}
        />
      )}

      {categoryDeleteDialog && (
        <CategoryDeleteDialogOverlay
          dialog={categoryDeleteDialog}
          onClose={() => setCategoryDeleteDialog(null)}
          onConfirm={async keepApps => {
            const dialog = categoryDeleteDialog
            setCategoryDeleteDialog(null)
            if (dialog.type === 'category') {
              await handleDeleteCategory(dialog.id, keepApps)
            } else {
              await handleDeleteSubcategory(dialog.id, keepApps)
            }
          }}
        />
      )}

      {showSmartOrganize && (
        <SmartOrganizeModal
          apps={apps}
          categories={categories}
          autoCategoryRules={config?.autoCategoryRules || []}
          onSaveRules={handleSaveAutoCategoryRules}
          healthReport={healthReport}
          iconRefreshProgress={iconRefreshProgress}
          maintenanceSummary={maintenanceSummary}
          onClose={() => setShowSmartOrganize(false)}
          onRunHealthCheck={handleRunHealthCheck}
          onFixHealthIssues={handleFixHealthIssues}
          onRefreshIcons={handleRefreshAllIcons}
          onAutoCategorize={handleAutoCategorize}
          onImportShortcuts={handleImportShortcuts}
          onRelocateInvalid={handleRelocateInvalidApps}
          onCleanupInvalid={handleCleanupInvalidApps}
          onRestoreHidden={handleRestoreHiddenApps}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
        />
      )}

      {showUsageInsights && (
        <UsageInsightsModal
          apps={apps}
          onClose={() => setShowUsageInsights(false)}
          onHideApps={hideAppsByIds}
          onOpenApp={handleOpenApp}
        />
      )}

      {showSettings && config && (
        <SettingsModal
          config={config}
          currentVersion={currentVersion}
          onClose={() => setShowSettings(false)}
          onSave={handleUpdateConfig}
          updateState={updateState}
          updateVersion={updateVersion}
          updateSource={updateSource}
          updateError={updateError}
          onCheckUpdate={manualCheckForUpdate}
          onExportDiagnostics={handleExportDiagnostics}
          onOpenDataDirectory={() => window.electronAPI.openDataDirectory()}
          onOpenBackupsDirectory={() => window.electronAPI.openBackupsDirectory()}
          dataHealth={dataHealth ?? undefined}
          onRestoreCorruptBackup={handleRestoreCorruptBackup}
          onOpenCorruptBackupsDirectory={() => window.electronAPI.openCorruptBackupsDirectory()}
          effectiveHotkey={hotkeyIssue?.effectiveHotkey}
          launchPaused={launchPaused}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          searchHotkey={config?.searchHotkey || DEFAULT_SEARCH_HOTKEY}
          onClose={completeOnboarding}
          onImportShortcuts={async () => {
            await handleImportShortcuts()
            await completeOnboarding()
          }}
        />
      )}

      {showAddApp && (
        <AddAppModal
          categories={categories}
          apps={apps}
          browsers={config?.browsers || []}
          urlMetaEnabled={config?.urlMetaEnabled !== false}
          onClose={() => setShowAddApp(false)}
          onAdd={handleAddApp}
          defaultCategory={activeCategory || ''}
        />
      )}

      {showEditApp && editingApp && (
        <EditAppModal
          app={editingApp}
          categories={categories}
          apps={apps}
          browsers={config?.browsers || []}
          urlMetaEnabled={config?.urlMetaEnabled !== false}
          onClose={() => { setShowEditApp(false); setEditingApp(null) }}
          onUpdate={handleUpdateApp}
        />
      )}

      {/* 文本项目的阅读面板：点开文本卡片时出现 */}
      {viewingNote && (
        <NoteViewerModal
          app={viewingNote}
          onClose={() => setViewingNoteId(null)}
          onEdit={app => {
            setViewingNoteId(null)
            setEditingApp(app)
            setShowEditApp(true)
          }}
          onCopy={app => void handleContextMenuCopyContent(app)}
          onToggleTodo={handleToggleTodo}
          onClearCompleted={handleClearCompletedTodos}
        />
      )}

      {/* 组合启动的确认面板：只有勾了「启动前先确认」的组合才会走到这里 */}
      {pendingGroup && (
        <LaunchGroupPanel
          group={pendingGroup}
          members={resolveGroupMembers(pendingGroup)}
          launching={groupLaunching}
          onConfirm={memberIds => confirmLaunchGroup(pendingGroup, memberIds)}
          onCancel={cancelLaunchGroup}
        />
      )}

      {updateState === 'available' && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) dismissUpdate() }}
        >
          <div className="glass rounded-2xl p-6 w-[400px] shadow-xl shadow-brand-500/5 modal-enter">
            <h3 className="text-lg font-display font-bold text-slate-800 mb-2">
              🎉 发现新版本 v{updateVersion}
            </h3>
            {updateReleaseNotes && (
              <div className="text-sm text-slate-600 mb-4 max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">更新内容：</p>
                <div className="whitespace-pre-wrap">{updateReleaseNotes}</div>
              </div>
            )}
            <p className="text-sm text-slate-500 mb-4">
              {updatePortable
                ? '便携版不支持自动安装更新，请到发布页下载新版本，解压后替换当前文件即可（数据保存在 exe 同目录，不会被覆盖）。'
                : '现在下载更新吗？'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={dismissUpdate}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {updatePortable ? '知道了' : '稍后'}
              </button>
              {updatePortable ? (
                <button
                  onClick={() => {
                    if (updateReleaseUrl) void window.electronAPI.openUrl(updateReleaseUrl)
                    dismissUpdate()
                  }}
                  className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                >
                  打开发布页
                </button>
              ) : (
                <button
                  onClick={startDownload}
                  className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                >
                  下载更新
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {updateState === 'downloaded' && (
        <UpdateDialog
          version={updateVersion}
          releaseNotes={updateReleaseNotes}
          error={updateError}
          onConfirm={confirmInstall}
          onDismiss={dismissUpdate}
        />
      )}

      {/* 应用内提示框：接管了 window.alert，放在最后渲染以保证压在所有浮层之上 */}
      <AppNoticeDialog />
    </div>
  )
}


export default App

