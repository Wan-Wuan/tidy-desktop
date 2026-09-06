import { useCallback, useEffect, useRef } from 'react'
import type { AppItem } from '../../../shared/types'
import { hasDisplayableIcon } from '../utils/iconUtils'

/**
 * 拖拽幽灵卡片：跟随鼠标的胶囊标签，HTML5 拖拽与右键拖拽共用。
 * 从 App.tsx 原样搬运，仅将操作收敛到 hook 内。
 */
export function useDragGhost(appsRef: React.MutableRefObject<AppItem[]>) {
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const dragGhostRafRef = useRef(0)
  const dragGhostPosRef = useRef({ x: 0, y: 0 })

  const removeDragGhost = useCallback(() => {
    if (dragGhostRafRef.current) {
      cancelAnimationFrame(dragGhostRafRef.current)
      dragGhostRafRef.current = 0
    }
    if (dragGhostRef.current) {
      dragGhostRef.current.remove()
      dragGhostRef.current = null
    }
  }, [])

  const createDragGhost = useCallback((appId: string, x: number, y: number) => {
    removeDragGhost()
    const app = appsRef.current.find(a => a.id === appId)
    if (!app) return
    const div = document.createElement('div')
    // 小型标签：圆角胶囊，跟随鼠标右下方
    div.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:10px;background:rgba(79,70,229,0.92);backdrop-filter:blur(8px);color:white;font-family:Inter,sans-serif;font-size:12px;font-weight:500;white-space:nowrap;box-shadow:0 8px 24px rgba(79,70,229,0.35),0 2px 6px rgba(0,0,0,0.1);will-change:transform;transition:transform 120ms cubic-bezier(0.34,1.56,0.64,1),opacity 150ms ease-out;opacity:0;transform:translate(' + (x + 14) + 'px,' + (y + 18) + 'px) scale(0.5);'
    // 入场：淡入 + 弹性放大
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (div.parentNode) {
          div.style.opacity = '1'
          div.style.transform = `translate(${x + 14}px, ${y + 18}px) scale(1)`
        }
      })
    })
    // 小图标
    if (hasDisplayableIcon(app.icon)) {
      const img = document.createElement('img')
      img.src = app.icon
      img.style.cssText = 'width:18px;height:18px;border-radius:4px;'
      div.appendChild(img)
    }
    const span = document.createElement('span')
    span.textContent = app.name
    div.appendChild(span)
    document.body.appendChild(div)
    dragGhostRef.current = div
    dragGhostPosRef.current = { x: x - 60, y: y - 20 }
  }, [appsRef, removeDragGhost])

  const moveDragGhost = useCallback((x: number, y: number) => {
    if (!dragGhostRef.current) return
    dragGhostPosRef.current = { x: x + 14, y: y + 18 }
    if (!dragGhostRafRef.current) {
      dragGhostRafRef.current = requestAnimationFrame(() => {
        dragGhostRafRef.current = 0
        if (dragGhostRef.current) {
          dragGhostRef.current.style.transform = `translate(${dragGhostPosRef.current.x}px, ${dragGhostPosRef.current.y}px) scale(1)`
        }
      })
    }
  }, [])

  useEffect(() => {
    return () => removeDragGhost()
  }, [removeDragGhost])

  return { createDragGhost, moveDragGhost, removeDragGhost }
}
