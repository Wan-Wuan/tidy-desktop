import { describe, expect, it } from 'vitest'
import type { AppItem } from '../../../shared/types'
import {
  countCategoryApps,
  countSubcategoryApps,
  removeCategoryFromApps,
  removeSubcategoryFromApps
} from './categoryDeletion'

function app(id: string, categoryId: string | null, subcategoryId: string | null = null): AppItem {
  return {
    id,
    name: id,
    path: `C:\\${id}.exe`,
    icon: '',
    categoryId,
    subcategoryId,
    pinyin: '',
    firstLetter: ''
  }
}

const apps = [
  app('direct', 'work'),
  app('child', 'work', 'tools'),
  app('stale-child', 'other', 'tools'),
  app('other', 'other', 'games')
]

describe('category deletion', () => {
  it('moves retained category apps to All and includes child-subcategory references', () => {
    const result = removeCategoryFromApps(apps, 'work', ['tools'], true)

    expect(countCategoryApps(apps, 'work', ['tools'])).toBe(3)
    expect(result.slice(0, 3).map(item => [item.categoryId, item.subcategoryId])).toEqual([
      [null, null],
      [null, null],
      [null, null]
    ])
    expect(result[3]).toBe(apps[3])
  })

  it('removes category apps when retention is disabled', () => {
    expect(removeCategoryFromApps(apps, 'work', ['tools'], false).map(item => item.id)).toEqual(['other'])
  })
})

describe('subcategory deletion', () => {
  it('moves retained subcategory apps to All', () => {
    const result = removeSubcategoryFromApps(apps, 'tools', true)

    expect(countSubcategoryApps(apps, 'tools')).toBe(2)
    expect(result.filter(item => item.id === 'child' || item.id === 'stale-child'))
      .toMatchObject([
        { categoryId: null, subcategoryId: null },
        { categoryId: null, subcategoryId: null }
      ])
  })

  it('removes subcategory apps when retention is disabled', () => {
    expect(removeSubcategoryFromApps(apps, 'tools', false).map(item => item.id)).toEqual(['direct', 'other'])
  })
})
