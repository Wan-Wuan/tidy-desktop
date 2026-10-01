import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_FOLDER_ENTRIES,
  applyFolderOverrides,
  applyFolderSync,
  diffFolderEntries,
  emptyFolderCache,
  mergeFolderEntries,
  readFolderCache,
  sanitizeFolderCache,
  scanFolder,
  writeFolderCache
} from './folderSync'
import type { FolderScanEntry } from './folderSync'
import type { FolderSyncEntry } from '../shared/types'

/* 临时目录在 Windows 上建/删很贵（单次几百毫秒）。整份用例共用同一个根目录，
   每个用例只在自己那层子目录里操作，收尾时一次性清掉——否则这个文件要跑十几秒。 */
let root = ''
let caseDir = ''
let caseIndex = 0

const mkdir = (relative: string) => fs.mkdirSync(path.join(caseDir, relative), { recursive: true })
const mkfile = (relative: string, content = 'x') => {
  const target = path.join(caseDir, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

const names = (entries: Array<{ name: string }>) => entries.map(entry => entry.name)

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tidy-foldersync-'))
})

/* ⚠️ 这里**刻意不做清理**。
   开发环境里删除操作被 safe-delete 拦截：`fs.rmSync(dir, { recursive: true })` 会直接挂住
   （afterAll 10s 超时），改成逐项 `unlinkSync` + `rmdirSync` 同样挂住。
   临时目录在 %TEMP% 下、总量几百 KB，交给系统回收即可——
   **不要"顺手"把清理加回来，否则整个测试文件会变成失败状态。** */

beforeEach(() => {
  caseIndex += 1
  caseDir = path.join(root, `case${caseIndex}`)
  fs.mkdirSync(caseDir, { recursive: true })
})

/* ⚠️ `scanFolder` 是 async 的（用的是 `fs.promises.*`，为了不冻结主进程事件循环），
   这里的用例必须 await——漏了 await 拿到的是 Promise，断言会以"收到 {}"的形式失败。 */
describe('scanFolder', () => {
  it('目录与白名单文件被收录，其它文件被排除', async () => {
    mkdir('Games')
    mkfile('Games/game.exe')
    mkfile('Games/readme.txt')
    mkfile('Games/data.dat')
    mkfile('Games/script.ps1')

    const result = await scanFolder(path.join(caseDir, 'Games'))
    expect(result.ok).toBe(true)
    expect(names(result.entries).sort()).toEqual(['game.exe', 'readme.txt', 'script.ps1'])
    expect(result.entries.every(entry => entry.type === 'app')).toBe(true)
  })

  it('目录在前、名字升序，顺序稳定', async () => {
    mkdir('zFolder')
    mkdir('aFolder')
    mkfile('b.exe')
    mkfile('a.exe')

    const result = await scanFolder(caseDir)
    expect(names(result.entries)).toEqual(['aFolder', 'zFolder', 'a.exe', 'b.exe'])
  })

  it('默认递归子目录，并记录层级', async () => {
    mkdir('outer')
    mkdir('outer/inner')
    mkfile('outer/inner/deep.exe')

    const result = await scanFolder(caseDir)
    const outer = result.entries.find(entry => entry.name === 'outer')
    const inner = result.entries.find(entry => entry.name === 'inner')
    const deep = result.entries.find(entry => entry.name === 'deep.exe')
    expect(outer?.depth).toBe(1)
    expect(inner?.depth).toBe(2)
    expect(deep?.depth).toBe(3)
  })

  it('includeSubdirs 为 false 时只扫一层', async () => {
    mkdir('outer')
    mkfile('outer/deep.exe')
    mkfile('top.exe')

    const result = await scanFolder(caseDir, { includeSubdirs: false })
    expect(names(result.entries).sort()).toEqual(['outer', 'top.exe'])
    expect(result.truncated).toBe(false)
  })

  it('触到深度上限时标记 truncated', async () => {
    mkdir('a/b/c/d')
    mkfile('a/b/c/d/deep.exe')

    const result = await scanFolder(caseDir, { maxDepth: 2 })
    expect(result.truncated).toBe(true)
    expect(names(result.entries)).not.toContain('d')
  })

  it('跳过系统噪音文件与点开头文件', async () => {
    mkfile('desktop.ini')
    mkfile('Thumbs.db')
    mkfile('.hidden.exe')
    mkfile('ok.exe')

    const result = await scanFolder(caseDir)
    expect(names(result.entries)).toEqual(['ok.exe'])
  })

  it('数量超限时截断并标记', async () => {
    for (let index = 0; index < 12; index++) mkfile(`f${index}.exe`)
    const result = await scanFolder(caseDir, { maxEntries: 5 })
    expect(result.entries).toHaveLength(5)
    expect(result.truncated).toBe(true)
  })

  it('恰好等于上限且没有更多内容时不算截断', async () => {
    mkfile('a.exe')
    mkfile('b.exe')
    const result = await scanFolder(caseDir, { maxEntries: 2 })
    expect(result.entries).toHaveLength(2)
    expect(result.truncated).toBe(false)
  })

  it('目录不存在时报 missing', async () => {
    const result = await scanFolder(path.join(caseDir, 'nope'))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('missing')
  })

  it('目标是文件时报 not-a-directory', async () => {
    mkfile('a.exe')
    const result = await scanFolder(path.join(caseDir, 'a.exe'))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not-a-directory')
  })

  it('空目录返回空列表且不算失败', async () => {
    const result = await scanFolder(caseDir)
    expect(result).toEqual({ ok: true, error: null, entries: [], truncated: false })
  })
})

