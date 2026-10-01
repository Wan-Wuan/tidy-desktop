import { describe, expect, it } from 'vitest'
import type { AppItem } from '../../../shared/types'
import { buildNewApp, buildTypeFields, buildUpdatedApp } from './appUpdate'

function app(overrides: Partial<AppItem> = {}): AppItem {
  return {
    id: 'a1',
    name: '旧名字',
    path: 'C:\\App\\old.exe',
    icon: 'data:image/png;base64,AAAA',
    categoryId: 'cat-1',
    subcategoryId: 'sub-1',
    pinyin: '',
    firstLetter: '',
    type: 'app',
    aliases: [],
    ...overrides
  }
}

describe('buildUpdatedApp', () => {
  it('分类未变时保留子分类（编辑名字/路径不该把人踢出原分组）', () => {
    const updated = buildUpdatedApp(app(), {
      name: '新名字',
      path: 'C:\\App\\new.exe',
      categoryId: 'cat-1',
      type: 'app',
      aliases: []
    })
    expect(updated.subcategoryId).toBe('sub-1')
  })

  it('换了分类时清空子分类（否则应用会从目标分类的网格里消失）', () => {
    const updated = buildUpdatedApp(app(), {
      name: '旧名字',
      path: 'C:\\App\\old.exe',
      categoryId: 'cat-2',
      type: 'app',
      aliases: []
    })
    expect(updated.categoryId).toBe('cat-2')
    expect(updated.subcategoryId).toBeNull()
  })

  it('路径变了清空图标，路径没变保留图标', () => {
    const pathChanged = buildUpdatedApp(app(), {
      name: '旧名字',
      path: 'C:\\App\\other.exe',
      categoryId: 'cat-1',
      type: 'app',
      aliases: []
    })
    expect(pathChanged.icon).toBe('')

    const same = buildUpdatedApp(app(), {
      name: '旧名字',
      path: 'C:\\App\\old.exe',
      categoryId: 'cat-1',
      type: 'app',
      aliases: []
    })
    expect(same.icon).toBe('data:image/png;base64,AAAA')
  })

  it('类型变了也清空图标（app → folder 时旧图标不再适用）', () => {
    const updated = buildUpdatedApp(app(), {
      name: '旧名字',
      path: 'C:\\App\\old.exe',
      categoryId: 'cat-1',
      type: 'folder',
      aliases: []
    })
    expect(updated.icon).toBe('')
    expect(updated.type).toBe('folder')
  })

  it('其它字段（id / 启动统计 / 隐藏态）原样保留', () => {
    const updated = buildUpdatedApp(
      app({ launchCount: 7, lastOpenedAt: 1234, hidden: true }),
      { name: 'x', path: 'C:\\App\\old.exe', categoryId: 'cat-1', type: 'app', aliases: ['别名'] }
    )
    expect(updated.id).toBe('a1')
    expect(updated.launchCount).toBe(7)
    expect(updated.lastOpenedAt).toBe(1234)
    expect(updated.hidden).toBe(true)
    expect(updated.aliases).toEqual(['别名'])
  })

  it('文本改成应用后不留下 noteContent（类型专属字段要清干净）', () => {
    const updated = buildUpdatedApp(
      app({ type: 'note', noteContent: '记得买牛奶' }),
      { name: '笔记', path: '', categoryId: 'cat-1', type: 'app', aliases: [], args: '' }
    )
    expect(updated.noteContent).toBeUndefined()
    expect(updated.args).toBeUndefined()
  })

  it('待办改成应用后不留下 noteKind / todoItems', () => {
    const updated = buildUpdatedApp(
      app({ type: 'note', noteKind: 'todo', todoItems: [{ id: 't1', text: '买牛奶', done: true }] }),
      { name: '待办', path: '', categoryId: 'cat-1', type: 'app', aliases: [] }
    )
    expect(updated.noteKind).toBeUndefined()
    expect(updated.todoItems).toBeUndefined()
  })

  it('组合改成应用后不留下 memberIds / confirmBeforeLaunch', () => {
    const updated = buildUpdatedApp(
      app({ type: 'group', memberIds: ['a', 'b'], confirmBeforeLaunch: true }),
      { name: '组合', path: '', categoryId: 'cat-1', type: 'app', aliases: [] }
    )
    expect(updated.memberIds).toBeUndefined()
    expect(updated.confirmBeforeLaunch).toBeUndefined()
  })

  it('应用改成文本后不留下 openWith', () => {
    const updated = buildUpdatedApp(
      app({ type: 'app', openWith: { command: 'C:\\Tools\\code.exe', argsBefore: '-n' } }),
      { name: '笔记', path: '', categoryId: 'cat-1', type: 'note', aliases: [] }
    )
    expect(updated.openWith).toBeUndefined()
  })

  it('应用改成文件夹时保留 openWith（两者都支持「用指定程序打开」）', () => {
    const openWith = { command: 'C:\\Tools\\code.exe', argsBefore: '-n' }
    const updated = buildUpdatedApp(
      app({ type: 'app', openWith }),
      { name: '项目', path: 'D:\\proj', categoryId: 'cat-1', type: 'folder', aliases: [], openWith }
    )
    expect(updated.openWith).toEqual(openWith)
  })
})

