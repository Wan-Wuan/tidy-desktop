/**
 * 远程字体（Google Fonts）的延迟加载。
 *
 * ## 为什么不用 CSS `@import`
 *
 * 这两套字体（Plus Jakarta Sans / Inter）原先是通过 `index.css` / `search.css`
 * 顶部的 `@import url(...)` 引入的。`@import` 是**渲染阻塞资源**：浏览器必须先把这个
 * 跨域样式表请求回来，才会绘制第一帧（Vite 打包后这行会原样出现在 `main-*.css` 第一行，
 * 位置在 `@tailwind base` 之前，优先级最高）。
 *
 * 而 `fonts.googleapis.com` 在中国大陆基本不可达，请求会一直挂到超时——于是
 * 「按热键 → 窗口出现」被一段注定失败的跨境网络请求拖住，用户看到的就是白屏/卡顿。
 *
 * ## 改法
 *
 * 从 CSS 里摘掉 `@import`，改成**首帧绘制完成之后**再动态插入 `<link rel=stylesheet>`。
 * 字体晚到只是先回退到系统字体、随后自动替换（`display=swap` 本来就是干这个的），
 * 首帧不再依赖任何网络请求。
 *
 * 注意：动态插入的 `<link rel=stylesheet>` **同样会让浏览器挂起渲染**，所以不能
 * 「马上插」——必须等当前这一帧真的画完（双 rAF）再插，否则等于把 `@import`
 * 的阻塞原样搬过来。
 */

export const REMOTE_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap'

const LINK_ATTR = 'data-remote-fonts'

let injected = false

function inject(): void {
  if (injected) return
  injected = true
  // 已经有人挂过同样的链接（比如 HTML 里手工加了）就别重复挂
  if (document.querySelector(`link[${LINK_ATTR}]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = REMOTE_FONT_HREF
  // 打标便于排查，也便于上面的去重判断
  link.setAttribute(LINK_ATTR, 'true')
  document.head.appendChild(link)
}

/**
 * 首帧之后再接入远程字体。幂等：重复调用只会插一次。
 *
 * 两个渲染入口（主窗口 `main.tsx` / 搜索窗 `search-main.tsx`）各调一次即可。
 */
export function loadRemoteFontsAfterFirstPaint(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const schedule = (): void => {
    // 双 rAF：第一次 rAF 的回调在「即将绘制」时执行，再排一次才能确定上一帧已上屏。
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window.requestIdleCallback === 'function') {
          // 给个 timeout，避免主线程一直忙导致字体永远不加载
          window.requestIdleCallback(inject, { timeout: 2000 })
        } else {
          setTimeout(inject, 0)
        }
      })
    })
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    schedule()
  } else {
    window.addEventListener('DOMContentLoaded', schedule, { once: true })
  }
}
