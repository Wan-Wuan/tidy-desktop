import { describe, expect, it } from 'vitest'
import type { BrowserEntry } from '../../../shared/types'
import { resolveUrlBrowser } from './urlBrowser'

const chrome: BrowserEntry = { id: 'chrome', name: 'Google Chrome', path: 'C:\\chrome.exe' }
const edge: BrowserEntry = { id: 'edge', name: 'Microsoft Edge', path: 'C:\\msedge.exe' }

describe('resolveUrlBrowser', () => {
  it('命中时返回对应的浏览器条目', () => {
    expect(resolveUrlBrowser('edge', [chrome, edge])).toEqual(edge)
  })

  it('没设过（null / undefined / 空串）返回 null，交给系统默认浏览器', () => {
    expect(resolveUrlBrowser(null, [chrome, edge])).toBeNull()
    expect(resolveUrlBrowser(undefined, [chrome, edge])).toBeNull()
    expect(resolveUrlBrowser('', [chrome, edge])).toBeNull()
  })

  it('浏览器已被从设置里删掉时返回 null（静默回落，不报错）', () => {
    expect(resolveUrlBrowser('firefox', [chrome, edge])).toBeNull()
  })

  it('配置里根本没有 browsers 字段时返回 null', () => {
    expect(resolveUrlBrowser('chrome', undefined)).toBeNull()
    expect(resolveUrlBrowser('chrome', null)).toBeNull()
    expect(resolveUrlBrowser('chrome', [])).toBeNull()
  })
})
