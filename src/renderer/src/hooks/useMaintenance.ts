import { useCallback, useRef, useState } from 'react'
import type { AppItem, Category, Config, Subcategory } from '../../../shared/types'
import { getPinyin, getFirstLetter } from '../utils/pinyin'
import { hasDisplayableIcon, needsIconUpdate } from '../utils/iconUtils'
import { deduplicateAppsByPath, filterStillEmptyCategories, findEmptyCategories } from '../utils/maintenance'
import { filterNewShortcutItems } from '../utils/shortcutImport'
import type { ShortcutImportItem } from '../../../shared/types'
import type { HealthReport, IconRefreshProgress } from '../components/modals/types'

export type MaintenanceSummary = { title: string; items: string[] }

function appNeedsIconUpdate(app: AppItem): boolean {
  return app.type !== 'folder' && needsIconUpdate(app.icon)
}

/**
 * 维护操作集：图标刷新、自动分类、失效清理、健康检查、快捷方式导入、备份等。
 * 从 App.tsx 原样搬运；应用/分类数据仍由 App 持有，通过 refs 与 setter 传入。
 */
export function useMaintenance(options: {
  appsRef: React.MutableRefObject<AppItem[]>
  categoriesRef: React.MutableRefObject<Category[]>
  categories: Category[]
  subcategories: Subcategory[]
  config: Config | null
  activeCategoryRef: React.MutableRefObject<string | null>
  setActiveCategory: (id: string | null) => void
  setApps: React.Dispatch<React.SetStateAction<AppItem[]>>
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
  setSubcategories: React.Dispatch<React.SetStateAction<Subcategory[]>>
  captureUndoSnapshot: (label: string) => void
  loadData: () => Promise<void>
  scheduleIconBackfill: (apps: AppItem[]) => void
}) {
  const {
    appsRef, categoriesRef, categories, subcategories, config, activeCategoryRef,
    setActiveCategory, setApps, setCategories, setSubcategories,
    captureUndoSnapshot, loadData, scheduleIconBackfill
  } = options

  const [maintenanceSummary, setMaintenanceSummary] = useState<MaintenanceSummary | null>(null)
  const [iconRefreshProgress, setIconRefreshProgress] = useState<IconRefreshProgress | null>(null)
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const maintenanceSummaryTimerRef = useRef<number | null>(null)
  const shortcutImportInFlightRef = useRef(false)

  const showMaintenanceSummary = useCallback((summary: MaintenanceSummary, autoDismiss = true) => {
    if (maintenanceSummaryTimerRef.current) {
      window.clearTimeout(maintenanceSummaryTimerRef.current)
      maintenanceSummaryTimerRef.current = null
    }
    setMaintenanceSummary(summary)
    if (autoDismiss) {
      maintenanceSummaryTimerRef.current = window.setTimeout(() => {
        maintenanceSummaryTimerRef.current = null
        setMaintenanceSummary(null)
      }, 10_000)
    }
  }, [])

  const clearMaintenanceSummary = useCallback(() => {
    if (maintenanceSummaryTimerRef.current) {
      window.clearTimeout(maintenanceSummaryTimerRef.current)
      maintenanceSummaryTimerRef.current = null
    }
    setMaintenanceSummary(null)
  }, [])

  const handleRefreshAllIcons = async () => {
    const cleared = await window.electronAPI.clearIconCache()
    const sourceApps = [...appsRef.current]
    const refreshTargets = sourceApps.filter(app => app.type !== 'folder')
    const refreshed: AppItem[] = [...sourceApps]
    const indexById = new Map(sourceApps.map((app, index) => [app.id, index]))
    let successCount = 0
    let failedCount = 0
    let doneCount = 0
    const failures: string[] = []
    const CONCURRENCY = 4
    const isBetterIcon = (nextIcon: string, previousIcon: string) => {
      if (!hasDisplayableIcon(nextIcon)) return false
      if (!previousIcon) return true
      if (needsIconUpdate(previousIcon)) return true
      return nextIcon.length >= 1000 || nextIcon.length > previousIcon.length
    }
    const refreshOne = async (app: AppItem) => {
      let iconPath: string | null = null
      try {
        if (app.type === 'steam') {
          iconPath = await window.electronAPI.extractSteamIcon(app.path)
        }
        if (!iconPath) {
          iconPath = await window.electronAPI.extractIcon(app.path)
        }
      } catch { /* ignore */ }
      if (iconPath && isBetterIcon(iconPath, app.icon || '')) {
        const index = indexById.get(app.id)
        if (index !== undefined) refreshed[index] = { ...app, icon: iconPath }
        successCount++
      } else {
        failedCount++
        failures.push(app.name)
      }
      doneCount++
      setIconRefreshProgress({
        done: doneCount,
        total: refreshTargets.length,
        success: successCount,
        failed: failedCount,
        current: app.name,
        failures: failures.slice(-8)
      })
    }

    setIconRefreshProgress({ done: 0, total: refreshTargets.length, success: 0, failed: 0, failures: [] })
    for (let i = 0; i < refreshTargets.length; i += CONCURRENCY) {
      const batch = refreshTargets.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(refreshOne))
      appsRef.current = [...refreshed]
      setApps([...refreshed])
      await window.electronAPI.saveApps({ apps: refreshed })
    }
    appsRef.current = refreshed
    setApps(refreshed)
    await window.electronAPI.saveApps({ apps: refreshed })
    setIconRefreshProgress(null)
    showMaintenanceSummary({
      title: '图标刷新完成',
      items: [
        `已清理 ${cleared.count} 个图标缓存。`,
        `成功刷新 ${successCount} 个图标。`,
        `文件夹使用默认图标，不参与补全。`,
        ...(failedCount > 0 ? [`${failedCount} 个图标提取失败，已保留原图标。`] : [])
      ]
    })
  }

  const handleAutoCategorize = async () => {
    const rules = config?.autoCategoryRules || []
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app => {
      const haystack = `${app.name} ${app.path} ${(app.aliases || []).join(' ')}`.toLowerCase()
      const rule = rules.find(item => item.categoryId && haystack.includes(item.match.toLowerCase()))
      if (rule) return { ...app, categoryId: rule.categoryId, subcategoryId: null }

      const category = categories.find(cat => haystack.includes(cat.name.toLowerCase()))
      if (category) return { ...app, categoryId: category.id, subcategoryId: null }

      return app
    })
    const changedCount = updatedApps.filter((app, index) =>
      app.categoryId !== currentApps[index]?.categoryId ||
      app.subcategoryId !== currentApps[index]?.subcategoryId
    ).length
    if (changedCount > 0) captureUndoSnapshot('自动分类')
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '自动分类完成',
      items: [changedCount > 0 ? `${changedCount} 个项目已重新归类。` : '没有项目需要调整分类。']
    })
    alert('自动分类已完成。')
  }

  const handleCleanupInvalidApps = async () => {
    const checks = await window.electronAPI.validateApps(appsRef.current.map(app => ({
      id: app.id,
      path: app.path,
      type: app.type
    })))
    const invalidIds = new Set(checks.filter(item => !item.exists).map(item => item.id))
    if (invalidIds.size === 0) {
      alert('没有发现失效的应用路径。')
      return
    }
    const confirmed = await window.electronAPI.confirm(`确定移除 ${invalidIds.size} 个失效项目吗？`)
    if (!confirmed) return
    captureUndoSnapshot('清理失效项')
    const updatedApps = appsRef.current.filter(app => !invalidIds.has(app.id))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '失效项已清理',
      items: [`已移除 ${invalidIds.size} 个失效项目。`]
    })
  }

  const handleRestoreHiddenApps = async () => {
    const hiddenCount = appsRef.current.filter(app => app.hidden).length
    if (hiddenCount > 0) captureUndoSnapshot('恢复隐藏项')
    const updatedApps = appsRef.current.map(app => ({ ...app, hidden: false }))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '隐藏项已恢复',
      items: [hiddenCount > 0 ? `已恢复 ${hiddenCount} 个隐藏项目。` : '没有需要恢复的隐藏项目。']
    })
    alert('已恢复搜索中隐藏的项目。')
  }

  const handleExportBackup = async () => {
    const result = await window.electronAPI.exportBackup()
    if (result.success) alert(`备份已导出：\n${result.filePath}`)
  }

  const handleImportBackup = async () => {
    const confirmed = await window.electronAPI.confirm('确定导入备份并替换当前配置、应用和分类吗？')
    if (!confirmed) return
    const result = await window.electronAPI.importBackup()
    if (result.success) {
      await loadData()
      alert('备份已导入。')
    }
  }

  const buildHealthReport = async (): Promise<HealthReport> => {
    const currentApps = appsRef.current
    const checks = await window.electronAPI.validateApps(currentApps.map(app => ({
      id: app.id,
      path: app.path,
      type: app.type
    })))
    const invalidIds = new Set(checks.filter(item => !item.exists).map(item => item.id))
    const pathCounts = new Map<string, number>()
    for (const app of currentApps) {
      const key = app.path.toLowerCase()
      pathCounts.set(key, (pathCounts.get(key) || 0) + 1)
    }
    return {
      total: currentApps.length,
      invalidPaths: currentApps.filter(app => invalidIds.has(app.id)),
      missingIcons: currentApps.filter(appNeedsIconUpdate),
      duplicatePaths: currentApps.filter(app => pathCounts.get(app.path.toLowerCase())! > 1),
      emptyCategories: findEmptyCategories(currentApps, categoriesRef.current),
      hiddenCount: currentApps.filter(app => app.hidden).length
    }
  }

  const handleRunHealthCheck = async () => {
    setHealthReport(await buildHealthReport())
  }

  const handleFixHealthIssues = async () => {
    const report = healthReport || await buildHealthReport()
    let updatedApps = [...appsRef.current]
    let removedInvalidCount = 0
    let removedDuplicateCount = 0
    let removedEmptyCategoryCount = 0
    let undoCaptured = false
    const ensureUndoSnapshot = () => {
      if (undoCaptured) return
      captureUndoSnapshot('一键修复')
      undoCaptured = true
    }
    if (report.invalidPaths.length > 0) {
      const confirmed = await window.electronAPI.confirm(`检测到 ${report.invalidPaths.length} 个失效路径，是否移除这些项目？`)
      if (confirmed) {
        ensureUndoSnapshot()
        const invalidIds = new Set(report.invalidPaths.map(app => app.id))
        removedInvalidCount = updatedApps.filter(app => invalidIds.has(app.id)).length
        updatedApps = updatedApps.filter(app => !invalidIds.has(app.id))
      }
    }
    if (report.duplicatePaths.length > 0) {
      const confirmed = await window.electronAPI.confirm('检测到重复路径，是否只保留每个路径的第一个项目？')
      if (confirmed) {
        ensureUndoSnapshot()
        const deduplicated = deduplicateAppsByPath(updatedApps)
        updatedApps = deduplicated.apps
        removedDuplicateCount = deduplicated.removedCount
      }
    }
    if (report.emptyCategories.length > 0) {
      const emptyCategories = filterStillEmptyCategories(report.emptyCategories, updatedApps)
      const confirmed = emptyCategories.length > 0 && await window.electronAPI.confirm(`检测到 ${emptyCategories.length} 个空分类，是否删除这些分类？`)
      if (confirmed) {
        ensureUndoSnapshot()
        removedEmptyCategoryCount = emptyCategories.length
        const emptyIds = new Set(emptyCategories.map(category => category.id))
        const updatedCategories = categoriesRef.current.filter(category => !emptyIds.has(category.id))
        const updatedSubcategories = subcategories.filter(subcategory => !subcategory.parentId || !emptyIds.has(subcategory.parentId))
        categoriesRef.current = updatedCategories
        setCategories(updatedCategories)
        setSubcategories(updatedSubcategories)
        await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories: updatedSubcategories })
        if (activeCategoryRef.current && emptyIds.has(activeCategoryRef.current)) {
          const nextCategoryId = updatedCategories[0]?.id || null
          activeCategoryRef.current = nextCategoryId
          setActiveCategory(nextCategoryId)
        }
      }
    }
    const changed = removedInvalidCount > 0 || removedDuplicateCount > 0 || removedEmptyCategoryCount > 0
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setHealthReport(await buildHealthReport())
    showMaintenanceSummary({
      title: changed ? '一键修复完成' : '一键修复已检查',
      items: changed
        ? [
          ...(removedInvalidCount > 0 ? [`移除 ${removedInvalidCount} 个失效项目。`] : []),
          ...(removedDuplicateCount > 0 ? [`合并 ${removedDuplicateCount} 个重复项目。`] : []),
          ...(removedEmptyCategoryCount > 0 ? [`删除 ${removedEmptyCategoryCount} 个空分类。`] : [])
        ]
        : ['没有发现需要自动修复的项目。']
    })
  }

  const importShortcutItemsWithAutoCategories = async (items: ShortcutImportItem[]): Promise<boolean> => {
    if (items.length === 0) {
      showMaintenanceSummary({
        title: '没有发现快捷方式',
        items: ['桌面和开始菜单中没有可导入的快捷方式。']
      })
      return false
    }

    const currentApps = appsRef.current
    const shortcutTargets = await window.electronAPI.resolveShortcutTargets(
      currentApps.map(app => app.path).filter(appPath => appPath.toLowerCase().endsWith('.lnk'))
    )
    const importableItems = filterNewShortcutItems(
      items,
      currentApps,
      shortcutTargets.map(item => item.targetPath)
    ).slice(0, 120)

    if (importableItems.length === 0) {
      showMaintenanceSummary({
        title: '未新增快捷方式',
        items: [`扫描到 ${items.length} 个快捷方式，目标程序均已存在，已全部跳过。`]
      })
      return false
    }

    const sourceMeta: Record<ShortcutImportItem['source'], { name: string; icon: string }> = {
      desktop: { name: '桌面快捷方式', icon: '⌘' },
      startMenu: { name: '开始菜单', icon: '⊞' },
      other: { name: '快捷方式', icon: '◇' }
    }
    const nextCategories = [...categoriesRef.current]
    const categoryBySource = new Map<ShortcutImportItem['source'], string>()

    for (const item of importableItems) {
      const source = item.source || 'other'
      const meta = sourceMeta[source]
      let category = nextCategories.find(cat => cat.name === meta.name)
      if (!category) {
        category = {
          id: crypto.randomUUID(),
          name: meta.name,
          icon: meta.icon,
          order: nextCategories.length + 1
        }
        nextCategories.push(category)
      }
      categoryBySource.set(source, category.id)
    }

    const createdCount = nextCategories.length - categoriesRef.current.length
    const confirmed = await window.electronAPI.confirm(
      `发现 ${items.length} 个快捷方式，可新增 ${importableItems.length} 个项目。` +
      `${createdCount > 0 ? `将自动创建 ${createdCount} 个分类。` : ''}是否继续导入？`
    )
    if (!confirmed) return false

    captureUndoSnapshot('导入快捷方式')
    if (createdCount > 0) {
      setCategories(nextCategories)
      categoriesRef.current = nextCategories
      await window.electronAPI.saveCategories({ categories: nextCategories, subcategories })
    }

    const newApps = importableItems.map(item => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: item.name,
      path: item.targetPath,
      icon: item.icon,
      categoryId: categoryBySource.get(item.source || 'other') || nextCategories[0]?.id || null,
      subcategoryId: null,
      pinyin: getPinyin(item.name),
      firstLetter: getFirstLetter(item.name),
      type: item.type,
      aliases: []
    } satisfies AppItem))

    const updatedApps = [...appsRef.current, ...newApps]
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    if (!activeCategoryRef.current && nextCategories.length > 0) {
      setActiveCategory(nextCategories[0].id)
      activeCategoryRef.current = nextCategories[0].id
    }
    scheduleIconBackfill(newApps.filter(app => !app.icon))
    showMaintenanceSummary({
      title: '快捷方式导入完成',
      items: [
        `新增 ${newApps.length} 个项目。`,
        ...(createdCount > 0 ? [`自动创建 ${createdCount} 个分类。`] : [])
      ]
    })
    return true
  }

  const handleImportShortcuts = async () => {
    if (shortcutImportInFlightRef.current) return
    shortcutImportInFlightRef.current = true
    showMaintenanceSummary({
      title: '正在扫描快捷方式',
      items: ['首次扫描会读取桌面和开始菜单，请稍候。']
    }, false)
    try {
      await importShortcutItemsWithAutoCategories(await window.electronAPI.scanShortcuts())
    } catch (error) {
      showMaintenanceSummary({
        title: '快捷方式导入失败',
        items: [error instanceof Error ? error.message : '扫描快捷方式时发生未知错误。']
      })
    } finally {
      shortcutImportInFlightRef.current = false
    }
  }

  return {
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
    handleImportShortcuts,
    buildHealthReport
  }
}
