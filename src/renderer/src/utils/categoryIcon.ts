import type { CategoryIconKind, ParsedCategoryIcon } from '../../../shared/types'

/**
 * 分类图标的编码方案（与计划 §4.1 / P1-4 一致）。
 *
 *  - `emoji:<字符>` 或纯字符（历史兼容）→ Emoji / 文字
 *  - `image:<icons/ 下的文件名>` → 本地图片（复制到图标缓存）
 *  - `url:<http(s) 地址>` → 网络图片
 *  - `svg:<data url>` → 内联 SVG（已转成 data url，避免注入）
 *
 * 主进程只认识 `image:` 段对应的文件名（走 get-icon-file-url 拿 file://），
 * 其余三种的值本身就能直接用于渲染。
 */

const PREFIXES: Record<CategoryIconKind, string> = {
  emoji: 'emoji:',
  image: 'image:',
  url: 'url:',
  svg: 'svg:'
}

export function parseCategoryIcon(icon: string | undefined | null): ParsedCategoryIcon {
  const raw = (icon || '').trim()
  if (!raw) return { kind: 'emoji', value: '' }
  // 顺序无所谓：四种前缀互不重叠
  for (const kind of ['image', 'url', 'svg', 'emoji'] as CategoryIconKind[]) {
    const prefix = PREFIXES[kind]
    if (raw.startsWith(prefix)) {
      return { kind, value: raw.slice(prefix.length).trim() }
    }
  }
  // 没有前缀：历史数据就是纯 Emoji 字符，原样当作 emoji
  return { kind: 'emoji', value: raw }
}

export function encodeCategoryIcon(kind: CategoryIconKind, value: string): string {
  const v = (value || '').trim()
  if (kind === 'emoji') {
    // 纯 Emoji 不加前缀，保留与历史数据的一致性
    return v
  }
  return `${PREFIXES[kind]}${v}`
}

/** 把一个 SVG 文本编码成 data url（base64），供 `svg:` 段存储。 */
export function svgToDataUrl(svg: string): string {
  const trimmed = svg.trim()
  // 浏览器环境：btoa 仅支持 Latin1，中文/emoji 需先 UTF-8 再 base64
  const base64 = btoa(unescape(encodeURIComponent(trimmed)))
  return `data:image/svg+xml;base64,${base64}`
}

/** 判断一个字符串是否为可用的 http(s) 图片地址。 */
export function isHttpImageUrl(value: string): boolean {
  const v = (value || '').trim().toLowerCase()
  if (!v.startsWith('http://') && !v.startsWith('https://')) return false
  // 拒绝明显非图片的协议降级
  return /^https?:\/\/.+/i.test(v)
}

/**
 * 取可在纯文本处（如下拉 <option>）展示的分类图标字形。
 * 只有 emoji 类能放到 <option> 里；图片 / 网络 / SVG 类在 option 中无法渲染，
 * 返回空串，避免把 `image:xxx` 这种编码前缀当文字显示出来。
 */
export function categoryIconGlyph(icon: string | undefined | null): string {
  const parsed = parseCategoryIcon(icon)
  return parsed.kind === 'emoji' ? parsed.value : ''
}
