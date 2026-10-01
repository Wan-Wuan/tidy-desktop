import { describe, expect, it } from 'vitest'
import type { AppItem } from '../../../shared/types'
import { computeUsageStats, daysSinceLastOpen } from './usageStats'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-28T12:00:00Z').getTime()

const app = (name: string, extra: Partial<AppItem> = {}): AppItem => ({
  id: name,
  name,
  path: `C:\\Apps\\${name}.exe`,
  icon: '',
  categoryId: null,
  subcategoryId: null,
  pinyin: '',
  firstLetter: '',
  type: 'app',
  ...extra
})

describe('computeUsageStats', () => {
  it('空列表不炸，各档都是空数组', () => {
    const stats = computeUsageStats([], { now: NOW })
    expect(stats).toEqual({
      trackedCount: 0,
      neverLaunched: [],
      mostUsed: [],
      recentlyUsed: [],
      stale: []
    })
  })

  it('把从未启动的应用单独归入 neverLaunched', () => {
    const stats = computeUsageStats([
      app('Used', { launchCount: 3, lastOpenedAt: NOW - DAY }),
      app('Fresh')
    ], { now: NOW })
    expect(stats.neverLaunched.map(a => a.name)).toEqual(['Fresh'])
    expect(stats.trackedCount).toBe(1)
  })

  it('mostUsed 按启动次数降序并截断到 topN', () => {
    const stats = computeUsageStats([
      app('A', { launchCount: 1, lastOpenedAt: NOW }),
      app('B', { launchCount: 9, lastOpenedAt: NOW }),
      app('C', { launchCount: 5, lastOpenedAt: NOW })
    ], { now: NOW, topN: 2 })
    expect(stats.mostUsed.map(a => a.name)).toEqual(['B', 'C'])
  })

  it('同分时按名称排序，保证渲染顺序稳定', () => {
    const stats = computeUsageStats([
      app('Zeta', { launchCount: 2, lastOpenedAt: NOW }),
      app('Alpha', { launchCount: 2, lastOpenedAt: NOW })
    ], { now: NOW })
    expect(stats.mostUsed.map(a => a.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('recentlyUsed 按最近打开时间降序', () => {
    const stats = computeUsageStats([
      app('Old', { launchCount: 1, lastOpenedAt: NOW - 30 * DAY }),
      app('New', { launchCount: 1, lastOpenedAt: NOW - DAY })
    ], { now: NOW })
    expect(stats.recentlyUsed.map(a => a.name)).toEqual(['New', 'Old'])
  })

  it('stale 只收「打开过但超过 staleDays 没再打开」的', () => {
    const stats = computeUsageStats([
      app('Recent', { launchCount: 4, lastOpenedAt: NOW - 10 * DAY }),
      app('Stale', { launchCount: 4, lastOpenedAt: NOW - 120 * DAY }),
      app('Never')
    ], { now: NOW, staleDays: 90 })
    expect(stats.stale.map(a => a.name)).toEqual(['Stale'])
    // 从未启动的走 neverLaunched，不重复出现在 stale 里
    expect(stats.stale.some(a => a.name === 'Never')).toBe(false)
  })

  it('stale 边界：刚好等于 staleDays 不算过期，多一天才算', () => {
    const exactly = computeUsageStats(
      [app('Edge', { launchCount: 1, lastOpenedAt: NOW - 90 * DAY })],
      { now: NOW, staleDays: 90 }
    )
    expect(exactly.stale).toHaveLength(0)

    const over = computeUsageStats(
      [app('Edge', { launchCount: 1, lastOpenedAt: NOW - 91 * DAY })],
      { now: NOW, staleDays: 90 }
    )
    expect(over.stale.map(a => a.name)).toEqual(['Edge'])
  })

  it('只有 lastOpenedAt、没有 launchCount 的记录也算已跟踪', () => {
    const stats = computeUsageStats([app('Legacy', { lastOpenedAt: NOW - DAY })], { now: NOW })
    expect(stats.trackedCount).toBe(1)
    expect(stats.neverLaunched).toHaveLength(0)
    expect(stats.mostUsed).toHaveLength(0) // 没有次数就不进常用榜
    expect(stats.recentlyUsed.map(a => a.name)).toEqual(['Legacy'])
  })
})

describe('daysSinceLastOpen', () => {
  it('无记录返回 null', () => {
    expect(daysSinceLastOpen(app('X'), NOW)).toBeNull()
  })

  it('按整天向下取整，未来时间戳夹到 0', () => {
    expect(daysSinceLastOpen(app('X', { lastOpenedAt: NOW - 5 * DAY - 3600_000 }), NOW)).toBe(5)
    expect(daysSinceLastOpen(app('X', { lastOpenedAt: NOW + DAY }), NOW)).toBe(0)
  })
})
