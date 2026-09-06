/**
 * 主题色（accent）工具：从任意基色生成 brand-50..900 色阶，
 * 输出为 RGB 三元组字符串，直接写入 CSS 变量（Tailwind 以 rgb(var()/alpha) 消费）。
 */

export type AccentScale = Record<string, string>

const BRAND_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const

export function isValidAccentHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
}

export function hexToRgbTriplet(hex: string): string {
  const raw = hex.trim().replace(/^#/, '')
  const full = raw.length === 3
    ? raw.split('').map(ch => ch + ch).join('')
    : raw
  const num = parseInt(full, 16)
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return [h, s * 100, l * 100]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rn = 0
  let gn = 0
  let bn = 0
  if (hp < 1) [rn, gn, bn] = [c, x, 0]
  else if (hp < 2) [rn, gn, bn] = [x, c, 0]
  else if (hp < 3) [rn, gn, bn] = [0, c, x]
  else if (hp < 4) [rn, gn, bn] = [0, x, c]
  else if (hp < 5) [rn, gn, bn] = [x, 0, c]
  else [rn, gn, bn] = [c, 0, x]
  const m = ln - c / 2
  return [Math.round((rn + m) * 255), Math.round((gn + m) * 255), Math.round((bn + m) * 255)]
}

/** 由基色生成 50-900 色阶（HSL 明度/饱和度渐变，基色作为 500 档并约束到可读区间） */
export function generateAccentScale(baseHex: string): AccentScale {
  const [r, g, b] = hexToRgbTriplet(baseHex).split(' ').map(Number)
  const [h, s, l] = rgbToHsl(r, g, b)
  const baseL = clamp(l, 42, 62)
  const shade = (sat: number, light: number): string => {
    const [rr, gg, bb] = hslToRgb(h, sat, light)
    return `${rr} ${gg} ${bb}`
  }
  return {
    'brand-50': shade(s * 0.35, 96),
    'brand-100': shade(s * 0.5, 92),
    'brand-200': shade(s * 0.65, 84),
    'brand-300': shade(s * 0.85, 74),
    'brand-400': shade(s, 66),
    'brand-500': shade(s, baseL),
    'brand-600': shade(s, baseL - 8),
    'brand-700': shade(Math.min(100, s * 1.05), baseL - 16),
    'brand-800': shade(Math.min(100, s * 1.1), baseL - 24),
    'brand-900': shade(Math.min(100, s * 1.15), baseL - 32)
  }
}

/** 把色阶写入指定根元素；传 null 时移除自定义值，回落到 :root 默认 */
export function applyAccentScale(scale: AccentScale | null, root: HTMLElement): void {
  for (const shade of BRAND_SHADES) {
    const property = `--brand-${shade}`
    const value = scale?.[`brand-${shade}`]
    if (value) root.style.setProperty(property, value)
    else root.style.removeProperty(property)
  }
}
