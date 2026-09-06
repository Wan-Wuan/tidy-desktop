import { describe, expect, it } from 'vitest'
import { applyAccentScale, generateAccentScale, hexToRgbTriplet, isValidAccentHex } from './colorScale'

describe('hexToRgbTriplet', () => {
  it('converts 6-digit hex to rgb triplet', () => {
    expect(hexToRgbTriplet('#6366F1')).toBe('99 102 241')
  })

  it('expands 3-digit hex', () => {
    expect(hexToRgbTriplet('#fff')).toBe('255 255 255')
  })
})

describe('isValidAccentHex', () => {
  it('accepts valid hex colors', () => {
    expect(isValidAccentHex('#6366F1')).toBe(true)
    expect(isValidAccentHex('#fff')).toBe(true)
  })

  it('rejects other values', () => {
    expect(isValidAccentHex('')).toBe(false)
    expect(isValidAccentHex('red')).toBe(false)
    expect(isValidAccentHex('#12345')).toBe(false)
  })
})

describe('generateAccentScale', () => {
  it('produces all ten brand shades as rgb triplets', () => {
    const scale = generateAccentScale('#6366F1')
    const shades = Object.keys(scale)
    expect(shades.length).toBe(10)
    for (const shade of shades) {
      expect(scale[shade]).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    }
  })

  it('uses the base color as the 500 shade when its lightness is in range', () => {
    // #F43F5E 的 HSL 亮度约 60%，落在 42-62 的保留区间内，500 档应与基色一致
    const scale = generateAccentScale('#F43F5E')
    expect(scale['brand-500']).toBe('244 63 94')
  })

  it('clamps out-of-range lightness into a readable band', () => {
    // #6366F1 亮度约 67%，500 档应被压回区间而不是原样输出
    const scale = generateAccentScale('#6366F1')
    expect(scale['brand-500']).not.toBe('99 102 241')
    const [r, g, b] = scale['brand-500'].split(' ').map(Number)
    const l = (Math.max(r, g, b) / 255 + Math.min(r, g, b) / 255) / 2
    expect(l).toBeGreaterThanOrEqual(0.42)
    expect(l).toBeLessThanOrEqual(0.62)
  })

  it('keeps lighter shades brighter than darker ones', () => {
    const sum = (triplet: string) => triplet.split(' ').reduce((acc, v) => acc + Number(v), 0)
    const scale = generateAccentScale('#10B981')
    expect(sum(scale['brand-50'])).toBeGreaterThan(sum(scale['brand-900']))
    expect(sum(scale['brand-200'])).toBeGreaterThan(sum(scale['brand-800']))
  })
})

describe('applyAccentScale', () => {
  it('sets and removes brand css variables', () => {
    const store = new Map<string, string>()
    const root = {
      style: {
        setProperty: (name: string, value: string) => { store.set(name, value) },
        removeProperty: (name: string) => { store.delete(name) }
      }
    } as unknown as HTMLElement

    applyAccentScale(generateAccentScale('#F43F5E'), root)
    expect(store.get('--brand-500')).toBe('244 63 94')
    expect(store.size).toBe(10)

    applyAccentScale(null, root)
    expect(store.size).toBe(0)
  })
})
