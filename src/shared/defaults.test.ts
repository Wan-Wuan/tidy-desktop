import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOTKEY,
  DEFAULT_SEARCH_HOTKEY,
  HOTKEY_FALLBACKS,
  LEGACY_DEFAULT_HOTKEY,
  LEGACY_DEFAULT_SEARCH_HOTKEY,
  getHotkeyCandidates,
  isLegacyDefaultHotkey,
  isLegacyDefaultSearchHotkey,
  planHotkeyDefaultMigration,
  planSearchHotkeyDefaultMigration
} from './defaults'

describe('默认热键常量', () => {
  it('默认主热键不能是旧的 Alt+Space', () => {
    /* 回归护栏：Alt+Space 是 Windows 保留组合，register 拿不到，
       一旦有人「顺手改回去」，全局热键就又变成开箱即死。 */
    expect(DEFAULT_HOTKEY).not.toBe(LEGACY_DEFAULT_HOTKEY)
    expect(DEFAULT_HOTKEY.toLowerCase()).not.toBe('alt+space')
  })

  it('主热键与搜索热键不能相同', () => {
    // 两个键设成同一个，后注册的必然抢不到，等于少一个功能
    expect(DEFAULT_HOTKEY.toLowerCase()).not.toBe(DEFAULT_SEARCH_HOTKEY.toLowerCase())
  })

  it('默认搜索热键不能是旧的 Ctrl+K', () => {
    /* 回归护栏：Ctrl+K 在编辑器 / 浏览器 / 办公软件里都是高频键，
       而搜索热键是**全局独占注册**——用它会吞掉全系统的 Ctrl+K。 */
    expect(DEFAULT_SEARCH_HOTKEY).not.toBe(LEGACY_DEFAULT_SEARCH_HOTKEY)
    expect(DEFAULT_SEARCH_HOTKEY.toLowerCase()).not.toBe('ctrl+k')
  })

  it('默认热键一律是「两个以上修饰键」的组合', () => {
    /* 全局热键是独占的：单修饰键 + 字母（Ctrl+K / Alt+F 这类）几乎一定
       已经在某个高频软件里被占用，注册上去就是抢别人的键。
       这条断言是给"以后换默认值"的人看的护栏。 */
    for (const key of [DEFAULT_HOTKEY, DEFAULT_SEARCH_HOTKEY]) {
      const modifiers = key.split('+').length - 1
      expect(modifiers, `${key} 的修饰键数量不足`).toBeGreaterThanOrEqual(2)
    }
  })

  it('搜索热键不与主热键的降级候选撞车', () => {
    /* 撞车的话 bindGlobalShortcuts 里「跳过与搜索热键相同的候选」会让主热键
       白白少一个降级选项。 */
    expect(HOTKEY_FALLBACKS.map(k => k.toLowerCase()))
      .not.toContain(DEFAULT_SEARCH_HOTKEY.toLowerCase())
    expect(HOTKEY_FALLBACKS.map(k => k.toLowerCase()))
      .not.toContain(LEGACY_DEFAULT_SEARCH_HOTKEY.toLowerCase())
  })

  it('降级候选里不含默认值，也不含旧默认值', () => {
    const lowered = HOTKEY_FALLBACKS.map(key => key.toLowerCase())
    expect(lowered).not.toContain(DEFAULT_HOTKEY.toLowerCase())
    expect(lowered).not.toContain(LEGACY_DEFAULT_HOTKEY.toLowerCase())
    expect(new Set(lowered).size).toBe(HOTKEY_FALLBACKS.length)
  })
})

describe('isLegacyDefaultHotkey', () => {
  it('识别旧默认值，忽略大小写与首尾空格', () => {
    expect(isLegacyDefaultHotkey('Alt+Space')).toBe(true)
    expect(isLegacyDefaultHotkey('alt+space')).toBe(true)
    expect(isLegacyDefaultHotkey('  ALT+SPACE  ')).toBe(true)
  })

  it('用户自定义的组合不算旧默认值', () => {
    expect(isLegacyDefaultHotkey('Ctrl+Shift+A')).toBe(false)
    expect(isLegacyDefaultHotkey('Ctrl+Alt+Space')).toBe(false)
  })

  it('空值不算旧默认值', () => {
    expect(isLegacyDefaultHotkey('')).toBe(false)
    expect(isLegacyDefaultHotkey(undefined)).toBe(false)
    expect(isLegacyDefaultHotkey(null)).toBe(false)
  })
})

describe('getHotkeyCandidates', () => {
  it('期望值排在最前，其后是降级候选', () => {
    expect(getHotkeyCandidates('Ctrl+Shift+A')).toEqual(['Ctrl+Shift+A', ...HOTKEY_FALLBACKS])
  })

  it('allowFallback 为 false 时只返回期望值', () => {
    // 用户在设置里主动改键的场景：绝不允许静默替换成别的组合
    expect(getHotkeyCandidates('Ctrl+Shift+A', false)).toEqual(['Ctrl+Shift+A'])
  })

  it('期望值本身就在降级候选里时不重复', () => {
    expect(getHotkeyCandidates('Ctrl+Alt+Q')).toEqual(['Ctrl+Alt+Q', 'Ctrl+Shift+Space'])
  })

  it('去重忽略大小写', () => {
    expect(getHotkeyCandidates('ctrl+alt+q')).toEqual(['ctrl+alt+q', 'Ctrl+Shift+Space'])
  })

  it('空值被剔除，不会产生空候选', () => {
    expect(getHotkeyCandidates('   ')).toEqual([...HOTKEY_FALLBACKS])
    expect(getHotkeyCandidates('', false)).toEqual([])
  })

  it('首尾空格被裁掉', () => {
    expect(getHotkeyCandidates('  Ctrl+Alt+K  ', false)).toEqual(['Ctrl+Alt+K'])
  })
})

