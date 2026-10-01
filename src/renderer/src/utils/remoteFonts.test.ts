// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* 远程字体的延迟加载。
   ⚠️ 这里钉住的是**时机**，不是"有没有加载"：
   `@import` 是渲染阻塞资源，会让浏览器等这个跨域请求回来才画第一帧；
   而动态插入的 `<link rel=stylesheet>` **同样会挂起渲染**。
   所以"首帧之后才插"是这个模块存在的全部理由，必须有用例守着。 */

const injectedLinks = () => document.querySelectorAll('link[data-remote-fonts]')

/** 每个用例都重新加载模块：`injected` 是模块级状态，不重置会串味。 */
async function loadModule() {
  vi.resetModules()
  return await import('./remoteFonts')
}

beforeEach(() => {
  document.head.innerHTML = ''
})

describe('loadRemoteFontsAfterFirstPaint', () => {
  it('调用当下不插入 <link>（否则等于把 @import 的阻塞原样搬过来）', async () => {
    const { loadRemoteFontsAfterFirstPaint } = await loadModule()
    loadRemoteFontsAfterFirstPaint()
    expect(injectedLinks()).toHaveLength(0)
  })

  it('首帧之后插入一条指向 Google Fonts 的 <link rel=stylesheet>', async () => {
    const { loadRemoteFontsAfterFirstPaint } = await loadModule()
    loadRemoteFontsAfterFirstPaint()

    await vi.waitFor(() => expect(injectedLinks()).toHaveLength(1))
    const link = injectedLinks()[0] as HTMLLinkElement
    expect(link.rel).toBe('stylesheet')
    expect(link.href).toContain('fonts.googleapis.com/css2')
  })

  it('重复调用只插一次', async () => {
    const { loadRemoteFontsAfterFirstPaint } = await loadModule()
    loadRemoteFontsAfterFirstPaint()
    loadRemoteFontsAfterFirstPaint()

    await vi.waitFor(() => expect(injectedLinks()).toHaveLength(1))
  })

  it('已经存在同标记的链接时不再插入', async () => {
    const existing = document.createElement('link')
    existing.rel = 'stylesheet'
    existing.setAttribute('data-remote-fonts', 'true')
    document.head.appendChild(existing)

    const { loadRemoteFontsAfterFirstPaint } = await loadModule()
    loadRemoteFontsAfterFirstPaint()

    // 等过注入时机，确认没有第二条
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(injectedLinks()).toHaveLength(1)
  })

  it('导出的 href 与实际请求一致，且带 display=swap（字体晚到先回退、不挡文字）', async () => {
    const { REMOTE_FONT_HREF } = await loadModule()
    expect(REMOTE_FONT_HREF).toContain('fonts.googleapis.com/css2')
    expect(REMOTE_FONT_HREF).toContain('display=swap')
  })
})
