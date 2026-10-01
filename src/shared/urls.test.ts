import { describe, expect, it } from 'vitest'
import { getHostname, isHttpUrl, normalizeHttpUrl, parseHttpUrl } from './urls'

describe('parseHttpUrl', () => {
  it('接受 http / https', () => {
    expect(parseHttpUrl('https://example.com/a?b=1')?.hostname).toBe('example.com')
    expect(parseHttpUrl('http://example.com')?.protocol).toBe('http:')
  })

  it('拒绝非 http(s) 协议', () => {
    expect(parseHttpUrl('mailto:a@b.com')).toBe(null)
    expect(parseHttpUrl('ftp://example.com')).toBe(null)
    expect(parseHttpUrl('javascript:alert(1)')).toBe(null)
    expect(parseHttpUrl('file:///C:/a.html')).toBe(null)
    expect(parseHttpUrl('shell:AppsFolder\\foo')).toBe(null)
  })

  it('拒绝缺少协议的裸域名与空值', () => {
    expect(parseHttpUrl('example.com')).toBe(null)
    expect(parseHttpUrl('')).toBe(null)
    expect(parseHttpUrl('   ')).toBe(null)
  })

  it('拒绝非字符串', () => {
    expect(parseHttpUrl(null)).toBe(null)
    expect(parseHttpUrl(undefined)).toBe(null)
    expect(parseHttpUrl(42)).toBe(null)
    expect(parseHttpUrl({})).toBe(null)
  })
})

describe('isHttpUrl', () => {
  it('与 parseHttpUrl 结论一致', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('example.com')).toBe(false)
    expect(isHttpUrl('ftp://example.com')).toBe(false)
  })
})

describe('normalizeHttpUrl', () => {
  it('省略协议时按 https 补全', () => {
    expect(normalizeHttpUrl('example.com')).toBe('https://example.com/')
    expect(normalizeHttpUrl('www.example.com/docs')).toBe('https://www.example.com/docs')
  })

  it('已带协议的原样返回（规范化后）', () => {
    expect(normalizeHttpUrl('http://example.com')).toBe('http://example.com/')
    expect(normalizeHttpUrl('https://example.com/a')).toBe('https://example.com/a')
  })

  it('去掉首尾空白', () => {
    expect(normalizeHttpUrl('  https://example.com  ')).toBe('https://example.com/')
  })

  it('已写别的协议时判非法，不瞎补', () => {
    expect(normalizeHttpUrl('mailto:a@b.com')).toBe(null)
    expect(normalizeHttpUrl('javascript:alert(1)')).toBe(null)
    expect(normalizeHttpUrl('ftp://example.com')).toBe(null)
  })

  it('Windows 路径不会被误判成"带协议的地址"后补全', () => {
    expect(normalizeHttpUrl('C:\\Program Files\\app.exe')).toBe(null)
  })

  it('空值与非字符串返回 null', () => {
    expect(normalizeHttpUrl('')).toBe(null)
    expect(normalizeHttpUrl('   ')).toBe(null)
    expect(normalizeHttpUrl(null)).toBe(null)
    expect(normalizeHttpUrl(42)).toBe(null)
  })
})

describe('getHostname', () => {
  it('去掉 www. 前缀', () => {
    expect(getHostname('https://www.example.com/a')).toBe('example.com')
    expect(getHostname('https://example.com')).toBe('example.com')
    expect(getHostname('https://docs.example.com')).toBe('docs.example.com')
  })

  it('非法 URL 返回空串', () => {
    expect(getHostname('example.com')).toBe('')
    expect(getHostname('')).toBe('')
    expect(getHostname(null)).toBe('')
  })
})
