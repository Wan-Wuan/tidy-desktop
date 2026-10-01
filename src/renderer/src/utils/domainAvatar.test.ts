import { describe, expect, it } from 'vitest'
import {
  getAvatarBackground,
  getAvatarLetter,
  getCardTitle,
  getDisplayHost
} from './domainAvatar'
import type { AppItem } from '../../../shared/types'

const baseApp: AppItem = {
  id: 'a1',
  name: '示例',
  path: 'https://example.com',
  icon: '',
  categoryId: null,
  pinyin: '',
  firstLetter: ''
}

describe('getDisplayHost', () => {
  it('去掉 www 前缀', () => {
    expect(getDisplayHost('https://www.baidu.com/s?wd=x')).toBe('baidu.com')
  })

  it('协议缺省时也能解析', () => {
    expect(getDisplayHost('github.com')).toBe('github.com')
  })

  it('保留端口', () => {
    expect(getDisplayHost('http://localhost:3000/path')).toBe('localhost:3000')
  })

  it('空串返回空串而不是抛异常', () => {
    expect(getDisplayHost('')).toBe('')
    expect(getDisplayHost('   ')).toBe('')
  })

  it('完全不是 URL 时退回原串（去掉 www）', () => {
    expect(getDisplayHost('www.不是网址')).toBe('不是网址')
  })
})

describe('getAvatarLetter', () => {
  it('跳过公共后缀，取主域首字母', () => {
    expect(getAvatarLetter('https://github.com')).toBe('G')
    expect(getAvatarLetter('https://www.baidu.com')).toBe('B')
  })

  it('多级子域时取最靠前的一段', () => {
    expect(getAvatarLetter('https://mail.google.com')).toBe('M')
  })

  it('空值降级为问号', () => {
    expect(getAvatarLetter('')).toBe('?')
  })
})

describe('getAvatarHue / getAvatarBackground', () => {
  it('同一域名稳定得到同一颜色', () => {
    expect(getAvatarBackground('https://github.com')).toBe(getAvatarBackground('https://www.github.com/x'))
  })

  it('不同域名通常不同色（抽样不冲突即可，不要求绝对无碰撞）', () => {
    const hues = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'].map(d => getAvatarBackground(d))
    expect(new Set(hues).size).toBeGreaterThan(1)
  })

  it('色相落在 0~359', () => {
    for (const url of ['https://a.com', 'https://b.cn', '', 'https://very-long-domain-name.example.org']) {
      const match = getAvatarBackground(url).match(/hsl\((\d+)/)
      const hue = Number(match?.[1])
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })
})

describe('getCardTitle', () => {
  it('网址显示完整链接', () => {
    expect(getCardTitle({ ...baseApp, type: 'url' })).toBe('https://example.com')
  })

  it('文本显示正文，正文为空时退回名称', () => {
    expect(getCardTitle({ ...baseApp, type: 'note', noteContent: '记得买牛奶' })).toBe('记得买牛奶')
    expect(getCardTitle({ ...baseApp, type: 'note' })).toBe('示例')
  })

  it('组合显示名称 + 组合标记', () => {
    expect(getCardTitle({ ...baseApp, type: 'group' })).toBe('示例（组合）')
  })

  it('其余类型显示路径', () => {
    expect(getCardTitle({ ...baseApp, type: 'app', path: 'C:\\a.exe' })).toBe('C:\\a.exe')
  })
})
