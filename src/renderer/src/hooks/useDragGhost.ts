import { useCallback, useEffect, useRef } from 'react'
import type { AppItem, UISettings } from '../../../shared/types'
import { hasDisplayableIcon } from '../utils/iconUtils'

/**
 * 拖拽预览：跟随鼠标的"整块卡片"，HTML5 拖拽与右键拖拽共用。
 *
 * 早先版本只画一个图标+名称的小胶囊，拖起来看不出自己抓的是哪一块。
 * 这里改成按 AppCard 的实际外观重建一张卡片——尺寸优先取被拖卡片的实测
 * rect，配色从当前主题的 CSS 变量读，因此深色/浅色/玻璃主题下都跟原卡片一致。
 */

/** 抬起时的轻微倾斜与放大，让"抓在手里"更有实感 */
const GHOST_TILT = -2
const GHOST_SCALE = 1.02
const GHOST_ENTER_SCALE = 0.86

const SIZE_PRESET = {
  small: { pad: 8, icon: 40, iconInner: 32, font: 12, w: 96, h: 96 },
  medium: { pad: 16, icon: 48, iconInner: 40, font: 14, w: 112, h: 120 },
  large: { pad: 20, icon: 56, iconInner: 48, font: 16, w: 132, h: 144 },
} as const

const SHELL_FALLBACK: Record<string, string> = {
  '--card-bg': 'rgba(253, 252, 249, 0.58)',
  '--card-border': 'rgba(255, 255, 255, 0.75)',
  '--slate-700': '51 65 85',
}

/** 幽灵挂在 body 上，拿不到挂在 .app-shell 上的主题变量，只能读出来内联 */
function readThemeVar(name: string): string {
  const shell = document.querySelector('.app-shell')
  const source = shell || document.body
  const value = getComputedStyle(source).getPropertyValue(name).trim()
  return value || SHELL_FALLBACK[name] || ''
}

/** slate 系列存的是 "51 65 85" 三元组，用之前要包成 rgb() */
function toColor(triplet: string): string {
  return /^\d+\s+\d+\s+\d+$/.test(triplet) ? `rgb(${triplet})` : triplet
}

/**
 * 把一个半透明颜色叠成接近不透明的背景。
 *
 * 幽灵在拖拽期间每帧都在移动，一旦它带 backdrop-filter，浏览器就要每帧重新渲染
 * "它背后那块画面"再做一次模糊——而它背后正好是上百张同样带 backdrop-filter 的卡片，
 * 于是每帧都要把该区域连同卡片自身的模糊一起重算。这是拖拽掉帧最重的一处。
 *
 * 拿掉 backdrop-filter 后改成叠四层同色：alpha 由 0.58 抬到约 0.97，
 * 观感与原来的毛玻璃几乎一致，但不再需要读背景。
 */
function stackedSurface(color: string): string {
  const coat = `linear-gradient(${color}, ${color})`
  return [coat, coat, coat, color].join(', ')
}

function iconGradient(type: AppItem['type']): string {
  if (type === 'folder') return 'linear-gradient(to bottom right, #FFF7ED, #FFEDD5)'
  if (type === 'steam') return 'linear-gradient(to bottom right, #F5F3FF, #EDE9FE)'
  return 'linear-gradient(to bottom right, #EEF2FF, #E0E7FF)'
}