describe('planHotkeyDefaultMigration', () => {
  it('老用户（配置里是旧默认值）被迁移到新默认值，并标记为「已替换」', () => {
    expect(planHotkeyDefaultMigration({ hotkey: 'Alt+Space' })).toEqual({
      nextHotkey: DEFAULT_HOTKEY,
      migrated: true
    })
  })

  it('用户自定义过的组合不被动', () => {
    expect(planHotkeyDefaultMigration({ hotkey: 'Ctrl+Shift+A' })).toEqual({
      nextHotkey: null,
      migrated: false
    })
  })

  it('已经打过迁移标记就不再动——哪怕热键又被设回 Alt+Space', () => {
    // 这是「用户手动设回旧值」与「历史遗留的旧默认值」的分界
    expect(planHotkeyDefaultMigration({ hotkey: 'Alt+Space', hotkeyDefaultMigrated: true })).toBeNull()
    expect(planHotkeyDefaultMigration({ hotkey: 'Ctrl+Shift+A', hotkeyDefaultMigrated: true })).toBeNull()
  })

  it('缺 hotkey 字段的老配置补上新默认值，但不算「替换」', () => {
    // migrated=false：没有旧值被换掉，不该弹「你的快捷键被改了」的提示
    expect(planHotkeyDefaultMigration({})).toEqual({ nextHotkey: DEFAULT_HOTKEY, migrated: false })
    expect(planHotkeyDefaultMigration({ hotkey: '' })).toEqual({ nextHotkey: DEFAULT_HOTKEY, migrated: false })
  })

  it('新装用户（配置里已是新默认值）不改值，但仍会打标记', () => {
    // 返回非 null 表示调用方要写回一次以打上标记，否则以后手动设回 Alt+Space 会被反复改掉
    expect(planHotkeyDefaultMigration({ hotkey: DEFAULT_HOTKEY })).toEqual({
      nextHotkey: null,
      migrated: false
    })
  })
})

describe('isLegacyDefaultSearchHotkey', () => {
  it('识别旧默认值，忽略大小写与首尾空格', () => {
    expect(isLegacyDefaultSearchHotkey('Ctrl+K')).toBe(true)
    expect(isLegacyDefaultSearchHotkey('ctrl+k')).toBe(true)
    expect(isLegacyDefaultSearchHotkey('  CTRL+K  ')).toBe(true)
  })

  it('其它组合一律不算', () => {
    expect(isLegacyDefaultSearchHotkey('Ctrl+Alt+K')).toBe(false)
    expect(isLegacyDefaultSearchHotkey('Ctrl+Shift+K')).toBe(false)
    expect(isLegacyDefaultSearchHotkey('')).toBe(false)
    expect(isLegacyDefaultSearchHotkey(undefined)).toBe(false)
    expect(isLegacyDefaultSearchHotkey(null)).toBe(false)
  })
})

describe('planSearchHotkeyDefaultMigration', () => {
  it('老用户（配置里是 Ctrl+K）被迁移到新默认值', () => {
    expect(planSearchHotkeyDefaultMigration({ searchHotkey: 'Ctrl+K' })).toEqual({
      nextSearchHotkey: DEFAULT_SEARCH_HOTKEY,
      migrated: true
    })
  })

  it('用户自定义过的组合不被动', () => {
    expect(planSearchHotkeyDefaultMigration({ searchHotkey: 'Ctrl+Shift+F12' })).toEqual({
      nextSearchHotkey: null,
      migrated: false
    })
  })

  it('已经打过迁移标记就不再动——哪怕又被设回 Ctrl+K', () => {
    expect(planSearchHotkeyDefaultMigration({ searchHotkey: 'Ctrl+K', searchHotkeyDefaultMigrated: true }))
      .toBeNull()
  })

  it('缺字段的老配置补上新默认值，但不算「替换」', () => {
    expect(planSearchHotkeyDefaultMigration({})).toEqual({
      nextSearchHotkey: DEFAULT_SEARCH_HOTKEY,
      migrated: false
    })
    expect(planSearchHotkeyDefaultMigration({ searchHotkey: '' })).toEqual({
      nextSearchHotkey: DEFAULT_SEARCH_HOTKEY,
      migrated: false
    })
  })

  it('两个热键的迁移标记互相独立', () => {
    /* 共用一个标记会导致「只迁移了一个」时另一个永远不再被检查，
       所以这两份必须各自判断。 */
    expect(planSearchHotkeyDefaultMigration({
      searchHotkey: 'Ctrl+K',
      hotkeyDefaultMigrated: true
    } as never)).toEqual({ nextSearchHotkey: DEFAULT_SEARCH_HOTKEY, migrated: true })
  })
})
