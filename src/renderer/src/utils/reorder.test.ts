import { describe, expect, it } from 'vitest'
import type { AppItem } from '../../../shared/types'
import { computeReorder } from './reorder'

function app(id: string, subcategoryId: string | null = null): AppItem {
  return {
    id,
    name: id,
    path: `C:\\${id}.exe`,
    icon: '',
    categoryId: 'c',
    subcategoryId,
    pinyin: '',
    firstLetter: ''
  }
}

describe('computeReorder', () => {
  const base = () => [app('A'), app('B'), app('C'), app('D')]

  it('source 在 target 之前、insertAfter=false：插入到 target 之前', () => {
    const result = computeReorder(base(), 'A', 'C', false, null)
    expect(result?.map(a => a.id)).toEqual(['B', 'A', 'C', 'D'])
  })

  it('source 在 target 之前、insertAfter=true：插入到 target 之后', () => {
    const result = computeReorder(base(), 'A', 'C', true, null)
    expect(result?.map(a => a.id)).toEqual(['B', 'C', 'A', 'D'])
  })

  it('source 在 target 之后、insertAfter=false：插入到 target 之前（最容易差一位）', () => {
    const result = computeReorder(base(), 'C', 'A', false, null)
    expect(result?.map(a => a.id)).toEqual(['C', 'A', 'B', 'D'])
  })

  it('source 在 target 之后、insertAfter=true：插入到 target 之后', () => {
    const result = computeReorder(base(), 'C', 'A', true, null)
    expect(result?.map(a => a.id)).toEqual(['A', 'C', 'B', 'D'])
  })

  it('移动后的元素应用新的 subcategoryId', () => {
    const result = computeReorder(base(), 'A', 'C', false, 'sub-2')
    expect(result?.find(a => a.id === 'A')?.subcategoryId).toBe('sub-2')
  })

  it('target 不存在返回 null', () => {
    expect(computeReorder(base(), 'A', 'ZZZ', false, null)).toBeNull()
  })

  it('source 与 target 相同返回 null', () => {
    expect(computeReorder(base(), 'A', 'A', false, null)).toBeNull()
  })

  it('不原地修改原数组', () => {
    const list = base()
    const snapshot = list.map(a => a.id)
    computeReorder(list, 'C', 'A', true, null)
    expect(list.map(a => a.id)).toEqual(snapshot)
  })
})
