import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AppItem, AutoCategoryRule, Category, Subcategory, Config, UiCommand } from '../../shared/types'
import type { CorruptBackupInfo, DataHealth, UpdateInstallStatus } from '../../shared/electron'
import { parseSteamUrl, ALL_FILE_EXTS_SET, getFileExtension } from '../../shared/utils'
import { getPinyin, getFirstLetter } from './utils/pinyin'
import { sortAppsForDisplay as sortAppsForDisplayPure } from './utils/sortApps'
import { computeReorder, isPointerPastMidpoint } from './utils/reorder'
import { buildShortcutTargetMap, getDroppedPathIdentities, getDroppedPaths, normalizeDroppedPath } from './utils/dropPaths'
import {
  removeCategoryFromApps,
  removeSubcategoryFromApps
} from './utils/categoryDeletion'
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
import { UpdateDialog } from './components/UpdateButton'
import { SidebarResizeHandle } from './components/SidebarResizeHandle'
import { WindowResizeHandles } from './components/WindowResizeHandles'
import {
  CategoryContextMenuOverlay,
  CategoryDeleteDialogOverlay,
  CategoryEditDialogOverlay
} from './components/CategoryOverlays'
import { AppContextMenuOverlay } from './components/AppContextMenuOverlay'
// 第 7 步：把顶部概览 / 分类导航 / 卡片网格 / 多选条 / 提示栈拆成纯展示组件，
// App 只负责把状态与回调透传过去，行为与原来内联 JSX 完全一致。
import { HeaderOverview } from './components/HeaderOverview'
import { CategoryNav } from './components/CategoryNav'
import { AppGrid } from './components/AppGrid'
import { SelectionBar } from './components/SelectionBar'
import { ToastStack } from './components/ToastStack'
import { canNativeDrag, isDocFile } from './utils/fileKind'
import type { AppContextMenuState, MoveTarget } from './components/AppContextMenuOverlay'
import {
  AddAppModal,
  EditAppModal,
  OnboardingModal,
  SettingsModal,
  SmartOrganizeModal,
} from './components/modals'


