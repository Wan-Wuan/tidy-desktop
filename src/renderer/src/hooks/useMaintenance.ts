import { useCallback, useRef, useState } from 'react'
import type { AppItem, Category, Config, Subcategory } from '../../../shared/types'
import { getPinyin, getFirstLetter } from '../utils/pinyin'
import { hasDisplayableIcon, needsIconUpdate } from '../utils/iconUtils'
import { buildRelocationCandidates, deduplicateAppsByPath, filterStillEmptyCategories, findEmptyCategories } from '../utils/maintenance'
import { filterNewShortcutItems } from '../utils/shortcutImport'
import { persistApps, persistCategories } from '../utils/persist'
import { safePickFolder } from '../utils/nativeDialog'
import type { ShortcutImportItem } from '../../../shared/types'
import type { HealthReport, IconRefreshProgress } from '../components/modals/types'

export type MaintenanceSummary = { title: string; items: string[] }

/** 提示卡自动关闭时长。倒计时条的动画时长在 ToastStack 里内联取同一个值，避免两处走偏。 */
export const MAINTENANCE_SUMMARY_DURATION_MS = 5000

/**
 * 正在展示的提示卡：内容之外带上两个展示态字段。
 *   · autoDismiss —— 只有会自动关闭的卡片才画倒计时条（「正在扫描快捷方式」是不自动关的）
 *   · token —— 倒计时条是 CSS 动画，同一个 DOM 节点上重跑不会重置；
 *              新卡片用新 key 强制重挂载，条才会从头开始走
 */