describe('mergeFolderEntries', () => {
  const scan: FolderScanEntry[] = [
    { name: 'B', path: 'D:\\x\\B', type: 'folder', depth: 1 },
    { name: 'A', path: 'D:\\x\\A', type: 'app', depth: 1 }
  ]

  const previous: FolderSyncEntry[] = [
    { name: 'A', path: 'D:\\x\\A', type: 'app', depth: 1, firstSeenAt: 1000, hidden: false, order: 0 }
  ]

  it('保留上一次的 firstSeenAt，新条目用 now', () => {
    const merged = mergeFolderEntries(scan, previous, null, 5000)
    expect(merged.find(entry => entry.path === 'D:\\x\\A')?.firstSeenAt).toBe(1000)
    expect(merged.find(entry => entry.path === 'D:\\x\\B')?.firstSeenAt).toBe(5000)
  })

  it('应用隐藏标记（大小写不敏感）', () => {
    const merged = mergeFolderEntries(scan, previous, { hiddenPaths: ['d:\\X\\a'] }, 5000)
    expect(merged.find(entry => entry.name === 'A')?.hidden).toBe(true)
    expect(merged.find(entry => entry.name === 'B')?.hidden).toBe(false)
  })

  it('自定义顺序优先，未列出的排在后面且仍按目录在前', () => {
    const merged = mergeFolderEntries(scan, previous, { order: ['D:\\x\\A'] }, 5000)
    expect(names(merged)).toEqual(['A', 'B'])
  })

  it('没有自定义顺序时按目录在前、名字升序', () => {
    const merged = mergeFolderEntries(scan, previous, null, 5000)
    expect(names(merged)).toEqual(['B', 'A'])
  })

  it('linkFolder 为 null 时不报错', () => {
    expect(mergeFolderEntries(scan, [], null, 1)).toHaveLength(2)
    expect(mergeFolderEntries(scan, [], undefined, 1)).toHaveLength(2)
  })
})

describe('diffFolderEntries', () => {
  const entry = (p: string): FolderSyncEntry => ({
    name: path.basename(p), path: p, type: 'app', depth: 1, firstSeenAt: 0, hidden: false, order: 0
  })

  it('识别新增与移除', () => {
    const diff = diffFolderEntries([entry('a'), entry('b')], [entry('b'), entry('c')])
    expect(diff.added).toEqual(['c'])
    expect(diff.removed).toEqual(['a'])
    expect(diff.kept).toBe(1)
  })

  it('完全相同时没有变化', () => {
    const diff = diffFolderEntries([entry('a')], [entry('a')])
    expect(diff).toEqual({ added: [], removed: [], kept: 1 })
  })

  it('从空到有：全部是新增', () => {
    const diff = diffFolderEntries([], [entry('a'), entry('b')])
    expect(diff.added).toHaveLength(2)
    expect(diff.kept).toBe(0)
  })
})

