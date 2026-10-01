import type { AppItem } from '../../../shared/types'

/**
 * 使用统计。
 *
 * `launchCount` / `lastOpenedAt` 从早期版本就一直在记录，但只喂给了顶部那 4 个
 * 「智能启动」和排序模式——用户看不到全貌。这里把它们整理成三档，用来回答
 * 「我到底在用哪些」和「哪些可以清理了」。
 *
 * 全部是纯函数，`now` 可注入，所以时间相关的边界（刚好到期 / 差一天）能稳定测。
 */

const DAY_MS = 24 * 60 * 60 * 1000

export interface UsageStats {
  /** 有启动记录的应用数（launchCount > 0 或 lastOpenedAt 存在） */
  trackedCount: number
  /** 从未启动过：装进来就忘了，最典型的清理候选 */
  neverLaunched: AppItem[]
  /** 按启动次数降序，取前 N 个（仅含真的启动过的） */
  mostUsed: AppItem[]
  /** 按最近打开时间降序，取前 N 个 */
  recentlyUsed: AppItem[]
  /** 打开过、但已经超过 staleDays 天没再打开 */
  stale: AppItem[]
}

export interface UsageStatsOptions {
  /** 每个榜单取前几个，默认 8 */
  topN?: number
  /** 多少天没打开算「长期未用」，默认 90 */
  staleDays?: number
  /** 当前时间戳，测试时注入 */
  now?: number
}

const hasRecord = (app: AppItem): boolean => (app.launchCount || 0) > 0 || !!app.lastOpenedAt

export function computeUsageStats(apps: AppItem[], options: UsageStatsOptions = {}): UsageStats {
  const { topN = 8, staleDays = 90, now = Date.now() } = options
  const cutoff = now - staleDays * DAY_MS

  const tracked = apps.filter(hasRecord)
  const neverLaunched = apps.filter(app => !hasRecord(app))

  /* 同分时按名称排序：否则每次渲染顺序都可能变，用户会觉得列表在乱跳。 */
  const mostUsed = tracked
    .filter(app => (app.launchCount || 0) > 0)
    .sort((a, b) => (b.launchCount || 0) - (a.launchCount || 0) || a.name.localeCompare(b.name))
    .slice(0, topN)

  const recentlyUsed = tracked
    .filter(app => !!app.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || a.name.localeCompare(b.name))
    .slice(0, topN)

  const stale = tracked
    .filter(app => {
      const last = app.lastOpenedAt || 0
      return last > 0 && last < cutoff
    })
    .sort((a, b) => (a.lastOpenedAt || 0) - (b.lastOpenedAt || 0))

  return { trackedCount: tracked.length, neverLaunched, mostUsed, recentlyUsed, stale }
}

/** 距上次打开过了多少天；无记录返回 null。 */
export function daysSinceLastOpen(app: AppItem, now = Date.now()): number | null {
  if (!app.lastOpenedAt) return null
  return Math.max(0, Math.floor((now - app.lastOpenedAt) / DAY_MS))
}
