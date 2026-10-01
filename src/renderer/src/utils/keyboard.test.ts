// @vitest-environment jsdom
// isEditableTarget 要判断真实 DOM 节点，必须跑在 jsdom 环境（项目默认是 node）。
import { describe, expect, it } from 'vitest'
import { hasCommandKey, isEditableTarget, resolveMainKeyAction } from './keyboard'

describe('isEditableTarget', () => {
  it('输入类元素返回 true', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true)
    }
  })

  it('普通元素返回 false', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(document.createElement('main'))).toBe(false)
  })

  it('contenteditable 的两种写法都算可编辑', () => {
    const empty = document.createElement('div')
    empty.setAttribute('contenteditable', '')
    expect(isEditableTarget(empty)).toBe(true)

    const explicit = document.createElement('div')
    explicit.setAttribute('contenteditable', 'true')
    expect(isEditableTarget(explicit)).toBe(true)

    const off = document.createElement('div')
    off.setAttribute('contenteditable', 'false')
    expect(isEditableTarget(off)).toBe(false)
  })

  it('null 与非元素目标返回 false', () => {
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(document)).toBe(false)
    expect(isEditableTarget(new EventTarget())).toBe(false)
  })
})

describe('hasCommandKey', () => {
  it('Ctrl 或 Meta 任一按下即为真', () => {
    expect(hasCommandKey({ ctrlKey: true, metaKey: false })).toBe(true)
    expect(hasCommandKey({ ctrlKey: false, metaKey: true })).toBe(true)
    expect(hasCommandKey({ ctrlKey: false, metaKey: false })).toBe(false)
  })
})

describe('resolveMainKeyAction', () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
    ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...extra })
  const idle = { overlayOpen: false, hasSelection: false, visibleCount: 5 }
  const selected = { ...idle, hasSelection: true }

  it('弹窗打开时一切让位（Esc 交给 useDialogA11y）', () => {
    const open = { ...selected, overlayOpen: true }
    expect(resolveMainKeyAction(key('Escape'), open)).toBeNull()
    expect(resolveMainKeyAction(key('Delete'), open)).toBeNull()
    expect(resolveMainKeyAction(key('a', { ctrlKey: true }), open)).toBeNull()
  })

  it('Esc：有选中就清选择，没有就收起窗口', () => {
    expect(resolveMainKeyAction(key('Escape'), selected)).toEqual({ type: 'clear-selection' })
    expect(resolveMainKeyAction(key('Escape'), idle)).toEqual({ type: 'hide-window' })
  })

  /* ⚠️ 这条是回归防线。曾经把 isEditableTarget 提到 Esc 前面，
     焦点停在多选工具条的 <select> 上时 Esc 直接失效——选择清不掉、窗口也收不起来。
     如果哪天又有人重排顺序，这条会红。 */
  it('Esc 不受 isEditableTarget 影响：焦点在 select / input 里也必须生效', () => {
    for (const tag of ['select', 'input', 'textarea']) {
      const el = document.createElement(tag)
      expect(resolveMainKeyAction(key('Escape', { target: el }), selected))
        .toEqual({ type: 'clear-selection' })
      expect(resolveMainKeyAction(key('Escape', { target: el }), idle))
        .toEqual({ type: 'hide-window' })
    }
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(resolveMainKeyAction(key('Escape', { target: editable }), idle))
      .toEqual({ type: 'hide-window' })
  })

  it('Ctrl+A / Delete 仍要为文本编辑让位', () => {
    const input = document.createElement('input')
    expect(resolveMainKeyAction(key('a', { ctrlKey: true, target: input }), idle)).toBeNull()
    expect(resolveMainKeyAction(key('Delete', { target: input }), selected)).toBeNull()
  })

  it('Ctrl+A：可见项为 0 时不动，否则全选', () => {
    expect(resolveMainKeyAction(key('a', { ctrlKey: true }), idle)).toEqual({ type: 'select-all' })
    expect(resolveMainKeyAction(key('a', { ctrlKey: true }), { ...idle, visibleCount: 0 })).toBeNull()
    // Alt+Ctrl+A 是别的组合键，不抢
    expect(resolveMainKeyAction(key('a', { ctrlKey: true, altKey: true }), idle)).toBeNull()
  })

  it('Delete：只在有选中时触发', () => {
    expect(resolveMainKeyAction(key('Delete'), selected)).toEqual({ type: 'delete-selection' })
    expect(resolveMainKeyAction(key('Delete'), idle)).toBeNull()
  })

  it('无关按键返回 null', () => {
    for (const k of ['Enter', 'a', 'F5', ' ']) {
      expect(resolveMainKeyAction(key(k), selected)).toBeNull()
    }
  })
})
