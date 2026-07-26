import React, { useEffect, useRef } from 'react'
import { ArrowsOutSimple } from '@phosphor-icons/react'

type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const edges: ResizeEdge[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']

export const WindowResizeHandles = React.memo(function WindowResizeHandles() {
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const beginResize = (edge: ResizeEdge) => async (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    const started = await window.electronAPI.beginMainWindowResize(edge, event.screenX, event.screenY)
    if (!started) return

    cleanupRef.current?.()
    document.body.classList.add('window-is-resizing')

    const handleMove = (moveEvent: PointerEvent) => {
      window.electronAPI.updateMainWindowResize(moveEvent.screenX, moveEvent.screenY)
    }
    const finish = () => {
      window.electronAPI.endMainWindowResize()
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.classList.remove('window-is-resizing')
      cleanupRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
    cleanupRef.current = finish
  }

  return (
    <div className="window-resize-layer" aria-hidden="true">
      {edges.map(edge => (
        <div
          key={edge}
          className={`window-resize-handle window-resize-handle--${edge}`}
          onPointerDown={beginResize(edge)}
        >
          {edge === 'se' && (
            <ArrowsOutSimple className="window-resize-grip" size={15} weight="bold" />
          )}
        </div>
      ))}
    </div>
  )
})
