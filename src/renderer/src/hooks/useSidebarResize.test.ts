// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  SIDEBAR_DRAG_THRESHOLD,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  useSidebarResize
} from './useSidebarResize'

/** 伪造 React.PointerEvent：hook 只用到 button / clientX / clientY / preventDefault / stopPropagation */
function down(x: number, y: number, button = 0) {
  return {
    button,
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as React.PointerEvent
}

/* 原生事件名是 pointermove / pointerup，但 jsdom 没有 PointerEvent 构造器；
   MouseEvent 带 clientX / clientY，type 可以随便给，正好够用。 */
const move = (x: number, y: number) => new MouseEvent('pointermove', { clientX: x, clientY: y })
const up = () => new MouseEvent('pointerup')

function setup(initial = 240) {
  const onChange = vi.fn()
  const onCommit = vi.fn()
  const view = renderHook(() => useSidebarResize({ value: initial, onChange, onCommit }))
  return { ...view, onChange, onCommit }
}

const isResizing = () => document.body.classList.contains('sidebar-is-resizing')

beforeEach(() => {
  document.body.className = ''
})

afterEach(() => {
  /* 有用例会中途断言"放弃"分支，此时监听器已经自己摘掉了；
     这里再兜一次，避免残留的监听器污染下一个用例。 */
  act(() => { window.dispatchEvent(up()) })
  document.body.className = ''
})

describe('clampSidebarWidth', () => {
  it('夹在最小与最大之间', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(300)).toBe(300)
  })

  it('取整——避免亚像素宽度累积成抖动', () => {
    expect(clampSidebarWidth(240.6)).toBe(241)
    expect(clampSidebarWidth(240.4)).toBe(240)
  })
})

describe('useSidebarResize · 手柄入口（threshold 0）', () => {
  it('按下即生效，第一次移动就开始改宽度', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: 0 }))
    act(() => { window.dispatchEvent(move(160, 100)) })
    expect(onChange).toHaveBeenLastCalledWith(300)
  })

  it('按下时拦住默认行为——手柄是按钮，不需要那次 click', () => {
    const { result } = setup()
    const event = down(100, 100)
    act(() => result.current.begin(event, { threshold: 0 }))
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('拖拽期间给 body 挂上标记（CSS 靠它切光标与禁用选中）', () => {
    const { result } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: 0 }))
    expect(isResizing()).toBe(true)
    act(() => { window.dispatchEvent(up()) })
    expect(isResizing()).toBe(false)
  })
})

describe('useSidebarResize · 侧边栏整体入口（threshold > 0）', () => {
  it('位移不到阈值就什么都不做——这是"点一下切换分类"的空间', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    act(() => { window.dispatchEvent(move(102, 100)) })
    act(() => { window.dispatchEvent(move(103, 100)) })
    expect(onChange).not.toHaveBeenCalled()
    expect(isResizing()).toBe(false)
  })

  it('超过阈值后开始改宽度，且按按下那一刻的宽度算', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    act(() => { window.dispatchEvent(move(102, 100)) })
    act(() => { window.dispatchEvent(move(110, 100)) })
    expect(onChange).toHaveBeenLastCalledWith(250)
    expect(isResizing()).toBe(true)
  })

  it('纵向位移为主时放弃——那是拖滚动条或选文字，不是改宽度', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    /* dx=20 已超阈值，但 dy=200 明显更大 → 判定不是在改宽度 */
    act(() => { window.dispatchEvent(move(120, 300)) })
    expect(onChange).not.toHaveBeenCalled()
    expect(isResizing()).toBe(false)
  })

  it('判定放弃之后不再"复活"——后续横向移动不该又动起来', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    act(() => { window.dispatchEvent(move(120, 300)) })
    act(() => { window.dispatchEvent(move(240, 100)) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('按住不放但一直没超阈值，抬手时不该提交宽度', () => {
    const { result, onCommit } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    act(() => { window.dispatchEvent(move(102, 100)) })
    act(() => { window.dispatchEvent(up()) })
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('useSidebarResize · 落盘与边界', () => {
  it('抬手时提交的是最终宽度，不是最后一次 move 的原始值', () => {
    const { result, onChange, onCommit } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: 0 }))
    act(() => { window.dispatchEvent(move(160, 100)) })
    act(() => { window.dispatchEvent(move(200, 100)) })
    act(() => { window.dispatchEvent(up()) })
    expect(onChange).toHaveBeenLastCalledWith(340)
    expect(onCommit).toHaveBeenCalledWith(340)
  })

  it('拖过头会被夹到上限', () => {
    const { result, onChange, onCommit } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: 0 }))
    act(() => { window.dispatchEvent(move(9999, 100)) })
    act(() => { window.dispatchEvent(up()) })
    expect(onChange).toHaveBeenLastCalledWith(SIDEBAR_MAX_WIDTH)
    expect(onCommit).toHaveBeenCalledWith(SIDEBAR_MAX_WIDTH)
  })

  it('往左拖过头会被夹到下限', () => {
    const { result, onCommit } = setup()
    act(() => result.current.begin(down(300, 100), { threshold: 0 }))
    act(() => { window.dispatchEvent(move(-9999, 100)) })
    act(() => { window.dispatchEvent(up()) })
    expect(onCommit).toHaveBeenCalledWith(SIDEBAR_MIN_WIDTH)
  })

  it('非左键按下不启动拖拽', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin(down(100, 100, 2), { threshold: 0 }))
    act(() => { window.dispatchEvent(move(200, 100)) })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('useSidebarResize · 吞掉拖拽顺带产生的那次 click', () => {
  it('真拖过之后，紧接着的一次 click 应被吞，且只吞一次', () => {
    const { result } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    act(() => { window.dispatchEvent(move(140, 100)) })
    act(() => { window.dispatchEvent(up()) })
    expect(result.current.consumeSuppressedClick()).toBe(true)
    expect(result.current.consumeSuppressedClick()).toBe(false)
  })

  it('只是点了一下（没超阈值）不该吞 click——用户是真的想切换分类', () => {
    const { result } = setup()
    act(() => result.current.begin(down(100, 100), { threshold: SIDEBAR_DRAG_THRESHOLD }))
    act(() => { window.dispatchEvent(move(101, 100)) })
    act(() => { window.dispatchEvent(up()) })
    expect(result.current.consumeSuppressedClick()).toBe(false)
  })
})
