// @vitest-environment jsdom
/* `flattenSyncedApps` 是主窗口与搜索窗共用的唯一一份"快照 → 条目"逻辑，
   两边的差异（图标缓存、拼音）都只体现在入参上。这里守住入参的边界行为。 */
import { describe, it, expect } from 'vitest'
import { flattenSyncedApps } from './syncedApps'
import { isSyncedAppId, parseSyncedAppId } from './syncedId'
import type { Category, FolderSyncSnapshot } from '../../../shared/types'

const category: Category = {
  id: 'cat-1',
  name: '资料',
  icon: '📁',
  order: 0,
  linkFolder: { path: 'C:\\Docs', includeSubdirs: false, lastSyncAt: 1, hiddenPaths: [], order: [] }
}

const snapshot: FolderSyncSnapshot = {
  path: 'C:\\Docs',
  includeSubdirs: false,
  lastSyncAt: 1,
  error: null,
  truncated: false,
  entries: [
    { name: '报告.docx', path: 'C:\\Docs\\报告.docx', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 },
    { name: '素材', path: 'C:\\Docs\\素材', type: 'folder', depth: 1, firstSeenAt: 1, hidden: false, order: 1 },
    { name: '按扫描隐藏的.txt', path: 'C:\\Docs\\按扫描隐藏.txt', type: 'app', depth: 1, firstSeenAt: 1, hidden: true, order: 2 }
  ]
}

describe('flattenSyncedApps', () => {
  it('铺出可搜索的条目，id 可被反向解析回分类与路径', () => {
    const list = flattenSyncedApps({ categories: [category], snapshots: { 'cat-1': snapshot } })
    expect(list.map(app => app.name)).toEqual(['报告.docx', '素材'])

    const first = list[0]
    expect(isSyncedAppId(first.id)).toBe(true)
    expect(parseSyncedAppId(first.id)).toEqual({ categoryId: 'cat-1', path: 'C:\\Docs\\报告.docx' })
    expect(first.categoryId).toBe('cat-1')
    expect(first.type).toBe('app')
    expect(first.isSynced).toBe(true)
    expect(first.sourceFolder).toBe('C:\\Docs')
    /* 拼音必须现算：搜索窗的 matchesTerm 只认条目上预存的 pinyin / firstLetter */
    expect(first.pinyin).not.toBe('')
    expect(first.firstLetter).not.toBe('')
  })

  it('快照里已隐藏的条目直接滤掉', () => {
    const list = flattenSyncedApps({ categories: [category], snapshots: { 'cat-1': snapshot } })
    expect(list.some(app => app.name === '按扫描隐藏的.txt')).toBe(false)
  })

  it('写进 hiddenPaths 的条目也滤掉，且大小写不敏感（Windows 路径）', () => {
    const linked: Category = {
      ...category,
      linkFolder: { ...category.linkFolder!, hiddenPaths: ['c:\\docs\\报告.DOCX'] }
    }
    const list = flattenSyncedApps({ categories: [linked], snapshots: { 'cat-1': snapshot } })
    expect(list.map(app => app.name)).toEqual(['素材'])
  })

  it('没绑定目录的分类不产出任何条目', () => {
    const plain: Category = { id: 'cat-2', name: '游戏', icon: '🎮', order: 1 }
    expect(flattenSyncedApps({ categories: [plain], snapshots: {} })).toEqual([])
  })

  it('扫描失败的快照整条跳过——不能把读不到的旧内容当成现状', () => {
    const failed: FolderSyncSnapshot = { ...snapshot, error: 'missing' }
    expect(flattenSyncedApps({ categories: [category], snapshots: { 'cat-1': failed } })).toEqual([])
  })

  it('图标按路径从缓存取；没有缓存时留空串（搜索窗就是这样）', () => {
    const withCache = flattenSyncedApps({
      categories: [category],
      snapshots: { 'cat-1': snapshot },
      iconCache: { 'C:\\Docs\\报告.docx': 'data:image/png;base64,AAA' }
    })
    expect(withCache[0].icon).toBe('data:image/png;base64,AAA')
    expect(withCache[1].icon).toBe('')

    const withoutCache = flattenSyncedApps({ categories: [category], snapshots: { 'cat-1': snapshot } })
    expect(withoutCache.every(app => app.icon === '')).toBe(true)
  })
})
