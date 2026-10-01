import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, CategoryLinkFolder, FolderSyncSnapshot } from '../../../shared/types'
import { flattenSyncedApps } from '../utils/syncedApps'

export interface FolderSyncSummary {
  title: string
  items: string[]
}

/** 一次最多补多少个同步项的图标：一进界面就刷几百次 PowerShell 会明显卡顿 */
const ICON_BATCH_SIZE = 40

export interface UseFolderSyncOptions {
  categories: Category[]
  categoriesRef: React.MutableRefObject<Category[]>
  /** 改某个分类的 linkFolder 并落盘；传 null 表示解除关联 */
  updateLinkFolder: (categoryId: string, next: CategoryLinkFolder | null) => Promise<void>
  /** 图标只为当前分类补，避免一次性把所有分类的条目都扫一遍 */
  activeCategory: string | null
  showSummary: (summary: FolderSyncSummary) => void
}

/**
 * 关联文件夹同步的渲染层状态。
 *
 * 职责边界：
 *   · **扫描在主进程**（`folderSync.ts` + 5 分钟轮询 / 窗口聚焦 / 手动刷新三段式触发），
 *     这里只读缓存 + 订阅 `folder-sync-updated`。
 *   · **同步条目不进 `apps.json`**，而是在 `syncedApps` 里现算成 `AppItem` 形状，
 *     由 App 层并进展示数组。这样"手工项目"与"同步项目"永远分得清——
 *     前者能编辑能删，后者只能隐藏。
 *   · **用户意图**（隐藏了哪些、自定义顺序）反过来写回 `categories.json` 的
 *     `linkFolder.hiddenPaths / order`，与随时可丢的扫描缓存分开存。
 */
