import { describe, expect, it } from 'vitest'
import { isSyncedAppId, parseSyncedAppId, syncedAppId } from './syncedId'

describe('syncedAppId', () => {
  it('同一个分类 + 同一个路径永远得到同一个 id（同步项不落盘，靠它当稳定 key）', () => {
    const a = syncedAppId('cat-1', 'D:\\Apps\\x.exe')
    const b = syncedAppId('cat-1', 'D:\\Apps\\x.exe')
    expect(a).toBe(b)
  })

  it('分类不同或路径不同则 id 不同', () => {
    expect(syncedAppId('cat-1', 'D:\\a.exe')).not.toBe(syncedAppId('cat-2', 'D:\\a.exe'))
    expect(syncedAppId('cat-1', 'D:\\a.exe')).not.toBe(syncedAppId('cat-1', 'D:\\b.exe'))
  })
})

describe('parseSyncedAppId', () => {
  it('Windows 路径里的冒号不会被误当成分隔符', () => {
    const id = syncedAppId('cat-1', 'D:\\Program Files\\App\\app.exe')
    expect(parseSyncedAppId(id)).toEqual({ categoryId: 'cat-1', path: 'D:\\Program Files\\App\\app.exe' })
  })

  it('网络路径同样能还原', () => {
    const id = syncedAppId('c9', '\\\\nas\\share\\tool.exe')
    expect(parseSyncedAppId(id)?.path).toBe('\\\\nas\\share\\tool.exe')
  })

  it('非同步 id 返回 null（普通应用 id 是 uuid）', () => {
    expect(parseSyncedAppId('2f1c9a3e-0000-4000-8000-000000000000')).toBeNull()
    expect(isSyncedAppId('2f1c9a3e-0000-4000-8000-000000000000')).toBe(false)
  })

  it('格式残缺时返回 null 而不是抛异常', () => {
    expect(parseSyncedAppId('synced:')).toBeNull()
    expect(parseSyncedAppId('synced:no-colon')).toBeNull()
    expect(parseSyncedAppId('synced::D:\\a.exe')).toBeNull()
  })
})
