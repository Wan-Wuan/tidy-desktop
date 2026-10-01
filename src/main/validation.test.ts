import { describe, expect, it } from 'vitest'
import type { Config } from '../shared/types'
import { sanitizeAppsData, sanitizeCategoriesData, sanitizeConfig } from './validation'

const defaults: Config = {
  hotkey: 'Alt+Space',
  searchHotkey: 'Ctrl+K',
  windowSize: { width: 1050, height: 800 },
  searchEngines: {
    b: { name: 'Bing', url: 'https://www.bing.com/search?q=' }
  },
  autoStart: false,
  ui: {
    gridColumns: 6,
    cardSize: 'medium',
    showIcon: true,
    showName: true,
    borderRadius: 8,
    theme: 'aurora',
    layout: 'horizon-workspace',
    sidebarWidth: 240
  },
  defaultEngine: 'b',
  autoCategoryRules: [],
  quickActions: [],
  onboardingCompleted: true
}

describe('sanitizeConfig UI layout', () => {
  it('preserves a supported workspace template', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, layout: 'studio-split' }
    }, defaults)

    expect(result?.ui?.layout).toBe('studio-split')
  })

  it('falls back when an unknown workspace template is supplied', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, layout: 'unknown-layout' }
    }, defaults)

    expect(result?.ui?.layout).toBe('horizon-workspace')
  })

  it('clamps a saved sidebar width to the supported range', () => {
    const tooNarrow = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, sidebarWidth: 80 }
    }, defaults)
    const tooWide = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, sidebarWidth: 900 }
    }, defaults)

    expect(tooNarrow?.ui?.sidebarWidth).toBe(180)
    expect(tooWide?.ui?.sidebarWidth).toBe(420)
  })
})

describe('sanitizeConfig new fields', () => {
  it('keeps a supported close action and rejects unknown values', () => {
    const quit = sanitizeConfig({ ...defaults, closeAction: 'quit' }, defaults)
    expect(quit?.closeAction).toBe('quit')

    const invalid = sanitizeConfig({ ...defaults, closeAction: 'explode' }, defaults)
    expect(invalid?.closeAction).toBe('tray')
  })

  it('preserves lastActiveCategoryId and drops non-string values', () => {
    const saved = sanitizeConfig({ ...defaults, lastActiveCategoryId: 'cat-123' }, defaults)
    expect(saved?.lastActiveCategoryId).toBe('cat-123')

    const empty = sanitizeConfig({ ...defaults, lastActiveCategoryId: 42 }, defaults)
    expect(empty?.lastActiveCategoryId).toBeNull()
  })

  it('clamps search box settings to supported ranges', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, searchWidth: 2000, searchVerticalRatio: 5, searchMaxResults: 99, sortMode: 'newest' }
    }, defaults)
    expect(result?.ui?.searchWidth).toBe(900)
    expect(result?.ui?.searchVerticalRatio).toBe(0.8)
    expect(result?.ui?.searchMaxResults).toBe(12)
    expect(result?.ui?.sortMode).toBe('manual')
  })

  it('keeps a valid sort mode', () => {
    const result = sanitizeConfig({ ...defaults, ui: { ...defaults.ui, sortMode: 'launchCount' } }, defaults)
    expect(result?.ui?.sortMode).toBe('launchCount')
  })

  it('persists boolean flags as booleans', () => {
    const result = sanitizeConfig({
      ...defaults,
      searchAutoHideOnBlur: true,
      startMinimizedToTray: true,
      mainAutoHideOnBlur: true,
      trayNotified: true,
      windowPosition: { x: 120, y: 80 }
    }, defaults)
    expect(result?.searchAutoHideOnBlur).toBe(true)
    expect(result?.startMinimizedToTray).toBe(true)
    expect(result?.mainAutoHideOnBlur).toBe(true)
    expect(result?.trayNotified).toBe(true)
    expect(result?.windowPosition).toEqual({ x: 120, y: 80 })
  })
})

