import { useCallback, useState } from 'react'
import type { AppItem, GroupLaunchMember } from '../../../shared/types'
import { describeLaunchError } from '../utils/launchError'

export interface LaunchSummary {
  title: string
  items: string[]
}

/**
 * 组合启动（多项目运行）。
 *
 * 只负责「把成员解析出来 → 交给主进程 → 汇总结果」这一段，
 * 需要用户确认的情况把 `pendingGroup` 抛给界面，由 `LaunchGroupPanel` 呈现。
 *
 * 成员解析走 `appsRef` 而不是 `apps`：点击发生在渲染之后，
 * 用户可能刚把某个成员从组合里拖走，ref 才是最新的一份。
 */
export function useLaunchGroups({ appsRef, recordLaunch, showSummary }: {
  appsRef: React.MutableRefObject<AppItem[]>
  recordLaunch: (appId: string) => Promise<void>
  showSummary: (summary: LaunchSummary) => void
}) {
  /** 需要「启动前确认」的组合；非空即表示确认面板要显示 */
  const [pendingGroup, setPendingGroup] = useState<AppItem | null>(null)
  const [launching, setLaunching] = useState(false)

  const resolveMembers = useCallback((group: AppItem): AppItem[] => {
    const index = new Map(appsRef.current.map(app => [app.id, app]))
    return (group.memberIds ?? [])
      .map(id => index.get(id))
      .filter((app): app is AppItem => Boolean(app))
  }, [appsRef])

  const runLaunch = useCallback(async (group: AppItem, members: AppItem[]) => {
    if (members.length === 0) {
      setPendingGroup(null)
      showSummary({
        title: '组合里没有可启动的项目',
        items: ['成员可能已经被删除了，请编辑组合重新选择。']
      })
      return
    }
    setLaunching(true)
    try {
      const payload: GroupLaunchMember[] = members.map(app => ({
        id: app.id,
        name: app.name,
        path: app.path,
        type: app.type || 'app',
        /* 这三样必须跟着成员一起传：同一个项目在网格里点、在组合里启动，
           行为不一致是用户最难理解的一类问题（"明明配了参数，单独点生效、组合启动就不生效"）。 */
        args: app.args,
        workingDir: app.workingDir,
        openWith: app.openWith ?? null
      }))
      const result = await window.electronAPI.launchGroup({ members: payload })

      if (result.ok) {
        showSummary({
          title: `已启动「${group.name}」`,
          items: [`共启动 ${result.launched} 个项目。`]
        })
      } else {
        const failures = result.results.filter(item => !item.ok)
        showSummary({
          title: `「${group.name}」启动不完整`,
          items: [
            `成功 ${result.launched} 个，失败 ${result.failed} 个。`,
            // 失败明细最多列 5 条，否则提示条会撑成一堵墙
            ...failures.slice(0, 5).map(item => `${item.name}：${describeLaunchError(item.error)}`),
            ...(failures.length > 5 ? [`另有 ${failures.length - 5} 个失败项未列出。`] : [])
          ]
        })
      }

      // 只给真正启动成功的成员记一次启动，失败的别污染智能启动的排序
      for (const item of result.results) {
        if (item.ok) await recordLaunch(item.id)
      }
    } catch {
      showSummary({ title: `「${group.name}」启动失败`, items: ['与主进程通信出错，请重试。'] })
    } finally {
      setLaunching(false)
      setPendingGroup(null)
    }
  }, [recordLaunch, showSummary])

  /** 卡片点击入口：开了「启动前确认」就先开面板，否则直接开跑。 */
  const requestLaunch = useCallback((group: AppItem) => {
    if (group.confirmBeforeLaunch) {
      setPendingGroup(group)
      return
    }
    void runLaunch(group, resolveMembers(group))
  }, [resolveMembers, runLaunch])

  /** 确认面板点了「启动」：只跑用户保留勾选的那几个。 */
  const confirmLaunch = useCallback((group: AppItem, memberIds: string[]) => {
    const keep = new Set(memberIds)
    void runLaunch(group, resolveMembers(group).filter(app => keep.has(app.id)))
  }, [resolveMembers, runLaunch])

  const cancelLaunch = useCallback(() => setPendingGroup(null), [])

  return {
    pendingGroup,
    launching,
    resolveGroupMembers: resolveMembers,
    requestLaunchGroup: requestLaunch,
    confirmLaunchGroup: confirmLaunch,
    cancelLaunchGroup: cancelLaunch
  }
}
