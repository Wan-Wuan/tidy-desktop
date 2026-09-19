import { useCallback, useState } from 'react'
import type { AppItem, Category, Subcategory } from '../../../shared/types'
import { persistApps, persistCategories } from '../utils/persist'
import type { MaintenanceSummary } from './useMaintenance'

export type UndoSnapshot = {
  label: string
  apps: AppItem[]
  categories: Category[]
  subcategories: Subcategory[]
  activeCategory: string | null
}

/** restoreUndoSnapshot 在用户点击「撤销」时才执行，此时需要用到维护模块的两个输出。
 *  但维护模块（useMaintenance）在 App.tsx 里比本 hook 后调用，直接用闭包会踩 TDZ。
 *  因此由 App 把最新实现写进这个 ref，撤销时再读，和 leftDragActionsRef 同一套路。 */
export type MaintenanceApi = {
  showMaintenanceSummary?: (summary: MaintenanceSummary) => void
  handleRunHealthCheck?: () => Promise<void>
}

/**
 * 撤销快照：在执行「删除分类 / 批量删除 / 一键修复」等破坏性操作前，把当前
 * 应用 + 分类 + 子分类 + 当前分类整份拍下来；用户点撤销时整份还原并落盘。
 *
 * `captureUndoSnapshot` 只依赖 ref 镜像与本 hook 的 setter，可安全在 useMaintenance
 * 之前调用；`restoreUndoSnapshot` 额外依赖维护模块的两个输出，故走 ref 转发。
 * setApps / setCategories / setSubcategories 都来自更上层的 useAppData，直接注入即可。
 */
export function useUndoSnapshot(options: {
  appsRef: React.MutableRefObject<AppItem[]>
  categoriesRef: React.MutableRefObject<Category[]>
  subcategories: Subcategory[]
  activeCategoryRef: React.MutableRefObject<string | null>
  setApps: React.Dispatch<React.SetStateAction<AppItem[]>>
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
  setSubcategories: React.Dispatch<React.SetStateAction<Subcategory[]>>
  setActiveCategory: (id: string | null) => void
  maintenanceApiRef: React.MutableRefObject<MaintenanceApi | null>
}) {
  const {
    appsRef,
    categoriesRef,
    subcategories,
    activeCategoryRef,
    setApps,
    setCategories,
    setSubcategories,
    setActiveCategory,
    maintenanceApiRef
  } = options
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)

  const captureUndoSnapshot = useCallback((label: string) => {
    setUndoSnapshot({
      label,
      apps: appsRef.current.map(app => ({ ...app })),
      categories: categoriesRef.current.map(category => ({ ...category })),
      subcategories: subcategories.map(subcategory => ({ ...subcategory })),
      activeCategory: activeCategoryRef.current
    })
  }, [appsRef, categoriesRef, subcategories, activeCategoryRef])

  const restoreUndoSnapshot = useCallback(async () => {
    const snapshot = undoSnapshot
    if (!snapshot) return

    appsRef.current = snapshot.apps
    categoriesRef.current = snapshot.categories
    activeCategoryRef.current = snapshot.activeCategory
    setApps(snapshot.apps)
    setCategories(snapshot.categories)
    setSubcategories(snapshot.subcategories)
    setActiveCategory(snapshot.activeCategory)
    /* 检查落盘结果再决定提示文案。
       以前这里 Promise.all 忽略返回值、无条件弹「已撤销」——一旦写盘失败，
       界面恢复了、磁盘没有，用户会以为撤销成功，重启后才发现回退，属于
       误导性反馈（比不提示更糟）。 */
    const [appsOk, categoriesOk] = await Promise.all([
      persistApps(snapshot.apps, '撤销'),
      persistCategories(snapshot.categories, snapshot.subcategories, '撤销')
    ])
    const persisted = appsOk && categoriesOk
    setUndoSnapshot(null)
    maintenanceApiRef.current?.showMaintenanceSummary?.({
      title: persisted ? `已撤销：${snapshot.label}` : `撤销未完全落盘：${snapshot.label}`,
      items: persisted
        ? ['应用、分类和子分类已恢复到操作前状态。']
        : ['界面已恢复，但写入磁盘失败，重启后可能回退。建议确认磁盘状态后重新操作一次。']
    })
    await maintenanceApiRef.current?.handleRunHealthCheck?.()
  }, [
    undoSnapshot,
    appsRef,
    categoriesRef,
    activeCategoryRef,
    setApps,
    setCategories,
    setSubcategories,
    setActiveCategory,
    maintenanceApiRef
  ])

  return { undoSnapshot, setUndoSnapshot, captureUndoSnapshot, restoreUndoSnapshot }
}