type ParsedDrop = { apps: AppItem[]; duplicateCount: number; unsupportedCount: number }

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
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [dragOverAppId, setDragOverAppId] = useState<string | null>(null)
  const [draggedSubId, setDraggedSubId] = useState<string | null>(null)
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null)
  /** 拖应用悬停在网格里的子分类分组上时的目标分组（'__none__' 表示未归类分组） */
  const [dragOverGroupSubId, setDragOverGroupSubId] = useState<string | null>(null)
  /* 拖应用悬停在某张卡片上时，落点在该卡片的哪一半：false/null = 插到它前面，
     true = 插到它后面。既是松手时的依据，也用来画那条插入位置指示线——
     没有这条线，用户看到的是"拖到卡片右边，卡片却落到左边"，只能归因成"不准"。 */
  const [dropInsertAfter, setDropInsertAfter] = useState<boolean | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const categoryBarRef = useRef<HTMLDivElement>(null)
  const subcategoryBarRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const draggedAppIdRef = useRef<string | null>(null)
  const isExternalDragRef = useRef(false)
  /* 正在被拖拽的卡片如果是文件（图片/文档），这里记下它的路径。
     用途：同一个左键拖拽要同时支持「归类」和「发送」两种意图，靠落点区分——
     拖拽全程在窗口内 = 归类；拖出窗口 = 切换成系统原生拖拽（发送/上传到微信、浏览器等）。 */
  const pendingFileDragRef = useRef<string | null>(null)
  const leftDragRef = useRef<{ appId: string; active: boolean; startX: number; startY: number } | null>(null)
  /** 当前悬停的放置目标（'type:id'），用于避免 mousemove 里重复 setState */
  const leftDragTargetRef = useRef<string | null>(null)
  /** 拖拽看门狗：mouseup 与 mouseleave 双双丢失时兜底收尾，避免预览贴图永久残留 */
  const dragWatchdogRef = useRef<number | null>(null)

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
  const { selectedAppIds, setSelectedAppIds, selectedAppIdSet, lastClickedIndexRef, clearAppSelection } = useAppSelection()

  // 创建跟随鼠标的幽灵卡片（左键自绘拖拽引擎使用；幽灵自身的 DOM 引用在 useDragGhost 内部维护）
  const { createDragGhost, moveDragGhost, removeDragGhost } = useDragGhost(appsRef, config?.ui)

  /* dragover 每秒触发几十次，若每次都 setState 会让整个网格反复重渲染并卡死。
     用 ref 记住当前目标，只有真正切换到另一个分组时才更新 state。 */
  const dragOverGroupRef = useRef<string | null>(null)
  /* 落点的"插到目标前还是后"以前记在这里（由 HTML5 分组处理器写入）。
     统一切到左键自绘引擎后那套处理器被删了，这个 ref 只剩写和清、无人读——
     插入意图因此在迁移中丢失。现在改为在落点判定的帧内现算并存进 dropInsertAfter，
     不再需要这个 ref。 */
  /* 与 dragOverGroupRef 同样的 ref 守卫，给 dragOverAppId 用：
     mousemove 高频触发，同一目标卡片内移动不必反复 setState。 */
  const dragOverAppRef = useRef<string | null>(null)

  /* 右键拖拽的 mousemove/mouseup 监听只挂一次（下面的 effect 依赖数组是空数组）。
     如果直接在监听里调用这些函数，拿到的是**首渲染时**的闭包版本——
     handleReorderApp 内部要读 config.ui.sortMode，而首渲染时 config 还是 null，
     于是它永远走 'manual' 分支：用户切到「按名称/启动次数」排序后，右键拖拽的
     落点会与实际显示顺序对不上。这里用 ref 转发最新实现。
     （另外两个 handleMoveAppToXxx 目前只读 appsRef，暂不受影响，
       但一并转发，避免以后改动时再踩同一个坑。） */
  const leftDragActionsRef = useRef<{
    reorder: (sourceId: string, targetId: string, insertAfter?: boolean) => Promise<void>
    toCategory: (appId: string, categoryId: string) => Promise<void>
    toSubcategory: (appId: string, subcategoryId: string | null) => Promise<void>
  } | null>(null)

  /* 统一的拖拽收尾。
     ⚠️ 跨子分类拖动会让应用换到别的分组，源卡片的 DOM 被 React 移动/重建，
     于是 dragend 丢失——所有"靠 dragend 清理"的逻辑都会失效，预览贴图会永久
     留在屏幕上。所以 drop 处理里必须主动调它，而且要在任何 await 之前调，
     不能把清理挂在异步操作后面。 */
  const clearDragState = useCallback(() => {
    if (dragWatchdogRef.current) {
      window.clearTimeout(dragWatchdogRef.current)
      dragWatchdogRef.current = null
    }
    removeDragGhost()
    draggedAppIdRef.current = null
    dragOverGroupRef.current = null
    dragOverAppRef.current = null
    leftDragTargetRef.current = null
    setDraggedAppId(null)
    setDraggedSubId(null)
    setDragOverAppId(null)
    setDragOverCategory(null)
    setDragOverSubId(null)
    setDragOverGroupSubId(null)
    setDropInsertAfter(null)
  }, [removeDragGhost])

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
          items: ['数据已自动保留备份，如遇问题可在设置中导出诊断信息。']
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

  // 记住上次浏览的分类，跳过首次挂载（loadData 已按持久化值恢复）
  useEffect(() => {
    if (skipActiveCategoryPersistRef.current) {
      skipActiveCategoryPersistRef.current = false
      return
    }
    window.electronAPI.getConfig().then(latest => {
      window.electronAPI.saveConfig({ ...latest, lastActiveCategoryId: activeCategory })
    })
  }, [activeCategory])

  useEffect(() => {
    const resetExternalDrag = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        dragCounterRef.current = 0
        isExternalDragRef.current = false
      }
    }
    const handleGlobalDragEnd = () => {
      dragCounterRef.current = 0
      isExternalDragRef.current = false
      // 全局兜底：把所有拖拽态（含预览贴图）一次性收干净
      clearDragState()
    }
    document.addEventListener('dragleave', resetExternalDrag)
    document.addEventListener('dragend', handleGlobalDragEnd)
    return () => {
      document.removeEventListener('dragleave', resetExternalDrag)
      document.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [clearDragState])

  useEffect(() => {
    return () => {
      // 看门狗是个 30 秒的长定时器，卸载时必须清掉，
      // 否则它会在组件销毁后触发 clearDragState（对已卸载组件 setState）
      if (dragWatchdogRef.current) {
        window.clearTimeout(dragWatchdogRef.current)
        dragWatchdogRef.current = null
      }
    }
  }, [])

  /* 注意：图片/文档的原生拖拽不再单独挂一套 mousemove 监听。
     它现在由下面那个自绘拖拽引擎在「指针拖出窗口」时按需切换，见 switchToNativeDrag。 */

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

  /* 更新安装日志的打开结果。
     以前文件不存在时主进程只返回 false，界面表现为「点了没反应」；
     现在把「没有记录」和「打开失败」区分开，并顺带提示上次更新是否中断。 */
  const [installStatus, setInstallStatus] = useState<UpdateInstallStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    window.electronAPI.getUpdateInstallStatus()
      .then((status) => { if (!cancelled) setInstallStatus(status) })
      .catch(() => { /* 读不到就不提示，不影响其他功能 */ })
    return () => { cancelled = true }
  }, [])
  const handleOpenUpdateLog = useCallback(() => {
    void window.electronAPI.openUpdateLog()
      .then((result) => {
        if (result.ok) return
        showCopyToast(result.reason === 'not-found'
          ? '暂无更新安装记录：本次没有走到安装步骤'
          : '打开更新日志失败')
      })
      .catch(() => showCopyToast('打开更新日志失败'))
  }, [showCopyToast])

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
  /* 拖拽结束后抑制紧随其后的那次 click。
     左键松手时浏览器一定会补发 click，而卡片上挂着 onClick（打开应用）——
     不拦住的话"拖完排序"就会顺手把应用打开。由 handleLeftDragUp 置位、handleCardClick 消费。 */
  const suppressNextCardClickRef = useRef(false)
  const skipActiveCategoryPersistRef = useRef(true)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedAppIds.length > 0) {
        setSelectedAppIds([])
        return
      }
      const overlayOpen = showSettings || showAddApp || showEditApp || showSmartOrganize
        || !!appContextMenu || !!categoryContextMenu || !!categoryEditDialog || !!categoryDeleteDialog
      if (overlayOpen) return
      window.electronAPI.hideMainWindow()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showAddApp, showEditApp, showSmartOrganize, appContextMenu, categoryContextMenu, categoryEditDialog, categoryDeleteDialog, selectedAppIds, setSelectedAppIds])

  useEffect(() => {
    /* 左键自定义拖拽：普通应用拖到应用/分类/子分类上完成排序或归类。
       图片/文档的拖拽走系统原生拖拽（见下面那个 effect），不经过这里。

       为什么不用 HTML5 draggable：它的 dragover 受浏览器节流，幽灵卡片跟手度明显
       不如这里用 elementFromPoint 每帧定位。所以内部拖拽统一走这一套，draggable 已移除。 */
    const findDropTarget = (el: Element | null): { type: 'app' | 'category' | 'subcategory' | 'subcategory-drop'; id: string } | null => {
      if (!el) return null
      let node: Element | null = el
      for (let i = 0; i < 5 && node; i++) {
        if (node.hasAttribute?.('data-app-id')) return { type: 'app', id: node.getAttribute('data-app-id')! }
        if (node.hasAttribute?.('data-category-id')) return { type: 'category', id: node.getAttribute('data-category-id')! }
        if (node.hasAttribute?.('data-subcategory-id')) return { type: 'subcategory', id: node.getAttribute('data-subcategory-id')! }
        // 网格里的子分类分组区（拖拽也能往里归类）
        if (node.hasAttribute?.('data-subcategory-drop')) return { type: 'subcategory-drop', id: node.getAttribute('data-subcategory-drop')! }
        node = node.parentElement
      }
      return null
    }

    /** 指针是否已经离开窗口可视区域（clientX/Y 越界即视为离开） */
    const isPointerOutsideWindow = (e: MouseEvent) =>
      e.clientX <= 0 || e.clientY <= 0 ||
      e.clientX >= window.innerWidth || e.clientY >= window.innerHeight

    /* 把当前的文件拖拽切换成系统原生拖拽，用于「拖出窗口」时发送/上传到微信、浏览器等外部应用。
       ⚠️ 顺序不能变：必须先把内部拖拽状态收干净再启动原生拖拽。
       原生拖拽会接管鼠标，之后我们的 mouseup 收不到，残留的幽灵贴图和落点高亮就再也清不掉了。 */
    const switchToNativeDrag = (filePath: string) => {
      leftDragRef.current = null
      pendingFileDragRef.current = null
      /* 抑制点击。注意：原生拖拽被系统接管后通常**不会**补发 click，
         所以这个标志可能没人来消费——留个 500ms 自愈定时器把它清掉，
         否则它会一直悬着，把之后第一次正常点击吃掉（表现为"点了没反应"）。 */
      suppressNextCardClickRef.current = true
      window.setTimeout(() => { suppressNextCardClickRef.current = false }, 500)
      document.body.style.cursor = ''
      clearDragState()
      window.electronAPI.startDragFile(filePath)
    }

    /* 落点判定（elementFromPoint）会强制同步的样式重算 + 布局，代价很高。
       mousemove 在高回报率鼠标下每秒能来几百次，每来一次就强制一次布局——
       这是拖拽时最主要的 CPU 尖峰来源（快速拖动时尤其明显）。
       这里把判定收敛到「每帧最多一次」：中间那些坐标没有意义，只保留最后一次。 */
    let dropTargetRaf = 0
    let dropTargetX = 0
    let dropTargetY = 0

    /** 落点是否在这张应用卡片（data-app-id）的右半边 */
    const isPastCardMidpoint = (el: Element | null, x: number) => {
      const card = el?.closest('[data-app-id]')
      if (!card) return false
      const rect = card.getBoundingClientRect()
      return isPointerPastMidpoint(rect.left, rect.width, x)
    }

    const applyDropTargetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      const rawTarget = findDropTarget(el)
      const draggedId = leftDragRef.current?.appId
      const target = rawTarget && rawTarget.type === 'app' && rawTarget.id === draggedId
        ? null
        : rawTarget
      /* 落点在卡片哪一半 = 松手后插到它前面还是后面。这里现算，
         并把结果一并作为"目标"的一部分：同一张卡片内左右来回移动时，
         指示线与松手结果都要跟着变，不能因为卡片没换就跳过更新。 */
      const insertAfter = target?.type === 'app' ? isPastCardMidpoint(el, x) : null
      /* 目标没变就一个 setState 都别发，否则整个网格会被反复重渲染到卡死。 */
      const sideKey = insertAfter === null ? '' : insertAfter ? ':after' : ':before'
      const targetKey = target ? `${target.type}:${target.id}${sideKey}` : null
      if (leftDragTargetRef.current === targetKey) return
      leftDragTargetRef.current = targetKey

      if (!target) {
        setDragOverAppId(null)
        setDropInsertAfter(null)
        setDragOverCategory(null)
        setDragOverSubId(null)
        setDragOverGroupSubId(null)
        return
      }
      if (target.type === 'app') {
        setDragOverAppId(target.id)
        setDropInsertAfter(insertAfter)
        setDragOverCategory(null)
        setDragOverSubId(null)
        setDragOverGroupSubId(null)
      } else if (target.type === 'category') {
        setDragOverCategory(target.id)
        setDragOverAppId(null)
        // 非卡片目标没有"前后"之分，必须清掉指示线，否则从卡片移开后线还留着
        setDropInsertAfter(null)
        setDragOverSubId(null)
        setDragOverGroupSubId(null)
      } else if (target.type === 'subcategory') {
        setDragOverSubId(target.id)
        setDragOverAppId(null)
        setDragOverCategory(null)
        setDropInsertAfter(null)
        setDragOverGroupSubId(null)
      } else if (target.type === 'subcategory-drop') {
        setDragOverGroupSubId(target.id)
        dragOverGroupRef.current = target.id
        setDragOverAppId(null)
        setDragOverCategory(null)
        setDragOverSubId(null)
        setDropInsertAfter(null)
      }
    }

    const scheduleDropTargetUpdate = (x: number, y: number) => {
      dropTargetX = x
      dropTargetY = y
      if (dropTargetRaf) return
      dropTargetRaf = requestAnimationFrame(() => {
        dropTargetRaf = 0
        // 排进帧里执行时拖拽可能已经结束（快速甩动后立刻松手），此时不该再改高亮
        if (!leftDragRef.current?.active) return
        applyDropTargetAt(dropTargetX, dropTargetY)
      })
    }

    /* ── 拖拽帧率自检（仅开发环境；打包后渲染层走 file: 协议，自动关闭）──
       拖拽结束会在 DevTools Console 打一行 [drag-perf] 汇总：
       frames=总帧数 avg=平均帧间隔 worst=最差一帧 long>20ms=掉帧数。
       卡顿消失的判据：long 是 0 或个位数，avg 接近 16.7ms。 */
    const dragPerfOn = window.location.protocol !== 'file:'
    let perfFrames = 0
    let perfWorst = 0
    let perfLong = 0
    let perfLast = 0
    let perfStart = 0
    let perfRaf = 0
    const startDragPerf = () => {
      if (!dragPerfOn) return
      if (perfRaf) cancelAnimationFrame(perfRaf)
      perfFrames = 0
      perfWorst = 0
      perfLong = 0
      perfLast = performance.now()
      perfStart = perfLast
      const tick = (now: number) => {
        if (!leftDragRef.current?.active) {
          const total = now - perfStart
          const avg = perfFrames > 0 ? total / perfFrames : 0
          console.log(`[drag-perf] frames=${perfFrames} avg=${avg.toFixed(1)}ms worst=${perfWorst.toFixed(1)}ms long>20ms=${perfLong}`)
          perfRaf = 0
          return
        }
        const delta = now - perfLast
        perfLast = now
        perfFrames++
        if (delta > perfWorst) perfWorst = delta
        if (delta > 20) perfLong++
        perfRaf = requestAnimationFrame(tick)
      }
      perfRaf = requestAnimationFrame(tick)
    }

    const handleLeftDragMove = (e: MouseEvent) => {
      if (!leftDragRef.current) return
      if (!leftDragRef.current.active) {
        const dx = e.clientX - leftDragRef.current.startX
        const dy = e.clientY - leftDragRef.current.startY
        if (Math.abs(dx) + Math.abs(dy) < 3) return
        leftDragRef.current.active = true
        setDraggedAppId(leftDragRef.current.appId)
        draggedAppIdRef.current = leftDragRef.current.appId
        document.body.style.cursor = 'grabbing'
        createDragGhost(leftDragRef.current.appId, e.clientX, e.clientY)
        startDragPerf()
        /* 看门狗：拖到窗口外松手时 mouseup 可能收不到，拖拽状态就会永久卡住
           （表现为排序整个失灵、幽灵贴图留在屏幕上）。到点强制收尾。
           这是从原 HTML5 拖拽实现里迁移过来的保障，不能丢。 */
        if (dragWatchdogRef.current) window.clearTimeout(dragWatchdogRef.current)
        dragWatchdogRef.current = window.setTimeout(() => {
          dragWatchdogRef.current = null
          leftDragRef.current = null
          clearDragState()
        }, 30000)
      }
      /* 文件卡片被拖出窗口 → 这次手势的意图是"发送/上传"而不是"归类"。
         用落点意图区分两种功能，同一个左键手势就能同时覆盖它们，不需要用修饰键或另一个按钮。
         拖拽全程留在窗口内时不会走到这里，所以归类照常工作。 */
      const pendingFile = pendingFileDragRef.current
      if (pendingFile && isPointerOutsideWindow(e)) {
        switchToNativeDrag(pendingFile)
        return
      }
      moveDragGhost(e.clientX, e.clientY)
      // 落点判定收敛到帧内执行，不再每次 mousemove 都强制一次布局
      scheduleDropTargetUpdate(e.clientX, e.clientY)
    }

    const handleLeftDragUp = async (e: MouseEvent) => {
      document.body.style.cursor = ''
      removeDragGhost()
      if (!leftDragRef.current) return
      const { appId, active } = leftDragRef.current
      leftDragRef.current = null
      // 无论是否真的拖动过，这次手势结束都要清掉"待发送文件"的登记
      pendingFileDragRef.current = null
      if (!active) return
      /* 拖拽已经发生，这次按理不会打开应用。
         但左键松手后浏览器仍会补发一次 click，而卡片上挂着 onClick →
         不拦住的话"拖完排序"就会顺手把应用打开。这里置位，由 handleCardClick 消费。 */
      suppressNextCardClickRef.current = true
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = findDropTarget(el)
      /* 用**松手位置**现算插到目标前还是后，与拖拽过程中画的指示线同一套判断，
         所以"线画在哪、松手就落在哪"。刻意不读拖拽中的 state：最后一帧之后
         指针可能又移动了一小段，读旧值就会差一位。 */
      const insertAfter = target?.type === 'app' ? isPastCardMidpoint(el, e.clientX) : false
      // 先收尾再执行移动：下面的操作会 setApps 换分组、移动源卡片 DOM，
      // 事后再清容易漏（之前就漏了 dragOverAppRef / groupInsertPlanRef）
      clearDragState()
      const actions = leftDragActionsRef.current
      if (target && actions) {
        if (target.type === 'app' && target.id !== appId) {
          await actions.reorder(appId, target.id, insertAfter)
        } else if (target.type === 'category') {
          await actions.toCategory(appId, target.id)
        } else if (target.type === 'subcategory') {
          await actions.toSubcategory(appId, target.id)
        } else if (target.type === 'subcategory-drop') {
          await actions.toSubcategory(appId, target.id === '__none__' ? null : target.id)
        }
      }
    }

    /* 兜底：指针移出窗口时 mousemove 可能不再派发，光靠坐标判断会漏掉最后一段。
       documentElement 的 mouseleave 是"指针离开窗口"最可靠的信号。 */
    const handlePointerLeavesWindow = () => {
      const pendingFile = pendingFileDragRef.current
      if (!pendingFile) return
      if (!leftDragRef.current?.active) return
      switchToNativeDrag(pendingFile)
    }

    document.addEventListener('mousemove', handleLeftDragMove)
    document.addEventListener('mouseup', handleLeftDragUp)
    document.documentElement.addEventListener('mouseleave', handlePointerLeavesWindow)
    return () => {
      document.removeEventListener('mousemove', handleLeftDragMove)
      document.removeEventListener('mouseup', handleLeftDragUp)
      document.documentElement.removeEventListener('mouseleave', handlePointerLeavesWindow)
      // 待执行的落点判定要撤销，否则卸载后 rAF 仍会跑一次
      if (dropTargetRaf) {
        cancelAnimationFrame(dropTargetRaf)
        dropTargetRaf = 0
      }
      if (perfRaf) {
        cancelAnimationFrame(perfRaf)
        perfRaf = 0
      }
      removeDragGhost()
    }
    /* 这四个都来自 useDragGhost / clearDragState，标识稳定（内部是 useCallback + ref），
       加进依赖不会让监听反复解绑重绑。监听里需要"最新实现"的部分（重排、归类）
       统一走 leftDragActionsRef 转发，见上面的说明。 */
  }, [clearDragState, createDragGhost, moveDragGhost, removeDragGhost])

  /* dragend 兜底：万一源节点被异常移除，React 的 onDragEnd 就收不到事件，
     拖拽状态会永久卡住（表现为排序整个失灵）。在 document 上再兜一层。 */
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
      `确定用备份「${backup.fileName}」覆盖当前数据文件吗？\n\n留档本身会保留，可以重复恢复。`
    )
    if (!confirmed) return
    const ok = await window.electronAPI.restoreCorruptBackup({
      backupPath: backup.backupPath,
      targetFile: backup.targetFile
    })
    if (!ok) {
      showCopyToast('恢复失败：备份内容无法解析')
      return
    }
    await refreshDataHealth()
    await loadData()
    showCopyToast('已从备份恢复，请核对数据是否正确')
  }, [refreshDataHealth, loadData, showCopyToast])

  const getFileNameFromPath = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, '/').split('/')
    const fileName = parts[parts.length - 1] || ''
    return fileName.replace(/\.exe$/i, '').replace(/\.lnk$/i, '')
  }

  const filteredApps = useMemo(() => {
    if (activeCategory) {
      return apps.filter(app => app.categoryId === activeCategory)
    }
    return apps
  }, [apps, activeCategory])

  const activeCategoryLabel = useMemo(() => {
    if (!activeCategory) return '全部项目'
    return categories.find(category => category.id === activeCategory)?.name || '当前分类'
  }, [activeCategory, categories])

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

  const recordAppLaunch = async (appId: string) => {
    const updatedApps = appsRef.current.map(item => item.id === appId
      ? { ...item, launchCount: (item.launchCount || 0) + 1, lastOpenedAt: Date.now() }
      : item
    )
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleOpenApp = async (app: AppItem) => {
    let success: boolean
    if (app.id === '__folder_path__') {
      success = await window.electronAPI.openFolder(app.path)
    } else if (app.type === 'steam') {
      success = await window.electronAPI.openSteam(app.path)
    } else if (app.type === 'folder') {
      success = await window.electronAPI.openFolder(app.path)
    } else {
      success = await window.electronAPI.openApp(app.path)
    }
    // 打开失败（路径失效等）不计入启动统计，避免污染智能启动和搜索排序
    if (success) await recordAppLaunch(app.id)
  }

  const handleSendFile = async (app: AppItem) => {
    const success = isDocFile(app)
      ? await window.electronAPI.copyFileToClipboard(app.path)
      : await window.electronAPI.copyImageToClipboard(app.path)
    showCopyToast(success ? `已复制「${app.name}」，可粘贴发送` : '复制失败，请重试')
  }


  const handleAddApp = async (name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam' = 'app', aliases: string[] = []) => {
    if (categories.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

    const currentApps = appsRef.current
    const duplicate = currentApps.find(app => app.name === name)
    if (duplicate) {
      alert(`已存在同名应用"${name}"，请使用其他名称。`)
      return
    }

    const duplicatePath = currentApps.find(app => normalizeDroppedPath(app.path) === normalizeDroppedPath(path))
    if (duplicatePath) {
      alert(`路径"${path}"已作为"${duplicatePath.name}"存在，无需重复添加。`)
      return
    }

    const newApp: AppItem = {
      id: crypto.randomUUID(),
      name,
      path,
      icon: '',
      categoryId,
      subcategoryId: null,
      pinyin: getPinyin(name),
      firstLetter: getFirstLetter(name),
      type,
      aliases
    }

    const updatedApps = [...currentApps, newApp]
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setShowAddApp(false)

    // Extract icon: for Steam, try Steam cache first; for others, extract from file
    let iconPath: string | null = null
    try {
      if (type === 'steam') {
        iconPath = await window.electronAPI.extractSteamIcon(path)
      }
      if (!iconPath) {
        iconPath = await window.electronAPI.extractIcon(path)
      }
    } catch { /* icon extraction failed, app still usable */ }
    if (iconPath) {
      const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
      appsRef.current = withIcon
      setApps(withIcon)
      await window.electronAPI.saveApps({ apps: withIcon })
    }
  }

  const handleUpdateApp = async (id: string, name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam', aliases: string[] = []) => {
    const currentApps = appsRef.current
    const existing = currentApps.find(a => a.id === id)
    if (!existing) return

    const duplicate = currentApps.find(a => a.name === name && a.id !== id)
    if (duplicate) {
      alert(`已存在同名应用"${name}"，请使用其他名称。`)
      return
    }

    const updatedApp: AppItem = {
      ...existing,
      name,
      path,
      categoryId,
      type,
      pinyin: getPinyin(name),
      firstLetter: getFirstLetter(name),
      aliases,
      // Clear old icon if path/type changed
      icon: (existing.path !== path || existing.type !== type) ? '' : existing.icon
    }

    const updatedApps = currentApps.map(a => a.id === id ? updatedApp : a)
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setShowEditApp(false)
    setEditingApp(null)

    // Re-extract icon if path or type changed
    if (existing.path !== path || existing.type !== type) {
      let iconPath: string | null = null
      try {
        if (type === 'steam') {
          iconPath = await window.electronAPI.extractSteamIcon(path)
        }
        if (!iconPath) {
          iconPath = await window.electronAPI.extractIcon(path)
        }
      } catch { /* icon extraction failed, app still usable */ }
      if (iconPath) {
        const withIcon = updatedApps.map(a => a.id === id ? { ...a, icon: iconPath } : a)
        appsRef.current = withIcon
        setApps(withIcon)
        await window.electronAPI.saveApps({ apps: withIcon })
      }
    }
  }

  const handleAddFolder = async () => {
    if (categories.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return

    const parts = folderPath.replace(/\\/g, '/').split('/')
    const folderName = parts[parts.length - 1] || '文件夹'

    const currentApps = appsRef.current
    const duplicate = currentApps.find(app => app.name === folderName)
    if (duplicate) {
      alert(`已存在同名文件夹"${folderName}"，请使用其他名称。`)
      return
    }

    const duplicatePath = currentApps.find(app => normalizeDroppedPath(app.path) === normalizeDroppedPath(folderPath))
    if (duplicatePath) {
      alert(`该文件夹已作为"${duplicatePath.name}"存在，无需重复添加。`)
      return
    }

    const newApp: AppItem = {
      id: crypto.randomUUID(),
      name: folderName,
      path: folderPath,
      icon: '',
      categoryId: activeCategoryRef.current || '',
      subcategoryId: null,
      pinyin: getPinyin(folderName),
      firstLetter: getFirstLetter(folderName),
      type: 'folder'
    }

    const updatedApps = [...currentApps, newApp]
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })

    let iconPath: string | null = null
    try {
      iconPath = await window.electronAPI.extractIcon(folderPath)
    } catch { /* icon extraction failed, folder still usable */ }
    if (iconPath) {
      const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
      appsRef.current = withIcon
      setApps(withIcon)
      await window.electronAPI.saveApps({ apps: withIcon })
    }
  }

  const handleDeleteApp = async (id: string) => {
    const currentApps = appsRef.current
    const app = currentApps.find(a => a.id === id)
    if (app) {
      const confirmed = await window.electronAPI.confirm(`确定要删除"${app.name}"吗？`)
      if (!confirmed) return
    }
    const updatedApps = currentApps.filter(app => app.id !== id)
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleMoveAppToCategory = async (appId: string, categoryId: string) => {
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app =>
      app.id === appId ? { ...app, categoryId, subcategoryId: null } : app
    )
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const parsePathsToApps = async (filePaths: string[], categoryId: string): Promise<ParsedDrop> => {
    const currentApps = appsRef.current
    const newApps: AppItem[] = []
    let duplicateCount = 0
    let unsupportedCount = 0

    // 统一从 shared/utils 取白名单，不要在这里再维护一份副本
    const allFileExts = ALL_FILE_EXTS_SET

    if (filePaths.length === 0) return { apps: newApps, duplicateCount, unsupportedCount }
    const shortcutPaths = [...currentApps.map(app => app.path), ...filePaths]
      .filter(filePath => filePath.toLowerCase().endsWith('.lnk'))
    const [pathInfos, resolvedShortcutTargets] = await Promise.all([
      window.electronAPI.classifyPaths(filePaths),
      window.electronAPI.resolveShortcutTargets(shortcutPaths)
    ])
    const pathInfoByPath = new Map(pathInfos.map(info => [info.path, info]))
    const shortcutTargets = buildShortcutTargetMap(resolvedShortcutTargets)
    const knownPaths = new Set(currentApps.map(app => normalizeDroppedPath(app.path)))
    for (const app of currentApps) {
      for (const identity of getDroppedPathIdentities(app.path, shortcutTargets)) knownPaths.add(identity)
    }

    for (const filePath of filePaths) {
      const identities = getDroppedPathIdentities(filePath, shortcutTargets)
      if (identities.some(identity => knownPaths.has(identity))) {
        duplicateCount++
        continue
      }
      const pathKey = identities[0]
      const info = pathInfoByPath.get(filePath)
      const ext = info?.extension || getFileExtension(filePath)
      const isKnownFile = allFileExts.has(ext)
      const isDirectory = !!info?.isDirectory

      if (info?.isFile && isKnownFile) {
        const name = getFileNameFromPath(filePath)
        if (!knownPaths.has(pathKey)) {
          newApps.push({
            id: crypto.randomUUID(),
            name,
            path: filePath,
            icon: '',
            categoryId,
            subcategoryId: null,
            pinyin: getPinyin(name),
            firstLetter: getFirstLetter(name),
            type: 'app'
          })
          for (const identity of identities) knownPaths.add(identity)
        }
      } else if (isDirectory) {
        const parts = filePath.replace(/\\/g, '/').split('/')
        const folderName = parts[parts.length - 1] || '文件夹'
        if (!knownPaths.has(pathKey)) {
          newApps.push({
            id: crypto.randomUUID(),
            name: folderName,
            path: filePath,
            icon: '',
            categoryId,
            subcategoryId: null,
            pinyin: getPinyin(folderName),
            firstLetter: getFirstLetter(folderName),
            type: 'folder'
          })
          for (const identity of identities) knownPaths.add(identity)
        }
      } else {
        unsupportedCount++
      }
    }

    return { apps: newApps, duplicateCount, unsupportedCount }
  }

  const showDropResult = ({ apps, duplicateCount, unsupportedCount }: ParsedDrop) => {
    const items = [
      ...(apps.length > 0 ? [`新增 ${apps.length} 个项目。`] : []),
      ...(duplicateCount > 0 ? [`跳过 ${duplicateCount} 个重复项目。`] : []),
      ...(unsupportedCount > 0 ? [`忽略 ${unsupportedCount} 个不支持的项目。`] : [])
    ]
    if (items.length === 0) return
    showMaintenanceSummary({
      title: apps.length > 0 ? '拖入完成' : duplicateCount > 0 ? '未添加重复项目' : '没有可导入的项目',
      items
    })
  }

  const getDroppedPathsFromEvent = (dataTransfer: DataTransfer): string[] => getDroppedPaths(
    Array.from(dataTransfer.files).map(file => ({ path: window.electronAPI.getPathForFile(file) })),
    dataTransfer.getData('text/uri-list'),
    dataTransfer.getData('text/plain')
  )

  const handleUpdateConfig = async (newConfig: Config) => {
    const success = await window.electronAPI.saveConfig(newConfig)
    if (!success) {
      alert('配置保存失败。若刚修改了快捷键，它可能已被其他程序占用；原配置已恢复。')
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
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories })
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
    alert('删除操作保存失败，原数据已恢复，请重试。')
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

  const handleUpdateCategory = async (id: string, name: string, icon: string) => {
    const updatedCategories = categories.map(cat => 
      cat.id === id ? { ...cat, name, icon } : cat
    )
    categoriesRef.current = updatedCategories
    setCategories(updatedCategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories })
  }

  const handleAddSubcategory = async (name: string, icon: string, parentId: string | null) => {
    const newSub: Subcategory = { id: crypto.randomUUID(), name, icon, parentId }
    const updated = [...subcategories, newSub]
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
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
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
  }

  const handleMoveAppToSubcategory = async (appId: string, subcategoryId: string | null) => {
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(a => a.id === appId ? { ...a, subcategoryId } : a)
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
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
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
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
    void window.electronAPI.openAppAsAdmin(app.path)
  }

  const handleContextMenuCopyPath = async (app: AppItem) => {
    const success = await window.electronAPI.copyTextToClipboard(app.path)
    showMaintenanceSummary({
      title: success ? '路径已复制' : '复制失败',
      items: [success ? app.path : '无法写入剪贴板，请重试。']
    })
  }

  const handleContextMenuMove = async (app: AppItem, target: MoveTarget) => {
    if (target.type === 'subcategory') {
      await handleMoveAppToSubcategory(app.id, target.id)
      return
    }
    if (target.type === 'none') {
      const updatedApps = appsRef.current.map(a =>
        a.id === app.id ? { ...a, categoryId: null, subcategoryId: null } : a
      )
      appsRef.current = updatedApps
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })
      return
    }
    await handleMoveAppToCategory(app.id, target.id)
  }

  const handleContextMenuHide = async (app: AppItem) => {
    const updatedApps = appsRef.current.map(a => a.id === app.id ? { ...a, hidden: true } : a)
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
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
    void handleOpenApp(app)
  }

  const batchMoveToCategory = async (categoryId: string) => {
    if (!categoryId || selectedAppIds.length === 0) return
    const ids = new Set(selectedAppIds)
    const updatedApps = appsRef.current.map(a => ids.has(a.id) ? { ...a, categoryId, subcategoryId: null } : a)
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    clearAppSelection()
  }

  const batchHideApps = async () => {
    if (selectedAppIds.length === 0) return
    const ids = new Set(selectedAppIds)
    const updatedApps = appsRef.current.map(a => ids.has(a.id) ? { ...a, hidden: true } : a)
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    clearAppSelection()
  }

  const batchDeleteApps = async () => {
    if (selectedAppIds.length === 0) return
    const confirmed = await window.electronAPI.confirm(`确定删除选中的 ${selectedAppIds.length} 个项目吗？（仅从列表移除，不删除文件）`)
    if (!confirmed) return
    captureUndoSnapshot('批量删除')
    const ids = new Set(selectedAppIds)
    const updatedApps = appsRef.current.filter(a => !ids.has(a.id))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '批量删除完成',
      items: [`已移除 ${ids.size} 个项目。`]
    })
    clearAppSelection()
  }

  const handleCardMouseDown = (e: React.MouseEvent, app: AppItem) => {
    // 只有左键参与拖拽。右键不再承担任何拖拽职责（见 2026-09-18 拖拽改造），
    // 它只负责弹出上下文菜单。
    if (e.button !== 0) return
    // preventDefault 压掉浏览器默认行为：不压的话拖动会变成选中卡片文字或拖动图片。
    e.preventDefault()
    /* 所有类型都进同一套内部拖拽引擎——文件（图片/文档）同样要能拖到分类/子分类上归类。
       这里以前按 canNativeDrag 分成互斥的两路，图片/文档被锁进"原生拖拽"，结果
       "归类"对文件变成不可达（拖文件只会触发发送）。现在只留一条路，
       发送意图改由「拖出窗口」来触发，见 handleLeftDragMove 里的 switchToNativeDrag。 */
    leftDragRef.current = { appId: app.id, active: false, startX: e.clientX, startY: e.clientY }
    // 文件额外记下路径：一旦拖出窗口就切换成系统原生拖拽
    pendingFileDragRef.current = canNativeDrag(app) ? app.path : null
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
      void handleOpenApp(app)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      moveCardFocus(app.id, e.key)
    } else if (e.key === 'F2') {
      e.preventDefault()
      setEditingApp(app)
      setShowEditApp(true)
    }
  }

  /* AppCard 是 memo 组件，网格里可能有几百个实例。上面这些回调若每次渲染都是新引用，
     memo 就会被完全击穿——拖拽时 dragover 高频 setState，会让每张卡片全量重渲染
     （这正是卡顿的根因）。这里统一换成标识稳定的版本，内部调用的仍是最新实现。 */
  const cardOnOpen = useStableCallback(handleCardClick)
  const cardOnEdit = useStableCallback((app: AppItem) => {
    setEditingApp(app)
    setShowEditApp(true)
  })
  const cardOnDelete = useStableCallback((app: AppItem) => { void handleDeleteApp(app.id) })
  const cardOnSendFile = useStableCallback(handleSendFile)
  const cardOnMouseDown = useStableCallback(handleCardMouseDown)
  const cardOnContextMenu = useStableCallback(handleCardContextMenu)
  const cardOnKeyDown = useStableCallback(handleCardKeyDown)

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
    const noSub = sortAppsForDisplay(filteredApps.filter(a => !a.subcategoryId))
    if (noSub.length > 0) groups.push({ sub: null, apps: noSub })
    for (const s of displaySubcategories) {
      const sApps = sortAppsForDisplay(filteredApps.filter(a => a.subcategoryId === s.id))
      // 拖动应用时把"还没有任何应用"的子分类也渲染出来：
      // 否则网格里根本没有这一块，用户没法把应用归到空子分类上。
      if (sApps.length > 0 || isDraggingApp) groups.push({ sub: s, apps: sApps })
    }
    return groups
  }, [filteredApps, displaySubcategories, sortAppsForDisplay, isDraggingApp])

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
      {sub.icon} {sub.name}
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

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedAppIdRef.current) return
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) {
      isExternalDragRef.current = true
      dragCounterRef.current++
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedAppIdRef.current) return
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      isExternalDragRef.current = false
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 更新自定义幽灵位置
    moveDragGhost(e.clientX, e.clientY)
    if (isExternalDragRef.current) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [moveDragGhost])

  const handleDragEnd = useCallback(() => {
    removeDragGhost()
    dragCounterRef.current = 0
    isExternalDragRef.current = false
    setDraggedAppId(null)
    setDragOverCategory(null)
    setDragOverAppId(null)
  }, [removeDragGhost])

  /* 这里刻意不用 useCallback：它只挂在 shell 的 onDrop 上，不是 memo 组件的 props，
     标识稳定没有任何收益；而它依赖的 parsePathsToApps / showDropResult 都是每次渲染
     重建的普通函数，硬塞进依赖数组只会让"依赖每次都变"，警告换个形式再来一遍。 */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    isExternalDragRef.current = false

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
        alert('请先创建一个分类，然后再添加应用。')
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
      const updatedApps = [...appsRef.current, newApp]
      appsRef.current = updatedApps
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })

      // Extract Steam icon (from local cache or Steam CDN)
      const iconPath = await window.electronAPI.extractSteamIcon(steamMatch.steamUrl)
      if (iconPath) {
        const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
        appsRef.current = withIcon
        setApps(withIcon)
        await window.electronAPI.saveApps({ apps: withIcon })
      }
      return
    }

    const filePaths = getDroppedPathsFromEvent(e.dataTransfer)
    if (filePaths.length === 0) return

    if (categoriesRef.current.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

    const targetCategory = activeCategoryRef.current || (categoriesRef.current.length > 0 ? categoriesRef.current[0].id : '')
    const result = await parsePathsToApps(filePaths, targetCategory)
    const newApps = result.apps

    if (newApps.length > 0) {
      const updatedApps = [...appsRef.current, ...newApps]
      appsRef.current = updatedApps
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })
      await extractIconsForApps(newApps)
    }
    showDropResult(result)
  }

  const handleReorderApp = async (sourceId: string, targetId: string, insertAfter = false) => {
    const currentApps = appsRef.current
    const sourceIndex = currentApps.findIndex(a => a.id === sourceId)
    const targetIndex = currentApps.findIndex(a => a.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    // 落点决定归属：拖到哪个子分类的应用旁边，就归入那个子分类。
    // 以前只挪数组位置不改 subcategoryId，导致应用排到了新位置却仍显示在原分组里，
    // 看上去像"拖过去又被弹回来"。
    const nextSubcategoryId = currentApps[targetIndex].subcategoryId ?? null
    const groupChanged = (currentApps[sourceIndex].subcategoryId ?? null) !== nextSubcategoryId

    // 非手动排序：顺序由排序规则决定，拖拽只用来改归属
    if ((config?.ui?.sortMode || 'manual') !== 'manual') {
      if (groupChanged) await handleMoveAppToSubcategory(sourceId, nextSubcategoryId)
      return
    }

    const updated = computeReorder(currentApps, sourceId, targetId, insertAfter, nextSubcategoryId)
    if (updated === null) return
    appsRef.current = updated
    setApps(updated)
    await window.electronAPI.saveApps({ apps: updated })
  }

  /* 每次渲染后把最新的实现放进 ref，供只挂一次的右键拖拽监听取用。
     不写依赖数组：目的就是「每次渲染都刷新一遍」，代价只是几次赋值。 */
  useEffect(() => {
    leftDragActionsRef.current = {
      reorder: handleReorderApp,
      toCategory: handleMoveAppToCategory,
      toSubcategory: handleMoveAppToSubcategory
    }
  })

  const handleExportDiagnostics = async () => {
    const result = await window.electronAPI.exportDiagnostics()
    if (result.success) {
      alert(`诊断日志已导出：\n${result.filePath}`)
    } else if (result.error) {
      alert(`导出诊断日志失败：${result.error}`)
    }
  }

  const completeOnboarding = async () => {
    if (!config) return
    const nextConfig = { ...config, onboardingCompleted: true }
    setConfig(nextConfig)
    await window.electronAPI.saveConfig(nextConfig)
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
      className={`app-shell layout-${activeLayout} flex flex-col h-screen relative theme-${config?.ui?.theme || 'aurora'}`}
      /* 拖拽进行中给 CSS 一个总开关：冻结卡片 hover 的过渡与模糊变化。
         hover 过渡期间每帧都要重绘该卡片（含 backdrop-filter 重新算模糊），
         鼠标快速划过一排卡片时会有十几条这样的动画同时在跑，是掉帧主力之一。 */
      data-drag-active={isDraggingApp || draggedSubId !== null ? 'true' : undefined}
      style={shellStyle}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
    >
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
      />

      <HeaderOverview
        toolbarIconOnly={toolbarIconOnly}
        setShowAddApp={setShowAddApp}
        handleAddFolder={handleAddFolder}
        setShowSmartOrganize={setShowSmartOrganize}
        setShowSettings={setShowSettings}
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
        parsePathsToApps={parsePathsToApps}
        extractIconsForApps={extractIconsForApps}
        showDropResult={showDropResult}
        renderSubcategoryButton={renderSubcategoryButton}
        createCategoryFromMenu={createCategoryFromMenu}
        addSubcategoryFromMenu={addSubcategoryFromMenu}
        subcategoryBarRef={subcategoryBarRef}
        handleSubcategoryWheel={handleSubcategoryWheel}
        displaySubcategories={displaySubcategories}
      />

      <AppGrid
        dropZoneRef={dropZoneRef}
        handleContentScroll={handleContentScroll}
        activeCategory={activeCategory}
        dragOverGroupSubId={dragOverGroupSubId}
        groupedApps={groupedApps}
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
      />


      <SelectionBar
        selectedAppIds={selectedAppIds}
        batchMoveToCategory={batchMoveToCategory}
        categories={categories}
        batchHideApps={batchHideApps}
        batchDeleteApps={batchDeleteApps}
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
          onDeleteSubcategory={deleteSubcategoryFromMenu}
        />
      )}

      {appContextMenu && (
        <AppContextMenuOverlay
          menu={appContextMenu}
          categories={categories}
          subcategories={subcategories}
          onOpen={app => void handleOpenApp(app)}
          onOpenAsAdmin={handleContextMenuOpenAsAdmin}
          onLocate={app => { void window.electronAPI.showItemInFolder(app.path) }}
          onCopyPath={app => void handleContextMenuCopyPath(app)}
          onMoveTo={(app, target) => void handleContextMenuMove(app, target)}
          onHide={app => void handleContextMenuHide(app)}
          onEdit={app => { setEditingApp(app); setShowEditApp(true) }}
          onDelete={app => void handleDeleteApp(app.id)}
          onClose={() => setAppContextMenu(null)}
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
          onCleanupInvalid={handleCleanupInvalidApps}
          onRestoreHidden={handleRestoreHiddenApps}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
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
          onOpenUpdateLog={handleOpenUpdateLog}
          installStatus={installStatus ?? undefined}
          dataHealth={dataHealth ?? undefined}
          onRestoreCorruptBackup={handleRestoreCorruptBackup}
          onOpenCorruptBackupsDirectory={() => window.electronAPI.openCorruptBackupsDirectory()}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
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
          onClose={() => setShowAddApp(false)}
          onAdd={handleAddApp}
          defaultCategory={activeCategory || ''}
        />
      )}

      {showEditApp && editingApp && (
        <EditAppModal
          app={editingApp}
          categories={categories}
          onClose={() => { setShowEditApp(false); setEditingApp(null) }}
          onUpdate={handleUpdateApp}
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
            <p className="text-sm text-slate-500 mb-4">是否下载更新？</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={dismissUpdate}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                稍后再说
              </button>
              <button
                onClick={startDownload}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
              >
                下载更新
              </button>
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
          onOpenLog={handleOpenUpdateLog}
        />
      )}
    </div>
  )
}


export default App