export type ActiveMaintenanceSummary = MaintenanceSummary & {
  autoDismiss: boolean
  token: number
}

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

  const [maintenanceSummary, setMaintenanceSummary] = useState<ActiveMaintenanceSummary | null>(null)
  const [iconRefreshProgress, setIconRefreshProgress] = useState<IconRefreshProgress | null>(null)
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const maintenanceSummaryTimerRef = useRef<number | null>(null)
  const maintenanceSummaryTokenRef = useRef(0)
  const shortcutImportInFlightRef = useRef(false)

  const showMaintenanceSummary = useCallback((summary: MaintenanceSummary, autoDismiss = true) => {
    if (maintenanceSummaryTimerRef.current) {
      window.clearTimeout(maintenanceSummaryTimerRef.current)
      maintenanceSummaryTimerRef.current = null
    }
    maintenanceSummaryTokenRef.current += 1
    setMaintenanceSummary({ ...summary, autoDismiss, token: maintenanceSummaryTokenRef.current })
    if (autoDismiss) {
      maintenanceSummaryTimerRef.current = window.setTimeout(() => {
        maintenanceSummaryTimerRef.current = null
        setMaintenanceSummary(null)
      }, MAINTENANCE_SUMMARY_DURATION_MS)
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
    /* 每批只更新内存（ref + state），让进度条和网格实时刷新；**落盘放到循环结束后做一次**。
       以前这里每批都 persistApps 一次（N/4 次全量写盘 + fsync），而图标结果本身是可再生的
       （丢了下次刷新重抽即可），不值得为它反复重写整个 apps.json。 */
    for (let i = 0; i < refreshTargets.length; i += CONCURRENCY) {
      const batch = refreshTargets.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(refreshOne))
      appsRef.current = [...refreshed]
      setApps([...refreshed])
    }
    appsRef.current = refreshed
    setApps(refreshed)
    await persistApps(refreshed, '图标刷新')
    setIconRefreshProgress(null)
    showMaintenanceSummary({
      title: '图标已刷新',
      items: [
        `已清理 ${cleared.count} 个图标缓存。`,
        `已更新 ${successCount} 个图标。`,
        '文件夹项目使用默认图标，不参与刷新。',
        ...(failedCount > 0 ? [`${failedCount} 个图标提取失败，已保留原有图标。`] : [])
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
    await persistApps(updatedApps, '自动分类')
    showMaintenanceSummary({
      title: '自动分类已完成',
      items: [changedCount > 0 ? `${changedCount} 个项目的分类已更新。` : '没有项目需要调整分类。']
    })
  }

  /**
   * 挑出"路径已失效"的项目。
   *
   * 抽出来是因为「清理失效项」「一键修复」「批量重定位」三条路都要先做同一件事；
   * 各写一份就迟早出现"某条路认为失效、另一条路认为没问题"。
   *
   * ⚠️ 失效与否由**主进程** `validate-apps` 判定，渲染层拿不到文件系统；
   * 而且主进程按类型分流（网址 / Steam / 商店应用 / 文本与组合都不走 fs 校验），
   * 详见 `systemHandlers.ts` 里那段注释。
   */
  const collectInvalidApps = async (source: AppItem[]): Promise<AppItem[]> => {
    if (source.length === 0) return []
    const checks = await window.electronAPI.validateApps(
      source.map(app => ({ id: app.id, path: app.path, type: app.type }))
    )
    const invalidIds = new Set(checks.filter(item => !item.exists).map(item => item.id))
    return source.filter(app => invalidIds.has(app.id))
  }

  const handleCleanupInvalidApps = async () => {
    const invalidApps = await collectInvalidApps(appsRef.current)
    if (invalidApps.length === 0) {
      alert('未发现失效项目。')
      return
    }
    const invalidIds = new Set(invalidApps.map(app => app.id))
    const confirmed = await window.electronAPI.confirm(`确定移除 ${invalidIds.size} 个失效项目吗？`)
    if (!confirmed) return
    captureUndoSnapshot('清理失效项')
    const updatedApps = appsRef.current.filter(app => !invalidIds.has(app.id))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await persistApps(updatedApps, '清理失效项')
    showMaintenanceSummary({
      title: '失效项目已清理',
      items: [`已移除 ${invalidIds.size} 个失效项目。`]
    })
  }

  /**
   * 失效路径批量重定位——"改路径"而不是"删掉"。
   *
   * 为什么需要它：「清理失效项」和「一键修复」对失效项目只有一条出路，就是删。
   * 但用户真正遇到的多半是**把整个文件夹搬走了**（换盘、改目录名、从下载目录
   * 归档到资料盘）。这种情况下删掉重建最亏：分类、别名、启动参数、待办、使用
   * 统计全都得重配一遍——而这些恰恰是这个应用最值钱的部分。
   *
   * 流程：校验失效项 → 选一次新父目录 → 算候选（纯函数）→ **回主进程实测** → 分流。
   * ⚠️ 候选必须实测才算数：`buildRelocationCandidates` 只做字符串换算，
   *    拼出来的路径完全可能不存在（用户选错了目录）。
   */
  const handleRelocateInvalidApps = async () => {
    const currentApps = appsRef.current
    /* 只有真正落在磁盘上的类型才谈得上"换父目录"：网址存的是 URL、
       文本与组合根本没有路径、商店应用是 shell:AppsFolder 虚拟目标。 */
    const relocatable = currentApps.filter(app =>
      (app.type === 'app' || app.type === 'folder') && !app.path.toLowerCase().startsWith('shell:')
    )
    const invalidApps = await collectInvalidApps(relocatable)
    if (invalidApps.length === 0) {
      alert('未发现失效项目。')
      return
    }

    const folderPath = await safePickFolder()
    if (!folderPath) return

    const candidates = buildRelocationCandidates(invalidApps, folderPath)
    if (candidates.length === 0) {
      showMaintenanceSummary({
        title: '无法重定位',
        items: ['这些失效项目没有可用的路径，换算不到新目录。']
      })
      return
    }

    const typeById = new Map(invalidApps.map(app => [app.id, app.type]))
    const verified = await window.electronAPI.validateApps(candidates.map(item => ({
      id: item.id,
      path: item.to,
      type: typeById.get(item.id)
    })))
    const foundIds = new Set(verified.filter(item => item.exists).map(item => item.id))
    const relocated = candidates.filter(item => foundIds.has(item.id))
    /* 没进候选的（路径为空等）和候选没命中的，都算"仍未找到" */
    const missingCount = invalidApps.length - relocated.length

    if (relocated.length === 0) {
      showMaintenanceSummary({
        title: '未找到匹配的项目',
        items: [
          `在所选目录下没有找到这 ${invalidApps.length} 个失效项目。`,
          '请确认选的是它们原来的父目录，或搬过去之后的新位置。'
        ]
      })
      return
    }

    /* 两种结局得分开问，不能拿 confirm 凑合："更新命中的、同时移除没找到的"
       与"只更新命中的、剩下的先留着"是**两件事**，而 confirm 的「取消」会同时
       被理解成这两件事，还会被理解成"算了不弄了"（见 show-choice 的注释）。 */
    let mode: 'updateAndRemove' | 'updateOnly' | null = null
    if (missingCount > 0) {
      const choice = await window.electronAPI.showChoice({
        message: `在所选目录找到了 ${relocated.length} 个项目，另有 ${missingCount} 个仍未找到。`,
        detail: '仍未找到的项目可以保留，之后再试一次重定位；也可以直接移除。',
        buttons: [
          `更新 ${relocated.length} 项并移除 ${missingCount} 项`,
          `只更新 ${relocated.length} 项`,
          '取消'
        ],
        defaultId: 1,
        cancelId: 2
      })
      if (choice === 0) mode = 'updateAndRemove'
      else if (choice === 1) mode = 'updateOnly'
      else return
    } else {
      const confirmed = await window.electronAPI.confirm(`将在所选目录更新 ${relocated.length} 个项目的路径，继续吗？`)
      if (!confirmed) return
      mode = 'updateOnly'
    }

    const pathById = new Map(relocated.map(item => [item.id, item.to]))
    const removedIds = mode === 'updateAndRemove'
      ? new Set(invalidApps.filter(app => !pathById.has(app.id)).map(app => app.id))
      : new Set<string>()

    captureUndoSnapshot('重定位失效项')
    const updatedApps = currentApps
      .filter(app => !removedIds.has(app.id))
      .map(app => {
        const nextPath = pathById.get(app.id)
        return nextPath ? { ...app, path: nextPath } : app
      })
    appsRef.current = updatedApps
    setApps(updatedApps)
    await persistApps(updatedApps, '重定位失效项')
    /* 换了路径，图标可能还是按旧路径抽的。缺图的重抽一遍；有图的先留着——
       同一个程序换个位置，它长什么样不会变。 */
    scheduleIconBackfill(updatedApps.filter(app => pathById.has(app.id) && !app.icon))
    showMaintenanceSummary({
      title: '失效项已重定位',
      items: [
        `已更新 ${relocated.length} 个项目的路径。`,
        ...(removedIds.size > 0 ? [`已移除 ${removedIds.size} 个未找到的项目。`] : []),
        ...(removedIds.size === 0 && missingCount > 0 ? [`${missingCount} 个未找到的项目已保留。`] : [])
      ]
    })
  }

  const handleRestoreHiddenApps = async () => {
    const hiddenCount = appsRef.current.filter(app => app.hidden).length
    if (hiddenCount > 0) captureUndoSnapshot('恢复隐藏项')
    const updatedApps = appsRef.current.map(app => ({ ...app, hidden: false }))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await persistApps(updatedApps, '恢复隐藏项')
    showMaintenanceSummary({
      title: '隐藏项目已恢复',
      items: [hiddenCount > 0 ? `已恢复 ${hiddenCount} 个隐藏项目。` : '没有需要恢复的隐藏项目。']
    })
  }

  const handleExportBackup = async () => {
    const result = await window.electronAPI.exportBackup()
    if (result.success) {
      alert(`备份已导出到：\n${result.filePath}`)
      return
    }
    /* 用户主动取消是常态，不该弹提示；但真出错（写盘失败等）必须说出来，
       否则「点了导出、什么都没发生」会被当成功能坏了。 */
    if (result.error) {
      showMaintenanceSummary({ title: '导出备份失败', items: [result.error] })
    }
  }

  const handleImportBackup = async () => {
    const confirmed = await window.electronAPI.confirm('导入备份将替换当前的配置、项目与分类。确定继续吗？')
    if (!confirmed) return
    const result = await window.electronAPI.importBackup()
    if (result.success) {
      await loadData()
      alert('备份已导入，数据已重新载入。')
      return
    }
    /* 以前这里只有 if (success)：选完文件、界面毫无变化，用户会以为导入成功了。
       主进程在格式非法 / 写盘失败时都会带回 error，必须显式呈现。 */
    if (result.error) {
      showMaintenanceSummary({
        title: '导入备份失败',
        items: [result.error, '当前数据未做任何修改。']
      })
    }
  }

  const buildHealthReport = async (): Promise<HealthReport> => {
    const currentApps = appsRef.current
    const invalidIds = new Set((await collectInvalidApps(currentApps)).map(app => app.id))
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
      const confirmed = await window.electronAPI.confirm(`检测到 ${report.invalidPaths.length} 个失效项目，要移除吗？`)
      if (confirmed) {
        ensureUndoSnapshot()
        const invalidIds = new Set(report.invalidPaths.map(app => app.id))
        removedInvalidCount = updatedApps.filter(app => invalidIds.has(app.id)).length
        updatedApps = updatedApps.filter(app => !invalidIds.has(app.id))
      }
    }
    if (report.duplicatePaths.length > 0) {
      const confirmed = await window.electronAPI.confirm('检测到重复路径。每个路径只保留第一个项目，继续吗？')
      if (confirmed) {
        ensureUndoSnapshot()
        const deduplicated = deduplicateAppsByPath(updatedApps)
        updatedApps = deduplicated.apps
        removedDuplicateCount = deduplicated.removedCount
      }
    }
    if (report.emptyCategories.length > 0) {
      const emptyCategories = filterStillEmptyCategories(report.emptyCategories, updatedApps)
      const confirmed = emptyCategories.length > 0 && await window.electronAPI.confirm(`检测到 ${emptyCategories.length} 个空分类，要删除吗？`)
      if (confirmed) {
        ensureUndoSnapshot()
        removedEmptyCategoryCount = emptyCategories.length
        const emptyIds = new Set(emptyCategories.map(category => category.id))
        const updatedCategories = categoriesRef.current.filter(category => !emptyIds.has(category.id))
        const updatedSubcategories = subcategories.filter(subcategory => !subcategory.parentId || !emptyIds.has(subcategory.parentId))
        categoriesRef.current = updatedCategories
        setCategories(updatedCategories)
        setSubcategories(updatedSubcategories)
        await persistCategories(updatedCategories, updatedSubcategories, '删除空分类')
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
    await persistApps(updatedApps, '一键修复')
    setHealthReport(await buildHealthReport())
    showMaintenanceSummary({
      title: changed ? '一键修复完成' : '检查完成',
      items: changed
        ? [
          ...(removedInvalidCount > 0 ? [`已移除 ${removedInvalidCount} 个失效项目。`] : []),
          ...(removedDuplicateCount > 0 ? [`已合并 ${removedDuplicateCount} 个重复项目。`] : []),
          ...(removedEmptyCategoryCount > 0 ? [`已删除 ${removedEmptyCategoryCount} 个空分类。`] : [])
        ]
        : ['未发现需要修复的问题。']
    })
  }

  const importShortcutItemsWithAutoCategories = async (items: ShortcutImportItem[]): Promise<boolean> => {
    if (items.length === 0) {
      showMaintenanceSummary({
        title: '未发现可导入的快捷方式',
        items: ['桌面和开始菜单中都没有可导入的快捷方式。']
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
        items: [`已扫描 ${items.length} 个快捷方式，目标程序都已存在，全部跳过。`]
      })
      return false
    }

    const sourceMeta: Record<ShortcutImportItem['source'], { name: string; icon: string }> = {
      desktop: { name: '桌面快捷方式', icon: '⌘' },
      startMenu: { name: '开始菜单', icon: '⊞' },
      appx: { name: '应用商店', icon: '▤' },
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
      `已发现 ${items.length} 个快捷方式，其中 ${importableItems.length} 个可以导入。` +
      `${createdCount > 0 ? `将自动创建 ${createdCount} 个分类。` : ''}继续导入吗？`
    )
    if (!confirmed) return false

    captureUndoSnapshot('导入快捷方式')
    if (createdCount > 0) {
      setCategories(nextCategories)
      categoriesRef.current = nextCategories
      await persistCategories(nextCategories, subcategories, '快捷方式自动分类')
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
    await persistApps(updatedApps, '导入快捷方式')
    if (!activeCategoryRef.current && nextCategories.length > 0) {
      setActiveCategory(nextCategories[0].id)
      activeCategoryRef.current = nextCategories[0].id
    }
    scheduleIconBackfill(newApps.filter(app => !app.icon))
    showMaintenanceSummary({
      title: '快捷方式导入完成',
      items: [
        `已新增 ${newApps.length} 个项目。`,
        ...(createdCount > 0 ? [`已自动创建 ${createdCount} 个分类。`] : [])
      ]
    })
    return true
  }

  const handleImportShortcuts = async () => {
    if (shortcutImportInFlightRef.current) return
    shortcutImportInFlightRef.current = true
    showMaintenanceSummary({
      title: '正在扫描快捷方式',
      items: ['正在读取桌面和开始菜单，请稍候。']
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
    handleRelocateInvalidApps,
    handleRestoreHiddenApps,
    handleExportBackup,
    handleImportBackup,
    handleRunHealthCheck,
    handleFixHealthIssues,
    handleImportShortcuts,
    buildHealthReport
  }
}