describe('buildTypeFields', () => {
  it('app 类型只带 args / workingDir / openWith，且空白串收敛为 undefined', () => {
    expect(buildTypeFields({ type: 'app', args: '  --flag  ', workingDir: '   ' })).toEqual({
      args: '--flag',
      workingDir: undefined,
      openWith: null
    })
  })

  it('url 类型只带 browserId，缺省是 null', () => {
    expect(buildTypeFields({ type: 'url' })).toEqual({ browserId: null })
    expect(buildTypeFields({ type: 'url', browserId: 'chrome' })).toEqual({ browserId: 'chrome' })
  })

  it('note 类型带上形态与两份内容，缺省是「笔记 + 空正文 + 空条目」', () => {
    expect(buildTypeFields({ type: 'note' })).toEqual({
      noteContent: '',
      noteKind: 'text',
      todoItems: []
    })
  })

  it('note 形态是待办时也保留正文——笔记↔待办来回切不该丢内容', () => {
    const items = [{ id: 't1', text: '买牛奶', done: false }]
    expect(buildTypeFields({ type: 'note', noteKind: 'todo', noteContent: '旧正文', todoItems: items }))
      .toEqual({ noteContent: '旧正文', noteKind: 'todo', todoItems: items })
  })

  it('note 形态只有 text / todo 两种，非法值回落 text', () => {
    expect(buildTypeFields({ type: 'note', noteKind: 'whatever' as never }).noteKind).toBe('text')
  })

  it('group 类型成员去重且保留顺序（顺序就是启动顺序）', () => {
    const fields = buildTypeFields({ type: 'group', memberIds: ['b', 'a', 'b', 'c'] })
    expect(fields.memberIds).toEqual(['b', 'a', 'c'])
    expect(fields.confirmBeforeLaunch).toBe(false)
  })

  it('folder 只带 openWith（文件夹也能「用指定程序打开」，如用编辑器打开项目目录）', () => {
    expect(buildTypeFields({ type: 'folder' })).toEqual({ openWith: null })
    expect(buildTypeFields({ type: 'folder', openWith: { command: 'C:\\Tools\\code.exe', argsBefore: '-n' } }))
      .toEqual({ openWith: { command: 'C:\\Tools\\code.exe', argsBefore: '-n' } })
  })

  it('steam 没有类型专属字段', () => {
    expect(buildTypeFields({ type: 'steam' })).toEqual({})
  })
})

describe('buildNewApp', () => {
  it('拼音与首字母由名称推导，子分类为空', () => {
    const built = buildNewApp({ name: '微信', path: 'C:\\wx.exe', categoryId: 'cat-1', type: 'app' }, 'id-1')
    expect(built.id).toBe('id-1')
    expect(built.subcategoryId).toBeNull()
    expect(built.firstLetter).toBe('wx')
    expect(built.pinyin.length).toBeGreaterThan(0)
    expect(built.aliases).toEqual([])
    expect(built.icon).toBe('')
  })

  it('网址类型带上弹窗里已经抓好的 favicon', () => {
    const built = buildNewApp({
      name: 'GitHub',
      path: 'https://github.com',
      categoryId: 'cat-1',
      type: 'url',
      icon: 'data:image/png;base64,AAAA'
    }, 'id-2')
    expect(built.icon).toBe('data:image/png;base64,AAAA')
    expect(built.browserId).toBeNull()
  })

  it('组合类型的成员写进 memberIds', () => {
    const built = buildNewApp({
      name: '开工',
      path: '',
      categoryId: 'cat-1',
      type: 'group',
      memberIds: ['x', 'y'],
      confirmBeforeLaunch: true
    }, 'id-3')
    expect(built.memberIds).toEqual(['x', 'y'])
    expect(built.confirmBeforeLaunch).toBe(true)
  })
})
