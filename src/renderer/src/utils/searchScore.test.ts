import { describe, expect, it } from 'vitest'
import type { AppItem } from '../../../shared/types'
import { matchesTerm, getSearchScore } from './searchScore'

function app(id: string, name: string, extra: Partial<AppItem> = {}): AppItem {
  return {
    id,
    name,
    path: `C:\\${id}.exe`,
    icon: '',
    categoryId: 'c',
    pinyin: '',
    firstLetter: '',
    ...extra
  }
}

describe('matchesTerm', () => {
  it('空关键词匹配所有应用', () => {
    expect(matchesTerm(app('1', '任意'), '')).toBe(true)
  })

  it('名称包含关键词即命中（大小写不敏感）', () => {
    expect(matchesTerm(app('1', 'Visual Studio'), 'studio')).toBe(true)
    expect(matchesTerm(app('1', 'Chrome'), 'chrome')).toBe(true)
  })

  it('名称不含关键词且不相关时不命中', () => {
    expect(matchesTerm(app('1', 'Photoshop'), 'chrome')).toBe(false)
  })

  it('拼音全文与拼音首字母均可命中', () => {
    const wechat = app('1', '微信', { pinyin: 'weixin', firstLetter: 'wx' })
    expect(matchesTerm(wechat, 'weixin')).toBe(true)
    expect(matchesTerm(wechat, 'wx')).toBe(true)
  })
})

describe('getSearchScore', () => {
  it('分数高者排前：精确名称匹配高于仅包含', () => {
    const exact = app('1', 'chrome', { pinyin: 'chrome', firstLetter: 'c' })
    const contains = app('2', 'chromium', { pinyin: 'chromium', firstLetter: 'c' })
    expect(getSearchScore(exact, ['chrome'])).toBeGreaterThan(getSearchScore(contains, ['chrome']))
  })

  it('启动次数与最近打开时间抬高分数', () => {
    const hot = app('1', 'zzz', { launchCount: 10, lastOpenedAt: 100000 })
    const cold = app('2', 'zzz', { launchCount: 0, lastOpenedAt: 0 })
    expect(getSearchScore(hot, ['zzz'])).toBeGreaterThan(getSearchScore(cold, ['zzz']))
  })
})