export function useDragGhost(
  appsRef: React.MutableRefObject<AppItem[]>,
  ui?: UISettings
) {
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const dragGhostRafRef = useRef(0)
  const dragGhostPosRef = useRef({ x: 0, y: 0 })
  const ghostSizeRef = useRef({ w: 0, h: 0 })
  const uiRef = useRef(ui)
  uiRef.current = ui

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

    const settings = uiRef.current
    const size = SIZE_PRESET[settings?.cardSize ?? 'medium'] ?? SIZE_PRESET.medium
    const br = settings?.borderRadius ?? 8
    const showIcon = settings?.showIcon !== false
    const showName = settings?.showName !== false

    // 优先用被拖卡片的实测尺寸，保证幽灵和网格里那一块一模一样；
    // 拿不到（例如卡片已被过滤出可视区）才退回预设值。
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(appId) : appId
    const rect = document
      .querySelector<HTMLElement>(`[data-app-id="${escaped}"]`)
      ?.getBoundingClientRect()
    const w = Math.round(rect?.width || size.w)
    const h = Math.round(rect?.height || size.h)
    ghostSizeRef.current = { w, h }

    const transformAt = (px: number, py: number, scale: number) =>
      `translate(${px - w / 2}px, ${py - h / 2}px) rotate(${GHOST_TILT}deg) scale(${scale})`

    const div = document.createElement('div')
    div.style.cssText =
      'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;box-sizing:border-box;' +
      `width:${w}px;height:${h}px;padding:${size.pad}px;border-radius:${br}px;` +
      /* 不能用 backdrop-filter，原因见 stackedSurface 的注释 */
      `background:${stackedSurface(readThemeVar('--card-bg'))};` +
      `border:1px solid ${readThemeVar('--card-border')};` +
      'display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;' +
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;" +
      'box-shadow:0 18px 40px rgba(15,23,42,0.22),0 6px 14px rgba(15,23,42,0.12),' +
      'inset 0 1px 0 rgba(255,255,255,0.85);' +
      'will-change:transform;opacity:0;' +
      'transition:transform 120ms cubic-bezier(0.34,1.56,0.64,1),opacity 150ms ease-out;' +
      `transform:${transformAt(x, y, GHOST_ENTER_SCALE)};`

    if (showIcon) {
      const box = document.createElement('div')
      box.style.cssText =
        `width:${size.icon}px;height:${size.icon}px;flex-shrink:0;` +
        `border-radius:${Math.min(br, 12)}px;${`background:${iconGradient(app.type)}`};` +
        'display:flex;align-items:center;justify-content:center;'
      if (hasDisplayableIcon(app.icon)) {
        const img = document.createElement('img')
        img.src = app.icon
        img.style.cssText = `width:${size.iconInner}px;height:${size.iconInner}px;`
        box.appendChild(img)
      }
      div.appendChild(box)
    }

    if (showName) {
      const label = document.createElement('p')
      label.style.cssText =
        `font-size:${size.font}px;font-weight:500;text-align:center;line-height:1.4;` +
        `color:${toColor(readThemeVar('--slate-700'))};` +
        'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;'
      label.textContent = app.name
      div.appendChild(label)
    }

    document.body.appendChild(div)
    dragGhostRef.current = div
    dragGhostPosRef.current = { x, y }

    /* 入场：淡入 + 弹性放大到抬起状态。
       ⚠️ 入场跑完必须把 transform 的 transition 撤掉，这是拖拽流畅度的关键。
       这个过渡原本是为"入场一次性放大"写的，但它会一直留在元素上——于是 moveDragGhost
       每帧写入的新 transform 都被浏览器当成一次「新的过渡目标」，幽灵只会以 120ms 的
       弹性曲线去追一个还在移动的目标：表现为跟不上手、发飘，快速拖拽时越拖越落后。
       撤掉之后每帧的 transform 直接生效，幽灵与光标 1:1 对齐。
       opacity 的过渡留着无害（入场后再也不会改它）。 */
    let entryTransitionSettled = false
    const settleEntryTransition = () => {
      if (entryTransitionSettled) return
      entryTransitionSettled = true
      // 幽灵可能已经被替换/移除，别去改一个已经下线的元素
      if (dragGhostRef.current !== div) return
      div.style.transition = 'opacity 150ms ease-out'
    }
    div.addEventListener('transitionend', (ev) => {
      // 只认幽灵自身的 transform 收尾，忽略子元素的过渡事件
      if (ev.target === div && ev.propertyName === 'transform') settleEntryTransition()
    })
    // 兜底：位移为零或元素不可见时 transitionend 不会派发
    window.setTimeout(settleEntryTransition, 260)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (div.parentNode) {
          div.style.opacity = '1'
          div.style.transform = transformAt(x, y, GHOST_SCALE)
        }
      })
    })
  }, [appsRef, removeDragGhost])

  const moveDragGhost = useCallback((x: number, y: number) => {
    if (!dragGhostRef.current) return
    dragGhostPosRef.current = { x, y }
    if (!dragGhostRafRef.current) {
      dragGhostRafRef.current = requestAnimationFrame(() => {
        dragGhostRafRef.current = 0
        const el = dragGhostRef.current
        if (!el) return
        const { w, h } = ghostSizeRef.current
        const { x: px, y: py } = dragGhostPosRef.current
        el.style.transform =
          `translate(${px - w / 2}px, ${py - h / 2}px) rotate(${GHOST_TILT}deg) scale(${GHOST_SCALE})`
      })
    }
  }, [])

  useEffect(() => {
    return () => removeDragGhost()
  }, [removeDragGhost])

  return { createDragGhost, moveDragGhost, removeDragGhost }
}