describe('sanitizeConfig 外观与备份（P2）', () => {
  it('保留字体族 / 字号缩放，并把缩放夹到 0.8~1.4', () => {
    const kept = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, fontFamily: 'Microsoft YaHei', uiScale: 1.2 }
    }, defaults)
    expect(kept?.ui?.fontFamily).toBe('Microsoft YaHei')
    expect(kept?.ui?.uiScale).toBe(1.2)

    const tooBig = sanitizeConfig({ ...defaults, ui: { ...defaults.ui, uiScale: 9 } }, defaults)
    expect(tooBig?.ui?.uiScale).toBe(1.4)
    const tooSmall = sanitizeConfig({ ...defaults, ui: { ...defaults.ui, uiScale: 0 } }, defaults)
    expect(tooSmall?.ui?.uiScale).toBe(0.8)
  })

  it('保留背景设置并把暗化夹到 0~0.9', () => {
    const kept = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, background: { kind: 'image', value: 'D:/pics/bg.png', blur: 12, dim: 0.5 } }
    }, defaults)
    expect(kept?.ui?.background).toEqual({ kind: 'image', value: 'D:/pics/bg.png', blur: 12, dim: 0.5 })

    const clamped = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, background: { kind: 'image', value: 'x', blur: 999, dim: 5 } }
    }, defaults)
    expect(clamped?.ui?.background?.blur).toBe(40)
    expect(clamped?.ui?.background?.dim).toBe(0.9)
  })

  it('未知的背景类型回落到默认（不落盘非法 kind）', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, background: { kind: 'video', value: 'x' } }
    }, defaults)
    expect(result?.ui?.background).toBeNull()
  })

  it('保留搜索占位符与托盘图标，null 保留为 null', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, searchPlaceholder: '搜点什么…', trayIcon: 'D:/icons/tray.png' }
    }, defaults)
    expect(result?.ui?.searchPlaceholder).toBe('搜点什么…')
    expect(result?.ui?.trayIcon).toBe('D:/icons/tray.png')

    const cleared = sanitizeConfig({ ...defaults, ui: { ...defaults.ui, trayIcon: null } }, defaults)
    expect(cleared?.ui?.trayIcon).toBeNull()
  })

  it('备份开关 / 目录 / 份数：缺省开、目录可空、份数夹到 1~50', () => {
    // 缺省：自动备份视为开启
    const base = sanitizeConfig({ ...defaults }, defaults)
    expect(base?.backupEnabled).toBe(true)
    expect(base?.backupDir).toBeNull()
    expect(base?.backupKeep).toBe(7)

    const custom = sanitizeConfig({ ...defaults, backupEnabled: false, backupDir: 'D:/bak', backupKeep: 30 }, defaults)
    expect(custom?.backupEnabled).toBe(false)
    expect(custom?.backupDir).toBe('D:/bak')
    expect(custom?.backupKeep).toBe(30)

    const tooMany = sanitizeConfig({ ...defaults, backupKeep: 999 }, defaults)
    expect(tooMany?.backupKeep).toBe(50)
    const tooFew = sanitizeConfig({ ...defaults, backupKeep: 0 }, defaults)
    expect(tooFew?.backupKeep).toBe(1)
  })

  it('保留分类外观字段并夹到区间内', () => {
    const kept = sanitizeCategoriesData({
      categories: [{ id: 'c1', name: '游戏', icon: '🎮', order: 0, fontSize: 18, itemHeight: 60, iconSize: 24 }]
    })
    expect(kept?.categories[0]).toMatchObject({ fontSize: 18, itemHeight: 60, iconSize: 24 })

    const clamped = sanitizeCategoriesData({
      categories: [{ id: 'c1', name: '游戏', icon: '🎮', order: 0, fontSize: 999, itemHeight: 1, iconSize: 999 }]
    })
    expect(clamped?.categories[0].fontSize).toBe(24)
    expect(clamped?.categories[0].itemHeight).toBe(24)
    expect(clamped?.categories[0].iconSize).toBe(48)
  })
})

/* ───────────── 文本项目的待办形态（P3-1） ───────────── */

/** 把一条 note 塞进 apps 数据里过一遍清洗，返回清洗后的项目 */
function sanitizeNote(app: Record<string, unknown>) {
  const data = sanitizeAppsData({
    apps: [{ id: 'n1', name: '待办', path: '', icon: '', categoryId: null, type: 'note', ...app }]
  })
  return data!.apps[0]
}

