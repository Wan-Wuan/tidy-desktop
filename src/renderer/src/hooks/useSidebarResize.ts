import { useCallback, useEffect, useRef } from 'react'

export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 420
export const SIDEBAR_DEFAULT_WIDTH = 240

/**
 * 「在侧边栏任意位置拖拽」这一档的生效阈值（px）。
 *
 * 太小会与"点一下切换分类"打架——手一抖就变成改宽度；
 * 太大又显得拖不动。5px 是鼠标抖动的常见上限，也远小于人眼能感知的"我在拖"。
 */
export const SIDEBAR_DRAG_THRESHOLD = 5

export function clampSidebarWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))
}

/**
 * 侧边栏宽度拖拽。
 *
 * **两个入口共用同一套实现**，避免两处的阈值、光标、落盘时机各写一遍：
 *   · 右边缘那条 14px 的手柄 —— `threshold: 0`，按下即生效。位置本身就是意图，
 *     在这里再要求"先移动几个像素"只会让人觉得拖不动；
 *   · **侧边栏任意位置** —— `threshold > 0`，要横向移动超过阈值才生效。
 *     因为侧边栏里"按下"的默认语义是"点一下切换分类"，必须靠位移把它区分开。
 *
 * 阈值那一档有三条硬规则：
 *   1. **不能 preventDefault**（那样 click 就不派发了），所以点击照常发生；
 *      真进了拖拽才在 `finish` 里把随后那次 click 吞掉（见 `consumeSuppressedClick`）。
 *   2. **横向位移必须大于纵向位移**。纵向位移更大时说明用户不是在改宽度——
 *      可能是拖分类栏的滚动条、选文字，或干脆是想上下滑动。此时直接放弃本次检测。
 *   3. 一旦判定放弃就**彻底退出**，不再因为后续横向移动又"复活"——
 *      那种忽停忽动的表现比不响应更让人困惑。
 */
export function useSidebarResize({ value, onChange, onCommit }: {
  value: number
  onChange: (width: number) => void
  onCommit: (width: number) => void
}) {
  const cleanupRef = useRef<(() => void) | null>(null)
  const currentWidthRef = useRef(value)
  currentWidthRef.current = value

  /* 回调走 ref：`onCommit` 在调用方通常是每次渲染新建的箭头函数，
     直接进 useCallback 依赖会让 begin 每帧都换引用，
     挂在 DOM 上的 handler 跟着换——没必要。 */
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  /* 拖拽结束时浏览器仍可能补发一次 click（pointerdown 与 pointerup 落在同一元素上时）。
     侧边栏里 click 的语义是"切换分类"，不吞掉就会出现"拖完宽度顺带换了分类"。 */
  const suppressClickRef = useRef(false)

  useEffect(() => () => cleanupRef.current?.(), [])

  const begin = useCallback((event: React.PointerEvent, options: { threshold?: number } = {}) => {
    if (event.button !== 0) return
    const threshold = options.threshold ?? 0

    cleanupRef.current?.()

    const startX = event.clientX
    const startY = event.clientY
    const startWidth = currentWidthRef.current
    let active = threshold <= 0

    if (active) {
      /* 只有"立即生效"这一档才拦默认行为：它不需要 click，拦掉反而能避免选中文字。 */
      event.preventDefault()
      event.stopPropagation()
      document.body.classList.add('sidebar-is-resizing')
    }

    function finish() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (active) {
        document.body.classList.remove('sidebar-is-resizing')
        onCommitRef.current(currentWidthRef.current)
        suppressClickRef.current = true
        /* click 在 pointerup 之后同步派发，setTimeout 一定排在它后面；
           若这次 pointerup 压根不产生 click（指针已拖离原元素），
           标记也会在这一拍被清掉，不会误吞后面的点击。 */
        window.setTimeout(() => { suppressClickRef.current = false }, 0)
      }
      cleanupRef.current = null
    }

    function handleMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!active) {
        if (Math.abs(dx) < threshold) return
        /* 纵向为主 → 不是改宽度。放弃，且不再复活。 */
        if (Math.abs(dy) > Math.abs(dx)) { finish(); return }
        active = true
        document.body.classList.add('sidebar-is-resizing')
      }
      /* ⚠️ 必须自己记下最新宽度：`finish` 提交的是这个 ref，而调用方的 onChange
         只是把草稿写进 state（真实渲染里会回流成新的 `value`，但**这一帧之内不会**）。
         漏掉这一行，抬手时提交的就是按下那一刻的旧宽度——宽度当场弹回去。 */
      const nextWidth = clampSidebarWidth(startWidth + dx)
      currentWidthRef.current = nextWidth
      onChangeRef.current(nextWidth)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
    cleanupRef.current = finish
  }, [])

  /** 由外层的 click 捕获阶段调用：返回 true 表示这次 click 是拖拽的副产品，应当吞掉 */
  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }, [])

  return { begin, consumeSuppressedClick }
}
