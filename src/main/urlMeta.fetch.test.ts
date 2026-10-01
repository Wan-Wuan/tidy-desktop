import http from 'http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchIconBytes, fetchPageMeta } from './urlMeta'

/**
 * 抓取链路的回归测试。
 *
 * 起一个本地 HTTP 服务当靶子，不依赖外网——外网站点会变，测试就会随机红。
 * 重点覆盖三类容易回归的行为：`</head>` 提前断开、重定向跟随、失败分类。
 */

let server: http.Server
let base = ''

/** 4MB 的填充体，用来证明"读到 `</head>` 就断开"确实生效 */
const HUGE_BODY = 'x'.repeat(4 * 1024 * 1024)

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.on('error', () => { /* 客户端提前断开是预期行为 */ })
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname

    switch (pathname) {
      case '/simple':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><head><title>简单页</title><link rel="icon" href="/i.png"></head><body>hi</body></html>')
        return

      case '/huge-body':
        // head 很小、body 巨大：正确实现应当在读完 head 后立刻断开
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><head><title>大页面</title></head><body>${HUGE_BODY}</body></html>`)
        return

      case '/no-head':
        // 始终没有 `</head>`，只能靠 1MB 兜底上限拦下来
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('y'.repeat(2 * 1024 * 1024))
        return

      case '/redirect':
        res.writeHead(302, { Location: '/simple' })
        res.end()
        return

      case '/redirect-loop':
        res.writeHead(302, { Location: '/redirect-loop' })
        res.end()
        return

      case '/redirect-external':
        // 重定向到非 http(s) 协议必须被拒
        res.writeHead(302, { Location: 'file:///C:/secret.html' })
        res.end()
        return

      case '/missing':
        res.writeHead(404, { 'Content-Type': 'text/html' })
        res.end('<html><head><title>找不到</title></head></html>')
        return

      case '/gbk': {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=gbk' })
        const head = Buffer.from('<html><head><title>', 'latin1')
        const chinese = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]) // '中文' 的 GBK 字节
        const tail = Buffer.from('</title></head></html>', 'latin1')
        res.end(Buffer.concat([head, chinese, tail]))
        return
      }

      case '/head-split':
        // 故意把 `</head>` 拆在两个 chunk 之间，验证跨块匹配
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.write('<html><head><title>跨块</title></he')
        res.write('ad><body>body</body></html>')
        res.end()
        return

      case '/icon':
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(Buffer.alloc(200, 0x42))
        return

      case '/icon-missing':
        res.writeHead(404)
        res.end()
        return

      default:
        res.writeHead(404)
        res.end()
    }
  })
  server.on('clientError', () => { /* 客户端提前断开是预期行为 */ })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('fetchPageMeta', () => {
  it('抓取标题与相对图标地址', async () => {
    const meta = await fetchPageMeta(`${base}/simple`)
    expect(meta.ok).toBe(true)
    expect(meta.title).toBe('简单页')
    expect(meta.iconUrl).toBe(`${base}/i.png`)
  })

  it('读到 </head> 就断开，不被巨大的 body 拖成 too-large', async () => {
    const meta = await fetchPageMeta(`${base}/huge-body`)
    expect(meta.ok).toBe(true)
    expect(meta.title).toBe('大页面')
  })

  it('页面始终没有 </head> 时由兜底上限拦下', async () => {
    const meta = await fetchPageMeta(`${base}/no-head`)
    expect(meta.ok).toBe(false)
    expect(meta.error).toBe('too-large')
  })

  it('跨 chunk 的 </head> 也能识别', async () => {
    const meta = await fetchPageMeta(`${base}/head-split`)
    expect(meta.ok).toBe(true)
    expect(meta.title).toBe('跨块')
  })

  it('跟随重定向', async () => {
    const meta = await fetchPageMeta(`${base}/redirect`)
    expect(meta.ok).toBe(true)
    expect(meta.title).toBe('简单页')
  })

  it('重定向死循环最终报 http-error 而不是挂住', async () => {
    const meta = await fetchPageMeta(`${base}/redirect-loop`)
    expect(meta.ok).toBe(false)
    expect(meta.error).toBe('http-error')
  })

  it('重定向到非 http(s) 协议被拒绝', async () => {
    const meta = await fetchPageMeta(`${base}/redirect-external`)
    expect(meta.ok).toBe(false)
    expect(meta.error).toBe('http-error')
  })

  it('404 报 http-error，不把错误页的标题当成结果', async () => {
    const meta = await fetchPageMeta(`${base}/missing`)
    expect(meta.ok).toBe(false)
    expect(meta.error).toBe('http-error')
    expect(meta.title).toBe('')
  })

  it('按声明的编码解码中文', async () => {
    const meta = await fetchPageMeta(`${base}/gbk`)
    expect(meta.ok).toBe(true)
    expect(meta.title).toBe('中文')
  })

  it('非法 URL 不发请求直接报 invalid-url', async () => {
    expect((await fetchPageMeta('not a url')).error).toBe('invalid-url')
    expect((await fetchPageMeta('ftp://example.com')).error).toBe('invalid-url')
    expect((await fetchPageMeta('')).error).toBe('invalid-url')
  })

  it('省略协议时自动补 https（此处端口服务是 http，故预期 network 而非 invalid-url）', async () => {
    const meta = await fetchPageMeta('127.0.0.1:1')
    expect(meta.error).not.toBe('invalid-url')
  })
})

describe('fetchIconBytes', () => {
  it('取回图标原始字节', async () => {
    const result = await fetchIconBytes(`${base}/icon`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.bytes.length).toBe(200)
      expect(result.contentType).toContain('image/png')
    }
  })

  it('图标 404 时报 no-icon', async () => {
    const result = await fetchIconBytes(`${base}/icon-missing`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-icon')
  })

  it('非 http(s) 地址直接报 no-icon，不发请求', async () => {
    const result = await fetchIconBytes('file:///C:/a.png')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-icon')
  })
})
