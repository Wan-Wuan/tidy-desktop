import { describe, expect, it } from 'vitest'
import type { AppItem, Category } from '../../../shared/types'
import { deduplicateAppsByPath, filterStillEmptyCategories, findEmptyCategories } from './maintenance'

const categories: Category[] = [
  { id: 'work', name: 'Work', icon: '', order: 1 },
  { id: 'empty', name: 'Empty', icon: '', order: 2 }
]

function app(id: string, path: string, categoryId: string | null, hidden = false): AppItem {
  return {
    id,
    name: id,
    path,
    icon: '',
    categoryId,
    subcategoryId: null,
    pinyin: '',
    firstLetter: '',
    type: 'app',
    hidden
  }
}

describe('maintenance category checks', () => {
  it('does not classify a category with only hidden apps as empty', () => {
    const result = findEmptyCategories([app('hidden-app', 'C:\\hidden.exe', 'work', true)], categories)
    expect(result.map(category => category.id)).toEqual(['empty'])
  })

  it('filters stale empty-category candidates that are now referenced', () => {
    const result = filterStillEmptyCategories(categories, [app('new-app', 'C:\\new.exe', 'work')])
    expect(result.map(category => category.id)).toEqual(['empty'])
  })
})

describe('maintenance duplicate checks', () => {
  it('keeps the first path and compares paths case-insensitively', () => {
    const result = deduplicateAppsByPath([
      app('first', 'C:\\Tools\\App.exe', 'work'),
      app('duplicate', 'c:\\tools\\app.exe', 'work'),
      app('other', 'C:\\Tools\\Other.exe', 'work')
    ])
    expect(result.apps.map(item => item.id)).toEqual(['first', 'other'])
    expect(result.removedCount).toBe(1)
  })
})