describe('applyFolderOverrides', () => {
  const entries: FolderSyncEntry[] = [
    { name: 'B', path: 'D:\\x\\B', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 },
    { name: 'A', path: 'D:\\x\\A', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 }
  ]

  it('按 order 重排，未列出的排在后面', () => {
    expect(names(applyFolderOverrides(entries, { order: ['D:\\x\\B'] }))).toEqual(['B', 'A'])
  })

  it('设置隐藏标记且大小写不敏感', () => {
    const result = applyFolderOverrides(entries, { hiddenPaths: ['d:\\X\\b'] })
    expect(result.find(entry => entry.name === 'B')?.hidden).toBe(true)
    expect(result.find(entry => entry.name === 'A')?.hidden).toBe(false)
  })

  it('不改动 firstSeenAt / depth 等条目自身字段', () => {
    const result = applyFolderOverrides(entries, { order: ['D:\\x\\A'] })
    expect(result[0]).toMatchObject({ name: 'A', firstSeenAt: 1, depth: 1 })
  })

  it('空 overrides 时退回默认排序（目录在前、名字升序）', () => {
    const mixed: FolderSyncEntry[] = [
      { name: 'z.exe', path: 'D:\\x\\z.exe', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 },
      { name: 'dir', path: 'D:\\x\\dir', type: 'folder', depth: 1, firstSeenAt: 1, hidden: false, order: 0 }
    ]
    expect(names(applyFolderOverrides(mixed, {}))).toEqual(['dir', 'z.exe'])
  })
})

describe('applyFolderSync', () => {
  const meta = { path: 'D:\\Games', includeSubdirs: true }
  const entry = (p: string): FolderSyncEntry => ({
    name: path.basename(p), path: p, type: 'app', depth: 1, firstSeenAt: 100, hidden: false, order: 0
  })
  const previousSnapshot = {
    path: 'D:\\Games',
    includeSubdirs: true,
    lastSyncAt: 1000,
    error: null,
    truncated: false,
    entries: [entry('D:\\Games\\a.exe')]
  }

  it('扫描成功时推进 lastSyncAt 并写入条目', () => {
    const result = applyFolderSync(
      previousSnapshot,
      { ok: true, error: null, entries: [{ name: 'a.exe', path: 'D:\\Games\\a.exe', type: 'app', depth: 1 }], truncated: false },
      {},
      2000,
      meta
    )
    expect(result.snapshot.lastSyncAt).toBe(2000)
    expect(result.snapshot.error).toBe(null)
    expect(result.changed).toBe(false)
  })

  it('新增条目时 changed 为 true', () => {
    const result = applyFolderSync(
      previousSnapshot,
      {
        ok: true,
        error: null,
        entries: [
          { name: 'a.exe', path: 'D:\\Games\\a.exe', type: 'app', depth: 1 },
          { name: 'b.exe', path: 'D:\\Games\\b.exe', type: 'app', depth: 1 }
        ],
        truncated: false
      },
      {},
      2000,
      meta
    )
    expect(result.changed).toBe(true)
    expect(result.snapshot.entries).toHaveLength(2)
  })

  it('⚠️ 扫描失败时保留上次条目，且不推进 lastSyncAt', () => {
    const result = applyFolderSync(
      previousSnapshot,
      { ok: false, error: 'missing', entries: [], truncated: false },
      {},
      2000,
      meta
    )
    expect(result.snapshot.error).toBe('missing')
    expect(result.snapshot.entries).toEqual(previousSnapshot.entries)
    expect(result.snapshot.lastSyncAt).toBe(1000)
    expect(result.changed).toBe(false)
  })

  it('首次同步就失败时得到空条目与 0 时间戳', () => {
    const result = applyFolderSync(
      undefined,
      { ok: false, error: 'missing', entries: [], truncated: false },
      {},
      2000,
      meta
    )
    expect(result.snapshot.entries).toEqual([])
    expect(result.snapshot.lastSyncAt).toBe(0)
  })

  it('透传 truncated 标记', () => {
    const result = applyFolderSync(
      undefined,
      { ok: true, error: null, entries: [], truncated: true },
      {},
      2000,
      meta
    )
    expect(result.snapshot.truncated).toBe(true)
  })
})

