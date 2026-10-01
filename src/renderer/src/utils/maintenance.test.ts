import { describe, expect, it } from 'vitest'
import type { AppItem, Category } from '../../../shared/types'
import {
  buildRelocationCandidates,
  deduplicateAppsByPath,
  filterStillEmptyCategories,
  findEmptyCategories
} from './maintenance'

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

describe('maintenance relocation candidates', () => {
  const candidates = (paths: Array<[string, string]>, parent: string) =>
    buildRelocationCandidates(paths.map(([id, path]) => ({ id, path })), parent)

  it('keeps the relative structure under the shared parent directory', () => {
    const result = candidates(
      [['a', 'D:\\Tools\\Alpha\\a.exe'], ['b', 'D:\\Tools\\Beta\\b.exe']],
      'E:\\Backup\\Tools'
    )
    expect(result).toEqual([
      { id: 'a', from: 'D:\\Tools\\Alpha\\a.exe', to: 'E:\\Backup\\Tools\\Alpha\\a.exe' },
      { id: 'b', from: 'D:\\Tools\\Beta\\b.exe', to: 'E:\\Backup\\Tools\\Beta\\b.exe' }
    ])
  })

  it('treats the shared prefix case-insensitively but keeps the original tail', () => {
    const result = candidates(
      [['a', 'D:\\Tools\\Alpha\\a.exe'], ['b', 'd:\\tools\\Beta\\b.exe']],
      'E:\\Tools'
    )
    expect(result.map(item => item.to)).toEqual([
      'E:\\Tools\\Alpha\\a.exe',
      'E:\\Tools\\Beta\\b.exe'
    ])
  })

  it('falls back to the file name when the paths share no directory', () => {
    const result = candidates([['a', 'D:\\Tools\\a.exe'], ['b', 'E:\\Games\\b.exe']], 'F:\\Moved')
    expect(result.map(item => item.to)).toEqual(['F:\\Moved\\a.exe', 'F:\\Moved\\b.exe'])
  })

  it('uses the file name for a single failed path', () => {
    const result = candidates([['a', 'D:\\Tools\\Alpha\\a.exe']], 'E:\\Tools')
    expect(result[0].to).toBe('E:\\Tools\\a.exe')
  })

  it('accepts forward slashes and normalises the trailing separator of the parent', () => {
    const result = candidates([['a', 'D:/Tools/Alpha/a.exe']], 'E:\\Tools\\')
    expect(result[0].to).toBe('E:\\Tools\\a.exe')
  })

  it('skips apps without a usable path so the caller can keep them in the missing bucket', () => {
    const result = candidates([['a', '   '], ['b', 'D:\\Tools\\b.exe']], 'E:\\Tools')
    expect(result.map(item => item.id)).toEqual(['b'])
  })

  it('returns nothing when the parent folder is blank', () => {
    expect(candidates([['a', 'D:\\Tools\\a.exe']], '   ')).toEqual([])
  })
})