export function useFolderSync({
  categories,
  categoriesRef,
  updateLinkFolder,
  activeCategory,
  showSummary
}: UseFolderSyncOptions) {
  const [snapshots, setSnapshots] = useState<Record<string, FolderSyncSnapshot>>({})
  const [syncingIds, setSyncingIds] = useState<string[]>([])
  /** 同步项的图标缓存（key = 绝对路径）。同步项不落盘，图标也只能留在内存里。 */
  const [iconCache, setIconCache] = useState<Record<string, string>>({})
  const bootstrappedRef = useRef(false)

  /** 手动/自动同步一个分类。rescan=false 时主进程只重算隐藏与排序，不扫盘。 */
  const syncCategory = useCallback(async (categoryId: string, rescan = true): Promise<FolderSyncSnapshot | null> => {
    const link = categoriesRef.current.find(category => category.id === categoryId)?.linkFolder
    if (!link) return null
    setSyncingIds(prev => (prev.includes(categoryId) ? prev : [...prev, categoryId]))
    try {
      const snapshot = await window.electronAPI.syncLinkFolder({
        categoryId,
        path: link.path,
        includeSubdirs: link.includeSubdirs,
        hiddenPaths: link.hiddenPaths ?? [],
        order: link.order ?? [],
        rescan
      })
      if (snapshot) setSnapshots(prev => ({ ...prev, [categoryId]: snapshot }))
      return snapshot
    } catch {
      showSummary({ title: '同步失败', items: ['与主进程通信失败，请重试。'] })
      return null
    } finally {
      setSyncingIds(prev => prev.filter(id => id !== categoryId))
    }
  }, [categoriesRef, showSummary])

  /* 启动后读一次缓存，并给「还没有任何快照」的关联分类补一次扫描。
     等 categories 真正到位再跑——首次渲染时它还是空数组，
     这时候跑会得出"没有关联分类"的错误结论，之后再也不会补。 */
  useEffect(() => {
    if (bootstrappedRef.current || categories.length === 0) return
    bootstrappedRef.current = true
    void (async () => {
      let cache: Record<string, FolderSyncSnapshot> = {}
      try {
        cache = (await window.electronAPI.getFolderSyncCache()) || {}
      } catch {
        // 读不到缓存不是错误：下面会给缺失的分类补一次扫描
      }
      setSnapshots(cache)
      const pending = categoriesRef.current.filter(category => category.linkFolder && !cache[category.id])
      for (const category of pending) {
        await syncCategory(category.id, true)
      }
    })()
  }, [categories, categoriesRef, syncCategory])

  // 主进程后台同步完（定时轮询 / 窗口聚焦触发）会推过来，这里只需并入
  useEffect(() => window.electronAPI.onFolderSyncUpdated(update => {
    setSnapshots(prev => ({ ...prev, [update.categoryId]: update.snapshot }))
  }), [])

  /** 把「分类 + 快照」铺平成 AppItem 形状。隐藏项在这里就被滤掉，下游不用再关心。
      实现抽到 `utils/syncedApps`，搜索窗读同一份逻辑，两边不会算得不一样。 */
  const syncedApps = useMemo(
    () => flattenSyncedApps({ categories, snapshots, iconCache }),
    [categories, snapshots, iconCache]
  )

  /* 分批补图标。依赖里带 iconCache 是刻意的：每轮补齐一批后 targets 会变小，
     直到全部有图标为止；一次只处理 ICON_BATCH_SIZE 个，不会一进界面就刷满 PowerShell。
     主进程那侧 `icons/` 有磁盘缓存，同一个路径第二次不会再走 PowerShell。 */
  useEffect(() => {
    const targets = syncedApps
      .filter(app => app.type === 'app' && !iconCache[app.path])
      .filter(app => !activeCategory || app.categoryId === activeCategory)
      .slice(0, ICON_BATCH_SIZE)
    if (targets.length === 0) return
    let cancelled = false
    void (async () => {
      const resolved: Record<string, string> = {}
      for (const app of targets) {
        if (cancelled) return
        try {
          const icon = await window.electronAPI.extractIcon(app.path)
          if (icon) resolved[app.path] = icon
        } catch {
          // 单个图标失败无所谓，卡片照常显示类型图标
        }
      }
      if (!cancelled && Object.keys(resolved).length > 0) {
        setIconCache(prev => ({ ...prev, ...resolved }))
      }
    })()
    return () => { cancelled = true }
  }, [syncedApps, iconCache, activeCategory])

  /** 在关联文件夹里隐藏一条（写进分类的 hiddenPaths，下次同步不会被扫回来） */
  const hideEntry = useCallback(async (categoryId: string, entryPath: string) => {
    const link = categoriesRef.current.find(category => category.id === categoryId)?.linkFolder
    if (!link) return
    const hiddenPaths = Array.from(new Set([...(link.hiddenPaths ?? []), entryPath]))
    await updateLinkFolder(categoryId, { ...link, hiddenPaths })
    void syncCategory(categoryId, false)
  }, [categoriesRef, updateLinkFolder, syncCategory])

  const showEntry = useCallback(async (categoryId: string, entryPath: string) => {
    const link = categoriesRef.current.find(category => category.id === categoryId)?.linkFolder
    if (!link) return
    const hiddenPaths = (link.hiddenPaths ?? []).filter(item => item.toLowerCase() !== entryPath.toLowerCase())
    await updateLinkFolder(categoryId, { ...link, hiddenPaths })
    void syncCategory(categoryId, false)
  }, [categoriesRef, updateLinkFolder, syncCategory])

  /** 绑定 / 换绑一个目录；返回这次同步的结果，供调用方给出"同步了多少条"的明确反馈 */
  const bindFolder = useCallback(async (
    categoryId: string,
    folderPath: string,
    includeSubdirs: boolean
  ): Promise<FolderSyncSnapshot | null> => {
    await updateLinkFolder(categoryId, {
      path: folderPath,
      includeSubdirs,
      lastSyncAt: 0,
      hiddenPaths: [],
      order: []
    })
    // 落盘是异步的，等一个微任务再同步，确保主进程读到的是新配置
    await Promise.resolve()
    return syncCategory(categoryId, true)
  }, [updateLinkFolder, syncCategory])

  const unbindFolder = useCallback(async (categoryId: string) => {
    await updateLinkFolder(categoryId, null)
    setSnapshots(prev => {
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
  }, [updateLinkFolder])

  /** 目录丢失 / 无权限时也要能显示上一次的结果，这里把错误单独取出来给横幅用 */
  const errorsByCategory = useMemo(() => {
    const map: Record<string, FolderSyncSnapshot['error']> = {}
    for (const [categoryId, snapshot] of Object.entries(snapshots)) {
      if (snapshot.error) map[categoryId] = snapshot.error
    }
    return map
  }, [snapshots])

  return {
    snapshots,
    syncingIds,
    errorsByCategory,
    syncedApps,
    syncCategory,
    hideEntry,
    showEntry,
    bindFolder,
    unbindFolder
  }
}
