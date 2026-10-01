import { useCallback, useMemo } from 'react'
import type { AppItem, AppItemDraft, Category, Config } from '../../../shared/types'
import { ALL_FILE_EXTS_SET, getFileExtension } from '../../../shared/utils'
import { resolveProjectPath, toPortablePath } from '../../../shared/pathResolve'
import { getPinyin, getFirstLetter } from '../utils/pinyin'
import { getFileNameFromPath, getFolderName } from '../utils/fileUtils'
import { isDocFile } from '../utils/fileKind'
import { APP_TYPE_HAS_PATH, buildNewApp, buildUpdatedApp } from '../utils/appUpdate'
import { launchAppTarget, launchAppWithSystem } from '../utils/launchApp'
import { safePickFolder } from '../utils/nativeDialog'
import { persistApps } from '../utils/persist'
import { computeReorder } from '../utils/reorder'
import {
  buildShortcutTargetMap,
  getDroppedPathIdentities,
  getDroppedPaths,
  normalizeDroppedPath
} from '../utils/dropPaths'

export type ParsedDrop = { apps: AppItem[]; duplicateCount: number; unsupportedCount: number }

/** 维护提示条的最小入参；App 层传进来的 showMaintenanceSummary 比它更宽，兼容。 */
type SummaryInput = { title: string; items: string[] }

/** 与 AppContextMenuOverlay 的 MoveTarget 结构一致；这里独立声明，避免 hook 反向依赖组件。 */
type AppMoveTarget =
  | { type: 'category'; id: string }
  | { type: 'subcategory'; id: string }
  | { type: 'none' }

export interface UseAppCrudOptions {
  appsRef: React.MutableRefObject<AppItem[]>
  setApps: React.Dispatch<React.SetStateAction<AppItem[]>>
  categoriesRef: React.MutableRefObject<Category[]>
  activeCategoryRef: React.MutableRefObject<string | null>
  config: Config | null
  selectedAppIds: string[]
  setShowAddApp: (value: boolean) => void
  setShowEditApp: (value: boolean) => void
  setEditingApp: (app: AppItem | null) => void
  clearAppSelection: () => void
  showToast: (message: string) => void
  showSummary: (summary: SummaryInput) => void
  captureUndoSnapshot: (label: string) => void
}

/**
 * 应用数据的全部变更操作。
 *
 * 两个动机：
 *
 * 1. **收口「改数据」的唯一写法。** 原先 App.tsx 里散着十几处
 *    `appsRef.current = next; setApps(next); await persistApps(next, '…')` 三连。
 *    这套写法必须三样都写对，尤其 `appsRef.current` 一旦漏写，后面的 await
 *    就会读到旧数组——表现是"排序/归类偶发丢失"，极难复现。现在统一走
 *    `commitApps`，漏写不可能再发生。
 *
 * 2. **给 App.tsx 减负。** 这些操作与拖拽引擎、选择、分类弹窗相互独立，
 *    抽走后 App.tsx 只保留接线，文件体积和阅读负担都明显下降。
 *
 * 所有 handler 的依赖都是稳定引用（ref / setState / useCallback），
 * 因此返回的函数在组件整个生命周期内标识不变，传给 memo 组件不会击穿缓存。
 */
