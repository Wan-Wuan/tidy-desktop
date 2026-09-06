import { describe, expect, it } from 'vitest'
import { compareVersions } from './network'

describe('compareVersions', () => {
  it('compares by numeric segments', () => {
    expect(compareVersions('2.2.0', '2.1.0')).toBe(1)
    expect(compareVersions('2.1.0', '2.2.0')).toBe(-1)
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0)
  })

  it('handles different segment counts', () => {
    expect(compareVersions('2.2', '2.1.9')).toBe(1)
    expect(compareVersions('2.1', '2.1.0')).toBe(0)
    expect(compareVersions('2', '1.9.9')).toBe(1)
  })

  it('strips pre-release suffixes', () => {
    expect(compareVersions('2.2.0-beta1', '2.2.0')).toBe(0)
    expect(compareVersions('2.1.0-rc2', '2.2.0')).toBe(-1)
  })

  it('compares numerically rather than lexically', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1)
    expect(compareVersions('10.0.0', '9.0.0')).toBe(1)
  })
})