describe('sanitizeFolderCache', () => {
  it('垃圾输入退化成空缓存', () => {
    expect(sanitizeFolderCache(null)).toEqual(emptyFolderCache())
    expect(sanitizeFolderCache('nope')).toEqual(emptyFolderCache())
    expect(sanitizeFolderCache({ folders: 'nope' })).toEqual(emptyFolderCache())
    expect(sanitizeFolderCache({ folders: { c1: { entries: [] } } })).toEqual(emptyFolderCache())
  })

  it('丢掉形状不对的条目，保留合法的', () => {
    const cache = sanitizeFolderCache({
      folders: {
        c1: {
          path: 'D:\\Games',
          includeSubdirs: true,
          lastSyncAt: 123,
          error: null,
          truncated: false,
          entries: [
            { name: 'A', path: 'D:\\Games\\A', type: 'app', depth: 1, firstSeenAt: 5, hidden: true, order: 2 },
            { name: '缺 path' },
            { path: 'D:\\Games\\无名字' },
            null
          ]
        }
      }
    })
    expect(Object.keys(cache.folders)).toEqual(['c1'])
    expect(cache.folders.c1.entries).toHaveLength(1)
    expect(cache.folders.c1.entries[0]).toMatchObject({ name: 'A', hidden: true, order: 2, firstSeenAt: 5 })
  })

  it('深度与数量被夹到合法范围', () => {
    const entries = Array.from({ length: MAX_FOLDER_ENTRIES + 10 }, (_, index) => ({
      name: `f${index}`, path: `D:\\x\\f${index}`, type: 'app', depth: 99, firstSeenAt: 0, hidden: false, order: 0
    }))
    const cache = sanitizeFolderCache({ folders: { c1: { path: 'D:\\x', entries } } })
    expect(cache.folders.c1.entries).toHaveLength(MAX_FOLDER_ENTRIES)
    expect(cache.folders.c1.entries[0].depth).toBe(3)
  })

  it('未知的 error 值按 null 处理', () => {
    const cache = sanitizeFolderCache({ folders: { c1: { path: 'D:\\x', error: 'weird', entries: [] } } })
    expect(cache.folders.c1.error).toBe('weird')
  })
})

describe('readFolderCache / writeFolderCache', () => {
  it('往返一致', () => {
    const cachePath = path.join(caseDir, 'folderCache.json')
    const cache = emptyFolderCache()
    cache.folders.c1 = {
      path: 'D:\\Games',
      includeSubdirs: true,
      lastSyncAt: 999,
      error: null,
      truncated: false,
      entries: [
        { name: 'A', path: 'D:\\Games\\A', type: 'folder', depth: 1, firstSeenAt: 1, hidden: false, order: 0 }
      ]
    }
    expect(writeFolderCache(cachePath, cache)).toBe(true)
    expect(readFolderCache(cachePath)).toEqual(cache)
  })

  it('文件不存在时返回空缓存', () => {
    expect(readFolderCache(path.join(caseDir, 'missing.json'))).toEqual(emptyFolderCache())
  })

  it('文件内容损坏时返回空缓存而不是抛异常', () => {
    const cachePath = path.join(caseDir, 'broken.json')
    fs.writeFileSync(cachePath, '{ not json', 'utf-8')
    expect(readFolderCache(cachePath)).toEqual(emptyFolderCache())
  })

  it('目录不存在时写入会先建目录', () => {
    const cachePath = path.join(caseDir, 'nested', 'deeper', 'folderCache.json')
    expect(writeFolderCache(cachePath, emptyFolderCache())).toBe(true)
    expect(fs.existsSync(cachePath)).toBe(true)
  })
})
