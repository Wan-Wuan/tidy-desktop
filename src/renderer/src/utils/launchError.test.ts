import { describe, expect, it } from 'vitest'
import { describeLaunchError } from './launchError'
import { describeUrlMetaError, URL_META_ERROR_TEXT } from './urlMetaError'
import type { UrlMetaError } from '../../../shared/types'

describe('describeLaunchError', () => {
  it('已知错误码翻成人话', () => {
    expect(describeLaunchError('invalid-path')).toContain('路径')
    expect(describeLaunchError('invalid-url')).toContain('网址')
    expect(describeLaunchError('unsupported-type')).toContain('不支持')
  })

  it('系统抛的原始错误文本原样透传，比笼统的「启动失败」有用', () => {
    expect(describeLaunchError('Access is denied.')).toBe('Access is denied.')
  })

  it('空值兜底', () => {
    expect(describeLaunchError(null)).toBe('启动失败')
  })
})

describe('describeUrlMetaError', () => {
  it('每一种结构化错误都有对应文案', () => {
    const errors: UrlMetaError[] = [
      'invalid-url', 'disabled', 'timeout', 'too-large',
      'http-error', 'network', 'empty-response', 'no-icon'
    ]
    for (const error of errors) {
      expect(URL_META_ERROR_TEXT[error]).toBeTruthy()
      expect(describeUrlMetaError(error)).toBe(URL_META_ERROR_TEXT[error])
    }
  })

  it('超时与连不上给的是不同建议（用户要采取的行动不一样）', () => {
    expect(describeUrlMetaError('timeout')).not.toBe(describeUrlMetaError('network'))
  })

  it('null 时兜底', () => {
    expect(describeUrlMetaError(null)).toBe('获取失败，请手动填写名称')
  })
})
