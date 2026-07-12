import { describe, expect, it } from 'vitest'
import type { AppItem, ShortcutImportItem } from '../../../shared/types'
import { filterNewShortcutItems } from './shortcutImport'

const app = (path: string): AppItem => ({
  id: path,
  name: 'Existing app',
  path,
  icon: '',
  categoryId: null,
  subcategoryId: null,
  pinyin: '',
  firstLetter: '',
  type: 'app'
})

const shortcut = (path: string, targetPath: string): ShortcutImportItem => ({
  name: 'Tool', path, targetPath, icon: '', type: 'app', source: 'desktop'
})

describe('filterNewShortcutItems', () => {
  it('skips a shortcut when its link path is already in the app list', () => {
    const item = shortcut('C:\\Desktop\\Tool.lnk', 'C:\\Tools\\Tool.exe')
    expect(filterNewShortcutItems([item], [app(item.path)])).toEqual([])
  })

  it('skips a shortcut when its target path is already in the app list', () => {
    const item = shortcut('C:\\Desktop\\Tool.lnk', 'C:\\Tools\\Tool.exe')
    expect(filterNewShortcutItems([item], [app(item.targetPath)])).toEqual([])
  })

  it('deduplicates matching targets from the same import scan', () => {
    const target = 'C:\\Tools\\Tool.exe'
    const desktop = shortcut('C:\\Desktop\\Tool.lnk', target)
    const startMenu = { ...shortcut('C:\\Start Menu\\Tool.lnk', target), source: 'startMenu' as const }
    expect(filterNewShortcutItems([desktop, startMenu], [])).toEqual([desktop])
  })

  it('matches an imported target against an existing shortcut resolved from another link', () => {
    const target = 'C:\\Users\\Wan-wuan\\AppData\\Local\\Programs\\OpenCode\\OpenCode.exe'
    const existingDesktopLink = app('C:\\Users\\Wan-wuan\\OneDrive\\Desktop\\OpenCode.lnk')
    const startMenu = shortcut('C:\\Users\\Wan-wuan\\Start Menu\\OpenCode.lnk', target)
    expect(filterNewShortcutItems([startMenu], [existingDesktopLink], [target])).toEqual([])
  })
})
