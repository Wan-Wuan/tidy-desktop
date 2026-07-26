import React, { useEffect, useRef } from 'react'
import { DotsSixVertical } from '@phosphor-icons/react'

const MIN_WIDTH = 180
const MAX_WIDTH = 420
const DEFAULT_WIDTH = 240

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
}

export const SidebarResizeHandle = React.memo(function SidebarResizeHandle({
  value,
  onChange,
  onCommit
}: {
  value: number
  onChange: (width: number) => void
  onCommit: (width: number) => void
}) {
  const cleanupRef = useRef<(() => void) | null>(null)
  const currentWidthRef = useRef(value)
  currentWidthRef.current = value

  useEffect(() => () => cleanupRef.current?.(), [])

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    cleanupRef.current?.()
    const startX = event.clientX
    const startWidth = value
    currentWidthRef.current = value
    document.body.classList.add('sidebar-is-resizing')

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX)
      currentWidthRef.current = nextWidth
      onChange(nextWidth)
    }
    const finish = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.classList.remove('sidebar-is-resizing')
      onCommit(currentWidthRef.current)
      cleanupRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
    cleanupRef.current = finish
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') nextWidth = value - (event.shiftKey ? 24 : 8)
    if (event.key === 'ArrowRight') nextWidth = value + (event.shiftKey ? 24 : 8)
    if (event.key === 'Home') nextWidth = MIN_WIDTH
    if (event.key === 'End') nextWidth = MAX_WIDTH
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
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={value}
      title="拖动调整分类栏宽度；双击恢复默认宽度"
      onPointerDown={startResize}
      onDoubleClick={() => {
        onChange(DEFAULT_WIDTH)
        onCommit(DEFAULT_WIDTH)
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
