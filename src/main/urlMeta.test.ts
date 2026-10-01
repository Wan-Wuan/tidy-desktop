import { describe, expect, it } from 'vitest'
import { decodeBody, decodeHtmlEntities, detectCharset, parsePageMeta, parseTagAttributes } from './urlMeta'

describe('decodeHtmlEntities', () => {
  it('解码常见命名实体', () => {
    expect(decodeHtmlEntities('A &amp; B')).toBe('A & B')
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>')
    expect(decodeHtmlEntities('&quot;x&quot; &apos;y&apos;')).toBe('"x" \'y\'')
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b')
  })

  it('解码十进制与十六进制实体', () => {
    expect(decodeHtmlEntities('&#39;')).toBe("'")
    expect(decodeHtmlEntities('&#x27;')).toBe("'")
    expect(decodeHtmlEntities('&#20013;&#x6587;')).toBe('中文')
  })

  it('大小写不敏感', () => {
    expect(decodeHtmlEntities('&AMP;')).toBe('&')
    expect(decodeHtmlEntities('&#X27;')).toBe("'")
  })

  it('认不出的实体原样保留', () => {
    expect(decodeHtmlEntities('&notarealentity;')).toBe('&notarealentity;')
    expect(decodeHtmlEntities('100% & 200%')).toBe('100% & 200%')
    expect(decodeHtmlEntities('&amp')).toBe('&amp')
  })

  it('非法码点不产生异常也不产出乱码', () => {
    expect(decodeHtmlEntities('&#0;')).toBe('&#0;')
    expect(decodeHtmlEntities('&#1114112;')).toBe('&#1114112;')
  })
})

describe('parseTagAttributes', () => {
  it('支持双引号、单引号与无引号三种写法', () => {
    expect(parseTagAttributes('<link rel="icon" href="/a.png">')).toEqual({ rel: 'icon', href: '/a.png' })
    expect(parseTagAttributes("<link rel='icon' href='/a.png'>")).toEqual({ rel: 'icon', href: '/a.png' })
    expect(parseTagAttributes('<link rel=icon href=/a.png>')).toEqual({ rel: 'icon', href: '/a.png' })
  })

  it('属性名转小写，值里的实体被解码', () => {
    expect(parseTagAttributes('<LINK REL="icon" HREF="/a.png?x=1&amp;y=2">')).toEqual({
      rel: 'icon',
      href: '/a.png?x=1&y=2'
    })
  })

  it('同名属性只取第一个', () => {
    expect(parseTagAttributes('<link href="/first.png" href="/second.png">')).toEqual({ href: '/first.png' })
  })

  it('没有属性的标签返回空对象', () => {
    expect(parseTagAttributes('<link>')).toEqual({})
  })
})

describe('parsePageMeta', () => {
  const base = 'https://example.com/blog/post'

  it('取出 title 并折叠空白、解码实体', () => {
    const html = '<html><head><title>\n  Hello &amp;   World\n</title></head></html>'
    expect(parsePageMeta(html, base).title).toBe('Hello & World')
  })

  it('title 缺失时返回空串', () => {
    expect(parsePageMeta('<html><head></head></html>', base).title).toBe('')
  })

  it('title 超长时截断并加省略号', () => {
    const long = 'x'.repeat(300)
    const title = parsePageMeta(`<title>${long}</title>`, base).title
    expect(title.length).toBe(201)
    expect(title.endsWith('…')).toBe(true)
  })

  it('兼容没有闭合标签的 title', () => {
    expect(parsePageMeta('<title>Unclosed', base).title).toBe('Unclosed')
  })

  it('解析相对 favicon 并补全为绝对地址', () => {
    const html = '<link rel="icon" href="/static/favicon.png">'
    expect(parsePageMeta(html, base).iconUrl).toBe('https://example.com/static/favicon.png')
  })

  it('解析协议相对地址', () => {
    const html = '<link rel="icon" href="//cdn.example.com/f.ico">'
    expect(parsePageMeta(html, base).iconUrl).toBe('https://cdn.example.com/f.ico')
  })

  it('rel="icon" 优先于 apple-touch-icon', () => {
    const html = [
      '<link rel="apple-touch-icon" href="/apple.png">',
      '<link rel="icon" href="/real.png">'
    ].join('')
    expect(parsePageMeta(html, base).iconUrl).toBe('https://example.com/real.png')
  })

  it('识别 rel="shortcut icon"', () => {
    const html = '<link rel="shortcut icon" href="/s.ico">'
    expect(parsePageMeta(html, base).iconUrl).toBe('https://example.com/s.ico')
  })

  it('没有声明图标时回退到根目录 favicon.ico', () => {
    expect(parsePageMeta('<html></html>', base).iconUrl).toBe('https://example.com/favicon.ico')
  })

  it('跳过 data: 图标', () => {
    const html = '<link rel="icon" href="data:image/png;base64,AAAA">'
    expect(parsePageMeta(html, base).iconUrl).toBe('https://example.com/favicon.ico')
  })

  it('尊重 <base href> 作为相对地址基准', () => {
    const html = '<base href="https://cdn.example.com/assets/"><link rel="icon" href="f.ico">'
    expect(parsePageMeta(html, base).iconUrl).toBe('https://cdn.example.com/assets/f.ico')
  })

  it('非 http(s) 的图标地址被丢弃', () => {
    const html = '<link rel="icon" href="javascript:alert(1)">'
    expect(parsePageMeta(html, base).iconUrl).toBe('https://example.com/favicon.ico')
  })

  it('同时取出标题与图标', () => {
    const html = '<title>示例站</title><link rel="icon" href="/i.png">'
    expect(parsePageMeta(html, base)).toEqual({
      title: '示例站',
      iconUrl: 'https://example.com/i.png'
    })
  })
})

describe('detectCharset', () => {
  it('优先用响应头里的 charset', () => {
    expect(detectCharset('<meta charset="gbk">', 'text/html; charset=utf-8')).toBe('utf-8')
  })

  it('响应头没有时读 <meta charset>', () => {
    expect(detectCharset('<meta charset="utf-8">', 'text/html')).toBe('utf-8')
    expect(detectCharset('<meta http-equiv="Content-Type" content="text/html; charset=GBK">', 'text/html')).toBe('gb18030')
  })

  it('gb2312 / gbk 统一升到 gb18030（超集）', () => {
    expect(detectCharset('', 'text/html; charset=gb2312')).toBe('gb18030')
    expect(detectCharset('', 'text/html; charset=GBK')).toBe('gb18030')
  })

  it('都没声明时默认 utf-8', () => {
    expect(detectCharset('<html>', 'text/html')).toBe('utf-8')
  })
})

describe('decodeBody', () => {
  it('按 utf-8 解码', () => {
    const body = Buffer.from('<title>中文标题</title>', 'utf8')
    expect(decodeBody(body, 'text/html; charset=utf-8')).toBe('<title>中文标题</title>')
  })

  it('按 gb18030 解码（中文站常见）', () => {
    // '中文' 的 GBK 字节序列
    const body = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])
    expect(decodeBody(body, 'text/html; charset=gbk')).toBe('中文')
  })

  it('编码名非法时回退 utf-8 而不是抛异常', () => {
    const body = Buffer.from('hello', 'utf8')
    expect(decodeBody(body, 'text/html; charset=not-a-charset')).toBe('hello')
  })
})
