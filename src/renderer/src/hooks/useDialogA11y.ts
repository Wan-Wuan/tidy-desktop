import { useEffect, useRef } from 'react'

/**
 * 对话框可访问性的统一实现。
 *
 * 背景：项目里的弹窗此前只有视觉效果、没有语义——没有 `role="dialog"` / `aria-modal`，
 * 焦点不会移入，也不处理 Escape。而 `App.tsx` 的全局 Escape 处理器在弹窗打开时会
 * 直接 `return`（那一步是对的，否则按 Esc 会连主窗口一起隐藏），结果就是**弹窗按 Esc 关不掉**。
 *
 * 这里集中处理四件事：
 *   1. 提供 `role="dialog"` / `aria-modal` / `aria-labelledby`
 *   2. 挂载时把焦点移入对话框，卸载时归还给触发它的元素
 *   3. Escape 关闭
 *   4. Tab / Shift+Tab 在对话框内循环，不会跑到背后的界面上
 *
 * 用法：
 *   const { ref, dialogProps } = useDialogA11y<HTMLDivElement>({ onClose, labelledBy: 'xxx-title' })
 *   <div ref={ref} {...dialogProps} className="...">
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/* 记录最后一次输入来自键盘还是指针，与 Chromium 判定 :focus-visible 的启发式一致。
   弹窗打开时的自动聚焦是程序化 focus：鼠标点开的场景浏览器不会画焦点环，
   键盘操作的场景会画。我们只在前者打标记压制焦点环——键盘用户保留环是正确反馈。 */
let lastInputWasKeyboard = false
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => { lastInputWasKeyboard = true }, true)
  document.addEventListener('pointerdown', () => { lastInputWasKeyboard = false }, true)
}

/** 给元素打上"这次程序化聚焦不画焦点环"的标记，元素失去焦点时自动撤销 */
function suppressFocusRingOnce(el: HTMLElement) {
  if (el.hasAttribute('data-focus-restored')) return
  el.setAttribute('data-focus-restored', 'true')
  const clear = () => {
    el.removeAttribute('data-focus-restored')
    el.removeEventListener('blur', clear)
  }
  /* ⚠️ 只监听 blur。早期版本还挂了 document 级的 mousedown/keydown：
     只要用户再按任意键（比如再按一次 Esc 隐藏主窗口、或任何快捷键），
     标记就被撤掉，而元素此刻仍持有焦点——焦点环恰好在这一刻冒出来，
     且之后一直挂着，表现为"按 Esc 后残留黄框"。blur 只在焦点真正离开时触发，
     元素持有焦点期间标记始终有效。 */
  el.addEventListener('blur', clear)
}

export interface DialogA11yOptions {
  onClose: () => void
  /** 标题元素的 id，用于 aria-labelledby */
  labelledBy?: string
}

export function useDialogA11y<T extends HTMLElement>({ onClose, labelledBy }: DialogA11yOptions) {
  const ref = useRef<T | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  // 用 ref 存 onClose，避免调用方每次渲染传新函数时反复解绑/重绑键盘监听
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const container = ref.current
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    if (container) {
      // 容器本身不可聚焦时补一个 tabindex，保证"没有可聚焦子元素"的弹窗也能接住键盘
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      const initial = first ?? container
      initial.focus({ preventScroll: true })
      /* 鼠标点开的弹窗，自动聚焦的元素（往往是右上角的关闭 X）不该出现焦点环；
         键盘打开时不打标记，键盘用户的焦点环照常显示。 */
      if (!lastInputWasKeyboard) suppressFocusRingOnce(initial)
    }

    return () => {
      const target = previouslyFocusedRef.current
      if (!target || !target.isConnected) return
      // 归还焦点，否则关闭弹窗后焦点会掉到 body 上，键盘用户要重新 Tab 一圈
      target.focus({ preventScroll: true })
      /* 但归还的焦点不该留下焦点环。
         Escape 是键盘操作，浏览器会把这次**程序化**聚焦判定为 focus-visible，
         于是刚刚点过的那个元素上会挂着一圈高亮不放。
         打标记让 CSS 跳过这一次的环；元素失去焦点（用户点了别处 / Tab 走了）时自动撤销，
         键盘用户之后 Tab 回来时焦点环照常出现。 */
      suppressFocusRingOnce(target)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 阻止冒泡：App.tsx 的全局处理器在弹窗打开时虽然会 return，
        // 但显式拦住更稳妥，避免以后那里改动后按 Esc 连主窗口一起隐藏
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const container = ref.current
      if (!container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null)
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // 挂在 document 而不是容器上：刚打开时焦点还没进容器，
    // 挂在容器上会漏掉最初的几次按键（项目里原有的弹窗就有这个问题）
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  return {
    ref,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      ...(labelledBy ? { 'aria-labelledby': labelledBy } : {})
    }
  }
}
