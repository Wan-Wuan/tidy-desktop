import React from 'react'
import { DotsSixVertical } from '@phosphor-icons/react'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth
} from '../hooks/useSidebarResize'

/**
 * 侧边栏右边缘的手柄。
 *
 * ⚠️ **它不是唯一的拖拽入口**——整个侧边栏都能拖拽改宽（`App.tsx` 的
 * `handleShellPointerDown` 做几何判定后调同一个 `begin`）。
 * 这个手柄保留三个不可替代的作用：
 *   · 位置即意图，按下立刻生效，不需要先移动几个像素；
 *   · 键盘可达（方向键 / Home / End），侧边栏整体拖拽做不到这一点；
 *   · 可见性——它是"这里能调宽度"的唯一视觉提示。
 */
export const SidebarResizeHandle = React.memo(function SidebarResizeHandle({
  value,
  onChange,
  onCommit,
  begin
}: {
  value: number
  onChange: (width: number) => void
  onCommit: (width: number) => void
  begin: (event: React.PointerEvent, options?: { threshold?: number }) => void
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') nextWidth = value - (event.shiftKey ? 24 : 8)
    if (event.key === 'ArrowRight') nextWidth = value + (event.shiftKey ? 24 : 8)
    if (event.key === 'Home') nextWidth = SIDEBAR_MIN_WIDTH
    if (event.key === 'End') nextWidth = SIDEBAR_MAX_WIDTH
    if (nextWidth === null) return
    event.preventDefault()
    const clamped = clampSidebarWidth(nextWidth)
    onChange(clamped)
    onCommit(clamped)
  }

  return (
    <button
      type="button"
      className="sidebar-resize-handle focus-ring"
      role="separator"
      aria-label="调整分类栏宽度"
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={value}
      title="拖动调整分类栏宽度；双击恢复默认宽度"
      onPointerDown={event => begin(event, { threshold: 0 })}
      onDoubleClick={() => {
        onChange(SIDEBAR_DEFAULT_WIDTH)
        onCommit(SIDEBAR_DEFAULT_WIDTH)
      }}
      onKeyDown={handleKeyDown}
    >
      <span className="sidebar-resize-handle__rail" />
      <span className="sidebar-resize-handle__grip">
        <DotsSixVertical size={15} weight="bold" aria-hidden="true" />
      </span>
    </button>
  )
})