export function useAppCrud(options: UseAppCrudOptions) {
  const {
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
    showToast,
    showSummary,
    captureUndoSnapshot
  } = options

  /** 落盘 + 双写 state/ref 的唯一入口。 */
  const commitApps = useCallback(async (next: AppItem[], hint: string) => {
    appsRef.current = next
    setApps(next)
    return persistApps(next, hint)
  }, [appsRef, setApps])

  /* ---------------- 路径的「存」与「比」 ----------------
     `Config.envVars` / `portableRoot` 在**主进程**负责把路径还原成绝对路径（见
     main/pathResolver.ts）；渲染层这两件事各管一半：
       · 存：开了「优先保存相对路径」且路径落在基准目录下时，落盘存相对形式；
       · 比：去重比较一律按「解析后的绝对路径」归一化，否则同一条目以
             `D:\Portable\a.exe` 和 `a.exe` 两种写法存在时会各加一次。 */
  const pathContext = useMemo(() => ({
    envVars: config?.envVars ?? [],
    portableRoot: config?.portableRoot ?? null
  }), [config])

  /** 数据文件里该存的形式（便携模式下可能是相对路径） */
  const toStoredPath = useCallback((absPath: string) => {
    if (!absPath) return absPath
    return toPortablePath(absPath, {
      portableRoot: pathContext.portableRoot,
      preferRelative: config?.preferRelativePath === true
    }).path
  }, [pathContext, config])

  /** 去重比较键：先还原成绝对路径，再走既有的归一化（小写 + 统一分隔符） */
  const pathKeyOf = useCallback(
    (value: string) => normalizeDroppedPath(resolveProjectPath(value, pathContext).path || value),
    [pathContext]
  )

  /** 基于「最新」数组做一次变换并落盘；变换函数必须是纯函数。 */
  const mutateApps = useCallback(
    async (mutator: (apps: AppItem[]) => AppItem[], hint: string) => commitApps(mutator(appsRef.current), hint),
    [appsRef, commitApps]
  )

  /** 抽取图标：Steam 优先走 Steam 缓存/CDN，失败再退回通用抽取。 */
  const extractIconFor = useCallback(async (app: AppItem): Promise<string | null> => {
    /* 网址 / 文本 / 组合没有可提取图标的本地文件：
       · 网址的 favicon 在添加弹窗里就抓好带下来了（走 fetch-url-meta）；
       · 文本与组合用的是类型图标。
       硬去 `extractIcon('https://…')` 只会白跑一次 PowerShell 再失败。 */
    if (app.type === 'url' || app.type === 'note' || app.type === 'group') return null
    try {
      if (app.type === 'steam') {
        const steamIcon = await window.electronAPI.extractSteamIcon(app.path)
        if (steamIcon) return steamIcon
      }
      return await window.electronAPI.extractIcon(app.path)
    } catch {
      return null
    }
  }, [])

  /** 抽到图标就写回列表。抽不到不是错误——应用照常可用。 */
  const attachIcon = useCallback(async (app: AppItem, hint = '应用图标') => {
    const icon = await extractIconFor(app)
    if (!icon) return
    await mutateApps(list => list.map(item => (item.id === app.id ? { ...item, icon } : item)), hint)
  }, [extractIconFor, mutateApps])

  const recordAppLaunch = useCallback(async (appId: string) => {
    await mutateApps(list => list.map(item => (item.id === appId
      ? { ...item, launchCount: (item.launchCount || 0) + 1, lastOpenedAt: Date.now() }
      : item)), '启动记录')
  }, [mutateApps])

  const handleOpenApp = useCallback(async (app: AppItem) => {
    /* 分派规则收在 `utils/launchApp` 里，主窗口 / 搜索窗 / 右键菜单共用同一份。
       这里只负责"开起来之后记一次启动统计"。 */
    const success = await launchAppTarget(app, config)
    // 打开失败（路径失效等）不计入启动统计，避免污染智能启动和搜索排序
    if (success) await recordAppLaunch(app.id)
  }, [recordAppLaunch, config])

  /**
   * 忽略「用指定程序打开」，强制走系统关联程序。
   * 右键菜单里的「用系统默认方式打开」用它——配了指定程序之后仍然需要一条临时绕过的路。
   */
  const handleOpenAppWithSystem = useCallback(async (app: AppItem) => {
    const success = await launchAppWithSystem(app)
    if (success) await recordAppLaunch(app.id)
  }, [recordAppLaunch])

  const handleSendFile = useCallback(async (app: AppItem) => {
    const success = isDocFile(app)
      ? await window.electronAPI.copyFileToClipboard(app.path)
      : await window.electronAPI.copyImageToClipboard(app.path)
    showToast(success ? `已复制「${app.name}」，可粘贴发送` : '复制失败，请重试')
  }, [showToast])

  /**
   * 新建项目。
   *
   * 入参是**一个草稿对象**而不是 5 个位置参数：类型从 3 种涨到 6 种之后，
   * 每种类型各自多出 1~2 个字段（参数、正文、成员列表……），
   * 位置参数会变成 `(name, path, categoryId, type, aliases, args, workingDir, …)`
   * 这种谁都不敢改的签名。
   */
  const handleAddApp = useCallback(async (draft: AppItemDraft) => {
    if (categoriesRef.current.length === 0) {
      alert('请先创建一个分类，再添加项目。')
      return
    }

    const currentApps = appsRef.current
    const duplicate = currentApps.find(app => app.name === draft.name)
    if (duplicate) {
      alert(`已存在同名项目「${draft.name}」，请换一个名称。`)
      return
    }

    /* 只有带路径的类型才做路径去重。
       文本与组合的 path 是空串，一视同仁会让「第二条文本」被判成重复。 */
    if (APP_TYPE_HAS_PATH[draft.type] && draft.path) {
      const key = pathKeyOf(draft.path)
      const duplicatePath = currentApps.find(app => pathKeyOf(app.path) === key)
      if (duplicatePath) {
        alert(`该路径已作为「${duplicatePath.name}」存在，无需重复添加。`)
        return
      }
    }

    // 便携模式下落盘存相对路径；主进程启动时会用 portableRoot 还原回去
    const storedDraft = APP_TYPE_HAS_PATH[draft.type]
      ? { ...draft, path: toStoredPath(draft.path) }
      : draft
    const newApp = buildNewApp(storedDraft, crypto.randomUUID())

    await commitApps([...currentApps, newApp], '添加项目')
    setShowAddApp(false)
    // 网址带下来的 favicon 已经在了，不用再抽一次
    if (!newApp.icon) await attachIcon(newApp)
  }, [appsRef, categoriesRef, commitApps, attachIcon, setShowAddApp, pathKeyOf, toStoredPath])

  const handleUpdateApp = useCallback(async (id: string, draft: AppItemDraft) => {
    const currentApps = appsRef.current
    const existing = currentApps.find(a => a.id === id)
    if (!existing) return

    const duplicate = currentApps.find(a => a.name === draft.name && a.id !== id)
    if (duplicate) {
      alert(`已存在同名项目「${draft.name}」，请换一个名称。`)
      return
    }

    // 路径或类型变了才清空旧图标，换分类时清空子分类——细节见 utils/appUpdate 的说明
    const storedDraft = APP_TYPE_HAS_PATH[draft.type]
      ? { ...draft, path: toStoredPath(draft.path) }
      : draft
    const updatedApp = buildUpdatedApp(existing, storedDraft)

    await commitApps(currentApps.map(a => (a.id === id ? updatedApp : a)), '修改项目')
    setShowEditApp(false)
    setEditingApp(null)

    // 图标被清空说明路径/类型变了，需要重新提取
    if (!updatedApp.icon) await attachIcon(updatedApp)
  }, [appsRef, commitApps, attachIcon, setShowEditApp, setEditingApp, toStoredPath])

  const handleAddFolder = useCallback(async () => {
    if (categoriesRef.current.length === 0) {
      alert('请先创建一个分类，再添加项目。')
      return
    }

    /* 走 safePickFolder：裸 selectFolder 在 reject 时会变成未捕获 rejection，
       用户看到的是"点了没反应"（见 utils/nativeDialog.ts 的说明）。 */
    const folderPath = await safePickFolder()
    if (!folderPath) return

    const folderName = getFolderName(folderPath)

    const currentApps = appsRef.current
    const duplicate = currentApps.find(app => app.name === folderName)
    if (duplicate) {
      alert(`已存在同名文件夹「${folderName}」，请换一个名称。`)
      return
    }

    const duplicatePath = currentApps.find(app => pathKeyOf(app.path) === pathKeyOf(folderPath))
    if (duplicatePath) {
      alert(`该文件夹已作为「${duplicatePath.name}」存在，无需重复添加。`)
      return
    }

    const newApp: AppItem = {
      id: crypto.randomUUID(),
      name: folderName,
      path: toStoredPath(folderPath),
      icon: '',
      categoryId: activeCategoryRef.current || '',
      subcategoryId: null,
      pinyin: getPinyin(folderName),
      firstLetter: getFirstLetter(folderName),
      type: 'folder'
    }

    await commitApps([...currentApps, newApp], '添加文件夹')
    await attachIcon(newApp, '文件夹图标')
  }, [appsRef, categoriesRef, activeCategoryRef, commitApps, attachIcon, pathKeyOf, toStoredPath])

  const handleDeleteApp = useCallback(async (id: string) => {
    const currentApps = appsRef.current
    const app = currentApps.find(a => a.id === id)
    if (app) {
      const confirmed = await window.electronAPI.confirm(`确定删除「${app.name}」吗？`)
      if (!confirmed) return
    }
    await mutateApps(list => list.filter(item => item.id !== id), '删除应用')
  }, [appsRef, mutateApps])

  const handleMoveAppToCategory = useCallback(async (appId: string, categoryId: string) => {
    await mutateApps(
      list => list.map(app => (app.id === appId ? { ...app, categoryId, subcategoryId: null } : app)),
      '归类'
    )
  }, [mutateApps])

  const handleMoveAppToSubcategory = useCallback(async (appId: string, subcategoryId: string | null) => {
    await mutateApps(
      list => list.map(a => (a.id === appId ? { ...a, subcategoryId } : a)),
      '归类'
    )
  }, [mutateApps])

  const handleContextMenuMove = useCallback(async (app: AppItem, target: AppMoveTarget) => {
    if (target.type === 'subcategory') {
      await handleMoveAppToSubcategory(app.id, target.id)
      return
    }
    if (target.type === 'none') {
      await mutateApps(
        list => list.map(a => (a.id === app.id ? { ...a, categoryId: null, subcategoryId: null } : a)),
        '归类'
      )
      return
    }
    await handleMoveAppToCategory(app.id, target.id)
  }, [handleMoveAppToCategory, handleMoveAppToSubcategory, mutateApps])

  const handleContextMenuHide = useCallback(async (app: AppItem) => {
    await mutateApps(list => list.map(a => (a.id === app.id ? { ...a, hidden: true } : a)), '隐藏')
  }, [mutateApps])

  const handleReorderApp = useCallback(async (sourceId: string, targetId: string, insertAfter = false) => {
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
    await commitApps(updated, '排序')
  }, [appsRef, config, commitApps, handleMoveAppToSubcategory])

  const batchMoveToCategory = useCallback(async (categoryId: string) => {
    if (!categoryId || selectedAppIds.length === 0) return
    const ids = new Set(selectedAppIds)
    await mutateApps(
      list => list.map(a => (ids.has(a.id) ? { ...a, categoryId, subcategoryId: null } : a)),
      '归类'
    )
    clearAppSelection()
  }, [selectedAppIds, mutateApps, clearAppSelection])

  const batchHideApps = useCallback(async () => {
    if (selectedAppIds.length === 0) return
    const ids = new Set(selectedAppIds)
    await mutateApps(list => list.map(a => (ids.has(a.id) ? { ...a, hidden: true } : a)), '隐藏')
    clearAppSelection()
  }, [selectedAppIds, mutateApps, clearAppSelection])

  /** 批量恢复显示：隐藏项攒多了之后逐个右键太费劲。 */
  const batchRestoreApps = useCallback(async () => {
    if (selectedAppIds.length === 0) return
    const ids = new Set(selectedAppIds)
    await mutateApps(list => list.map(a => (ids.has(a.id) ? { ...a, hidden: false } : a)), '恢复显示')
    clearAppSelection()
  }, [selectedAppIds, mutateApps, clearAppSelection])

  /**
   * 批量归入子分类。
   * 子分类归属于它的父分类，所以顺带把 categoryId 对齐到父分类——否则应用会
   * 出现在「某分类的子分类」里却挂在另一个分类名下，切分类时找不到它。
   * 父分类未知（如子分类已被删）时保留原有 categoryId，不做破坏性改写。
   */
  const batchMoveToSubcategory = useCallback(async (subcategoryId: string, parentCategoryId: string | null) => {
    if (selectedAppIds.length === 0) return
    const ids = new Set(selectedAppIds)
    await mutateApps(
      list => list.map(a => (ids.has(a.id)
        ? { ...a, subcategoryId, categoryId: parentCategoryId ?? a.categoryId }
        : a)),
      '归类'
    )
    clearAppSelection()
  }, [selectedAppIds, mutateApps, clearAppSelection])

  const batchDeleteApps = useCallback(async () => {
    if (selectedAppIds.length === 0) return
    const confirmed = await window.electronAPI.confirm(
      `确定删除选中的 ${selectedAppIds.length} 个项目吗？仅从列表移除，不删除文件。`
    )
    if (!confirmed) return
    const ids = new Set(selectedAppIds)
    captureUndoSnapshot('批量删除')
    /* 先收起多选条，再落盘。
       多选条和撤销条都固定在底部居中（bottom-16），同时存在会叠成一团。
       这里先 clearAppSelection() 再 await：await 会让出一次渲染，
       多选条先退场，撤销条随后进场，不会撞在一起。 */
    clearAppSelection()
    await mutateApps(list => list.filter(a => !ids.has(a.id)), '批量删除')
    showSummary({
      title: '批量删除已完成',
      items: [`已移除 ${ids.size} 个项目。`]
    })
  }, [selectedAppIds, mutateApps, captureUndoSnapshot, showSummary, clearAppSelection])

  /** 按 id 批量隐藏。供使用情况面板这类「不依赖当前选择集」的入口复用。 */
  const hideAppsByIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const set = new Set(ids)
    await mutateApps(list => list.map(a => (set.has(a.id) ? { ...a, hidden: true } : a)), '隐藏')
  }, [mutateApps])

  /**
   * 把拖入的路径解析成可添加的应用（过滤重复与不支持的类型）。
   * 纯计算 + 一次 IPC 分类，不碰 state。
   */
  const parsePathsToApps = useCallback(async (filePaths: string[], categoryId: string): Promise<ParsedDrop> => {
    const currentApps = appsRef.current
    const newApps: AppItem[] = []
    let duplicateCount = 0
    let unsupportedCount = 0

    // 统一从 shared/utils 取白名单，不要在这里再维护一份副本
    const allFileExts = ALL_FILE_EXTS_SET

    if (filePaths.length === 0) return { apps: newApps, duplicateCount, unsupportedCount }
    /* 已存条目可能是相对路径（便携模式），先还原成绝对路径再去重、
       再交给主进程解析快捷方式——否则 `.lnk` 会读不到、重复项也判不出来。 */
    const resolveToAbs = (value: string) => resolveProjectPath(value, pathContext).path || value
    const shortcutPaths = [...currentApps.map(app => resolveToAbs(app.path)), ...filePaths]
      .filter(filePath => filePath.toLowerCase().endsWith('.lnk'))
    const [pathInfos, resolvedShortcutTargets] = await Promise.all([
      window.electronAPI.classifyPaths(filePaths),
      window.electronAPI.resolveShortcutTargets(shortcutPaths)
    ])
    const pathInfoByPath = new Map(pathInfos.map(info => [info.path, info]))
    const shortcutTargets = buildShortcutTargetMap(resolvedShortcutTargets)
    const knownPaths = new Set(currentApps.map(app => normalizeDroppedPath(resolveToAbs(app.path))))
    for (const app of currentApps) {
      for (const identity of getDroppedPathIdentities(resolveToAbs(app.path), shortcutTargets)) knownPaths.add(identity)
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
        if (!knownPaths.has(pathKey)) {
          const name = getFileNameFromPath(filePath)
          newApps.push({
            id: crypto.randomUUID(),
            name,
            path: toStoredPath(filePath),
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
        if (!knownPaths.has(pathKey)) {
          const folderName = getFolderName(filePath)
          newApps.push({
            id: crypto.randomUUID(),
            name: folderName,
            path: toStoredPath(filePath),
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
  }, [appsRef, pathContext, toStoredPath])

  /** 把拖入解析结果汇总成一条维护提示。 */
  const showDropResult = useCallback(({ apps, duplicateCount, unsupportedCount }: ParsedDrop) => {
    const items = [
      ...(apps.length > 0 ? [`新增 ${apps.length} 个项目。`] : []),
      ...(duplicateCount > 0 ? [`跳过 ${duplicateCount} 个重复项目。`] : []),
      ...(unsupportedCount > 0 ? [`忽略 ${unsupportedCount} 个不支持的项目。`] : [])
    ]
    if (items.length === 0) return
    showSummary({
      title: apps.length > 0 ? '拖入完成' : duplicateCount > 0 ? '未添加重复项目' : '没有可导入的项目',
      items
    })
  }, [showSummary])

  /** 从拖拽事件里取出真实文件路径（兼容 uri-list / text 两种载荷）。 */
  const getDroppedPathsFromEvent = useCallback((dataTransfer: DataTransfer): string[] => getDroppedPaths(
    Array.from(dataTransfer.files).map(file => ({ path: window.electronAPI.getPathForFile(file) })),
    dataTransfer.getData('text/uri-list'),
    dataTransfer.getData('text/plain')
  ), [])

  return {
    commitApps,
    mutateApps,
    extractIconFor,
    attachIcon,
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
  }
}
