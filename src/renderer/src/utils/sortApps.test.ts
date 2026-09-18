import { describe, expect, it } from 'vitest'
import type { AppItem } from '../../../shared/types'
import { sortAppsForDisplay } from './sortApps'

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

describe('sortAppsForDisplay', () => {
  it('manual 模式返回原数组引用（不拷贝、不排序）', () => {
    const list = [app('a', 'b'), app('c', 'd')]
    expect(sortAppsForDisplay(list, 'manual')).toBe(list)
  })

  it('缺省 sortMode 当作 manual 返回原引用', () => {
    const list = [app('a', 'z'), app('b', 'a')]
    expect(sortAppsForDisplay(list)).toBe(list)
  })

  it('name 模式按中文拼音/字典序升序，且不原地修改原数组', () => {
    const copy = [app('1', '上海'), app('2', '北京'), app('3', '广州')]
    const result = sortAppsForDisplay(copy, 'name')
    // 北京(b) < 广州(g) < 上海(s)，证明用的是拼音序而非 Unicode 码位序
    expect(result.map(a => a.id)).toEqual(['2', '3', '1'])
    expect(copy.map(a => a.id)).toEqual(['1', '2', '3']) // 原数组未被原地改动
  })

  it('launchCount 模式按启动次数降序', () => {
    const list = [
      app('a', 'a', { launchCount: 1 }),
      app('b', 'b', { launchCount: 9 }),
      app('c', 'c', { launchCount: 3 })
    ]
    expect(sortAppsForDisplay(list, 'launchCount').map(a => a.id)).toEqual(['b', 'c', 'a'])
  })

  it('recent 模式按最后打开时间降序', () => {
    const list = [
      app('a', 'a', { lastOpenedAt: 100 }),
      app('b', 'b', { lastOpenedAt: 900 }),
      app('c', 'c', { lastOpenedAt: 300 })
    ]
    expect(sortAppsForDisplay(list, 'recent').map(a => a.id)).toEqual(['b', 'c', 'a'])
  })

  it('并列时保持原顺序（稳定排序）', () => {
    const list = [
      app('first', 'x', { launchCount: 5 }),
      app('second', 'y', { launchCount: 5 })
    ]
    expect(sortAppsForDisplay(list, 'launchCount').map(a => a.id)).toEqual(['first', 'second'])
  })
})
