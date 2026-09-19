// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findDropTarget, isPastCardMidpoint, isPointerOutsideWindow } from './dropTarget'

/* 这一组测试锁住的是「拖到哪儿、松手落到哪儿」的判定链路。
   前两次落点问题（子分类重排差一位、应用卡片的左右半边意图在迁移中丢失）
   都出在这条链路上，而它本身全是纯计算，本该有测试。 */

function stubRect(el: HTMLElement, left: number, width: number): HTMLElement {
  el.getBoundingClientRect = () => ({
    left, width, right: left + width, top: 0, bottom: 100, height: 100, x: left, y: 0,
    toJSON: () => ({})
  }) as DOMRect
  return el
}

describe('findDropTarget', () => {
  it('元素为 null 时返回 null', () => {
    expect(findDropTarget(null)).toBeNull()
  })

  it('识别应用卡片', () => {
    const el = document.createElement('div')
    el.setAttribute('data-app-id', 'app-1')
    expect(findDropTarget(el)).toEqual({ type: 'app', id: 'app-1' })
  })

  it('命中卡片内部元素时向上找到卡片', () => {
    const card = document.createElement('div')
    card.setAttribute('data-app-id', 'app-2')
    const icon = document.createElement('span')
    const inner = document.createElement('i')
    icon.appendChild(inner)
    card.appendChild(icon)
    expect(findDropTarget(inner)).toEqual({ type: 'app', id: 'app-2' })
  })

  it('识别分类与子分类', () => {
    const cat = document.createElement('button')
    cat.setAttribute('data-category-id', 'cat-1')
    expect(findDropTarget(cat)).toEqual({ type: 'category', id: 'cat-1' })

    const sub = document.createElement('button')
    sub.setAttribute('data-subcategory-id', 'sub-1')
    expect(findDropTarget(sub)).toEqual({ type: 'subcategory', id: 'sub-1' })
  })

  it('识别网格里的子分类分组落区', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-subcategory-drop', '__none__')
    expect(findDropTarget(zone)).toEqual({ type: 'subcategory-drop', id: '__none__' })
  })

  it('就近优先：内层卡片胜过外层容器', () => {
    const outer = document.createElement('div')
    outer.setAttribute('data-subcategory-drop', 'grp')
    const card = document.createElement('div')
    card.setAttribute('data-app-id', 'app-3')
    outer.appendChild(card)
    expect(findDropTarget(card)).toEqual({ type: 'app', id: 'app-3' })
  })

  it('向上最多找 5 层，更远的祖先不再命中', () => {
    /* 造一条 depth+1 层的祖先链，把落点属性挂在**最外层**——
       从最内层往上算，最外层正好是第 depth 层。 */
    const make = (depth: number) => {
      let node: HTMLElement | null = null
      let innermost: HTMLElement | null = null
      for (let i = 0; i <= depth; i++) {
        const el = document.createElement('div')
        if (i === depth) el.setAttribute('data-app-id', 'far')
        if (node) el.appendChild(node)
        else innermost = el
        node = el
      }
      return innermost!
    }
    // 第 4 层仍在搜索范围内
    expect(findDropTarget(make(4))).toEqual({ type: 'app', id: 'far' })
    // 第 5 层不再命中，返回 null
    expect(findDropTarget(make(5))).toBeNull()
  })

  it('没有任何落点属性时返回 null', () => {
    const el = document.createElement('div')
    expect(findDropTarget(el)).toBeNull()
  })
})

describe('isPointerOutsideWindow', () => {
  it('窗口内部返回 false', () => {
    expect(isPointerOutsideWindow({ clientX: 10, clientY: 10 })).toBe(false)
    expect(isPointerOutsideWindow({ clientX: window.innerWidth - 1, clientY: window.innerHeight - 1 })).toBe(false)
  })

  it('四条边界外返回 true', () => {
    expect(isPointerOutsideWindow({ clientX: 0, clientY: 100 })).toBe(true)
    expect(isPointerOutsideWindow({ clientX: 100, clientY: 0 })).toBe(true)
    expect(isPointerOutsideWindow({ clientX: window.innerWidth, clientY: 100 })).toBe(true)
    expect(isPointerOutsideWindow({ clientX: 100, clientY: window.innerHeight })).toBe(true)
  })

  it('负坐标（拖到标题栏以外）也算离开', () => {
    expect(isPointerOutsideWindow({ clientX: -5, clientY: 50 })).toBe(true)
  })
})

describe('isPastCardMidpoint', () => {
  it('左半边判为插到目标之前', () => {
    const card = stubRect(document.createElement('div'), 100, 120)
    card.setAttribute('data-app-id', 'a')
    expect(isPastCardMidpoint(card, 120)).toBe(false)
  })

  it('右半边判为插到目标之后', () => {
    const card = stubRect(document.createElement('div'), 100, 120)
    card.setAttribute('data-app-id', 'a')
    expect(isPastCardMidpoint(card, 200)).toBe(true)
  })

  it('命中卡片内部元素时用所在卡片的中点判定', () => {
    const card = stubRect(document.createElement('div'), 100, 120)
    card.setAttribute('data-app-id', 'a')
    const icon = document.createElement('span')
    card.appendChild(icon)
    expect(isPastCardMidpoint(icon, 200)).toBe(true)
    expect(isPastCardMidpoint(icon, 110)).toBe(false)
  })

  it('不在任何卡片内时返回 false', () => {
    const el = document.createElement('div')
    expect(isPastCardMidpoint(el, 500)).toBe(false)
    expect(isPastCardMidpoint(null, 500)).toBe(false)
  })
})