describe('sanitizeAppsData · 待办条目', () => {
  it('noteKind 缺省视为 text（历史数据兼容）', () => {
    expect(sanitizeNote({}).noteKind).toBe('text')
  })

  it('noteKind 合法值保留，非法值回落 text', () => {
    expect(sanitizeNote({ noteKind: 'todo' }).noteKind).toBe('todo')
    expect(sanitizeNote({ noteKind: 'checklist' }).noteKind).toBe('text')
    expect(sanitizeNote({ noteKind: 123 }).noteKind).toBe('text')
  })

  it('todoItems 不是数组时给空数组', () => {
    expect(sanitizeNote({ noteKind: 'todo', todoItems: 'nope' }).todoItems).toEqual([])
  })

  it('丢掉空文本条目——否则界面上会出现看不见却占着位置的行', () => {
    const cleaned = sanitizeNote({
      noteKind: 'todo',
      todoItems: [
        { id: 'a', text: '买牛奶', done: false },
        { id: 'b', text: '   ', done: false },
        { id: 'c', text: 42, done: false }
      ]
    })
    expect(cleaned.todoItems).toHaveLength(1)
    expect(cleaned.todoItems![0].text).toBe('买牛奶')
  })

  it('缺 id 的条目自动补一个（id 是 key 与 toggle 的目标，不能空）', () => {
    const cleaned = sanitizeNote({ noteKind: 'todo', todoItems: [{ text: '买牛奶' }] })
    expect(cleaned.todoItems![0].id).toBeTruthy()
  })

  it('重复 id 会被重新分配——否则勾一条会连带勾掉另一条', () => {
    const cleaned = sanitizeNote({
      noteKind: 'todo',
      todoItems: [
        { id: 'dup', text: 'a', done: false },
        { id: 'dup', text: 'b', done: false }
      ]
    })
    const [first, second] = cleaned.todoItems!
    expect(first.id).not.toBe(second.id)
  })

  it('done 只认布尔 true，其余按未完成处理', () => {
    const cleaned = sanitizeNote({
      noteKind: 'todo',
      todoItems: [
        { id: 'a', text: 'a', done: true },
        { id: 'b', text: 'b', done: 'yes' },
        { id: 'c', text: 'c' }
      ]
    })
    expect(cleaned.todoItems!.map(item => item.done)).toEqual([true, false, false])
  })

  it('超长条目文本被截断到 500 字', () => {
    const cleaned = sanitizeNote({
      noteKind: 'todo',
      todoItems: [{ id: 'a', text: 'x'.repeat(900), done: false }]
    })
    expect(cleaned.todoItems![0].text).toHaveLength(500)
  })

  it('条目数量超过上限时截断到 500 条', () => {
    const many = Array.from({ length: 620 }, (_, i) => ({ id: `t${i}`, text: `条目 ${i}`, done: false }))
    expect(sanitizeNote({ noteKind: 'todo', todoItems: many }).todoItems).toHaveLength(500)
  })
})

/* ───────── 无路径类型（文本 / 组合）必须能存下来 ───────── */

describe('sanitizeAppsData · 无路径类型', () => {
  const one = (app: Record<string, unknown>) =>
    sanitizeAppsData({ apps: [{ icon: '', categoryId: null, ...app }] })!.apps

  it('文本项目 path 为空也能存下来（曾经被整条丢弃）', () => {
    const apps = one({ id: 'n1', name: '备忘', path: '', type: 'note' })
    expect(apps).toHaveLength(1)
    expect(apps[0].type).toBe('note')
  })

  it('组合项目 path 为空也能存下来，成员保留', () => {
    const apps = one({ id: 'g1', name: '一套', path: '', type: 'group', memberIds: ['a', 'b'] })
    expect(apps).toHaveLength(1)
    expect(apps[0].memberIds).toEqual(['a', 'b'])
  })

  it('待办形态的文本项目一并存下来', () => {
    const apps = one({
      id: 'n2', name: '本周待办', path: '', type: 'note', noteKind: 'todo',
      todoItems: [{ id: 't1', text: '买牛奶', done: true }]
    })
    expect(apps).toHaveLength(1)
    expect(apps[0].todoItems).toEqual([{ id: 't1', text: '买牛奶', done: true }])
  })

  it('有路径的类型缺路径仍然被丢弃', () => {
    for (const type of ['app', 'folder', 'url', 'steam']) {
      expect(one({ id: 'x', name: 'x', path: '', type })).toHaveLength(0)
    }
  })

  it('缺 id 或 name 仍然被丢弃', () => {
    expect(one({ id: '', name: 'x', path: 'C://a.exe', type: 'app' })).toHaveLength(0)
    expect(one({ id: 'y', name: '', path: 'C://a.exe', type: 'app' })).toHaveLength(0)
  })
})
