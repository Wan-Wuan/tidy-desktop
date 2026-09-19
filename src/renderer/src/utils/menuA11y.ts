/**
 * 右键菜单的键盘导航：上下方向键在菜单项之间循环移动焦点。
 *
 * 为什么抽成共用函数：应用菜单与分类菜单是两套独立实现，但键盘行为必须一致；
 * 而「焦点还没进菜单」这个起点最容易写错——此时 ArrowDown 应该落在第一项、
 * ArrowUp 落在最后一项，而不是从头绕一圈。
 *
 * 用法：把本函数挂到 role="menu" 容器（或它的父层）的 onKeyDown 上，
 * 容器内所有可选项都要带 role="menuitem"。
 */
export function handleMenuArrowNav(event: {
  key: string
  currentTarget: EventTarget | null
  preventDefault: () => void
}): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

  const container = event.currentTarget as HTMLElement | null
  if (!container || typeof container.querySelectorAll !== 'function') return

  const items = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .filter(item => !item.hasAttribute('disabled'))
  if (items.length === 0) return

  event.preventDefault()
  const current = items.indexOf(document.activeElement as HTMLElement)
  const delta = event.key === 'ArrowDown' ? 1 : -1
  const next = current === -1
    ? (delta === 1 ? 0 : items.length - 1)
    : (current + delta + items.length) % items.length

  items[next]?.focus()
}
