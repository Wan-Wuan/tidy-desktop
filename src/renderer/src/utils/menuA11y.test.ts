// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { handleMenuArrowNav } from './menuA11y'

/* 右键菜单的上下键导航。
   抽成测试的原因：「焦点还没进菜单」这个起点很容易写错——那时 ArrowDown 应落在
   第一项、ArrowUp 应落在最后一项，如果照搬取模公式就会绕到第二项去。 */
function buildMenu() {
  document.body.innerHTML = `
    <div id="menu" role="menu">
      <button role="menuitem">第一项</button>
      <button role="menuitem">第二项</button>
      <button role="menuitem">第三项</button>
    </div>`
  const menu = document.getElementById('menu') as HTMLElement
  const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
  return { menu, items }
}

function press(menu: HTMLElement, key: string): boolean {
  let prevented = false
  handleMenuArrowNav({ key, currentTarget: menu, preventDefault: () => { prevented = true } })
  return prevented
}

describe('handleMenuArrowNav', () => {
  let menu: HTMLElement
  let items: HTMLElement[]

  beforeEach(() => {
    ;({ menu, items } = buildMenu())
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  })

  it('焦点还没进菜单时，ArrowDown 落在第一项', () => {
    press(menu, 'ArrowDown')
    expect(document.activeElement).toBe(items[0])
  })

  it('焦点还没进菜单时，ArrowUp 落在最后一项（不能绕到第二项）', () => {
    press(menu, 'ArrowUp')
    expect(document.activeElement).toBe(items[2])
  })

  it('从第一项按 ArrowUp 循环到最后一项', () => {
    items[0].focus()
    press(menu, 'ArrowUp')
    expect(document.activeElement).toBe(items[2])
  })

  it('从最后一项按 ArrowDown 循环到第一项', () => {
    items[2].focus()
    press(menu, 'ArrowDown')
    expect(document.activeElement).toBe(items[0])
  })

  it('中间项按方向键逐项移动', () => {
    items[0].focus()
    press(menu, 'ArrowDown')
    expect(document.activeElement).toBe(items[1])
  })

  it('非方向键不拦截事件', () => {
    expect(press(menu, 'Enter')).toBe(false)
    expect(press(menu, 'Escape')).toBe(false)
  })

  it('容器里没有菜单项时安全返回', () => {
    document.body.innerHTML = '<div id="empty" role="menu"></div>'
    const empty = document.getElementById('empty') as HTMLElement
    expect(press(empty, 'ArrowDown')).toBe(false)
  })
})
