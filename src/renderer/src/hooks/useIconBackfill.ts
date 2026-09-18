import { useCallback, useEffect, useRef } from 'react'
import type { AppItem } from '../../../shared/types'
import { needsIconUpdate } from '../utils/iconUtils'

/**
 * 判断某个应用是否需要（重新）抽取图标。
 *
 * 这里单独导出，是因为 App.tsx 的 `overviewStats` / `loadDataFn` 也要用同一套
 * 判定（「文件夹不抽图标」「图标已是最新则跳过」），避免两处各写一遍导致语义漂移。
 */
export function appNeedsIconUpdate(app: AppItem): boolean {
  return app.type !== 'folder' && needsIconUpdate(app.icon)
}

/**
 * 图标的按需补全：应用载入后、把新应用拖入网格后，把「还没有图标」的应用补上。
 *
 * 三个函数原本散在 App.tsx（backfillMissingIcons / scheduleIconBackfill /
 * extractIconsForApps），它们只依赖 `appsRef` 与 `setApps` 这两样，
 * 与拖拽、选择、分类弹窗等逻辑互相独立，因此整体搬进本 hook。
 * 返回值的命名与 App.tsx 原局部函数保持一致，调用方无需改动。
 */
export function useIconBackfill(options: {
  appsRef: React.MutableRefObject<AppItem[]>
  setApps: React.Dispatch<React.SetStateAction<AppItem[]>>
}) {
  const { appsRef, setApps } = options
  const iconBackfillTimerRef = useRef<number | null>(null)

  /* 分批抽取图标，避免一次性对几百个应用同步调用 extractIcon 把主线程卡死。
     （每批抽完歇 80ms，也顺便给 IPC 队列透气。） */
  const backfillMissingIcons = useCallback(async (sourceApps: AppItem[]) => {
    const BATCH_SIZE = 3
    const allIcons: { id: string; icon: string }[] = []
    for (let i = 0; i < sourceApps.length; i += BATCH_SIZE) {
      const batch = sourceApps.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async app => {
          const icon = await window.electronAPI.extractIcon(app.path)
          return { id: app.id, icon: icon || '' }
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.icon) {
          allIcons.push(r.value)
        }
      }
      await new Promise(resolve => window.setTimeout(resolve, 80))
    }
    if (allIcons.length === 0) return

    setApps(prev => {
      let changed = false
      const updated = prev.map(app => {
        if (!appNeedsIconUpdate(app)) return app
        const found = allIcons.find(result => result.id === app.id)
        if (!found) return app
        changed = true
        return { ...app, icon: found.icon }
      })
      if (changed) {
        window.electronAPI.saveApps({ apps: updated })
      }
      return changed ? updated : prev
    })
  }, [setApps])

  /* 延迟 3.5s 再补图标：载入/拖入后界面先稳定下来，避免几十个图标请求在启动瞬间
     和读取数据、渲染网格抢资源。定时器句柄收进本 hook，卸载时一并清掉。 */
  const scheduleIconBackfill = useCallback((sourceApps: AppItem[]) => {
    if (iconBackfillTimerRef.current) {
      window.clearTimeout(iconBackfillTimerRef.current)
    }
    iconBackfillTimerRef.current = window.setTimeout(() => {
      iconBackfillTimerRef.current = null
      backfillMissingIcons(sourceApps)
    }, 3500)
  }, [backfillMissingIcons])

  /* 把拖入的「还没有图标」的新应用送去抽图标。直接基于最新数据（appsRef）做合并，
     避免和正在进行的其它 setApps 互相覆盖。 */
  const extractIconsForApps = useCallback(async (newApps: AppItem[]) => {
    const appsWithIcons: AppItem[] = []
    for (const app of newApps) {
      let iconPath: string | null = null
      if (app.type === 'steam') {
        iconPath = await window.electronAPI.extractSteamIcon(app.path)
      }
      if (!iconPath) {
        iconPath = await window.electronAPI.extractIcon(app.path)
      }
      appsWithIcons.push(iconPath ? { ...app, icon: iconPath } : app)
    }

    if (appsWithIcons.length > 0) {
      const currentApps = appsRef.current
      const updatedApps = currentApps.map(a => {
        const found = appsWithIcons.find(n => n.id === a.id)
        return found || a
      })
      appsRef.current = updatedApps
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })
    }
  }, [appsRef, setApps])

  // 卸载时清掉还没触发的补图标定时器，避免对已卸载组件操作。
  useEffect(() => {
    return () => {
      if (iconBackfillTimerRef.current) {
        window.clearTimeout(iconBackfillTimerRef.current)
        iconBackfillTimerRef.current = null
      }
    }
  }, [])

  return { scheduleIconBackfill, backfillMissingIcons, extractIconsForApps }
}
