import type { AppItem } from '../../../shared/types'
import { summarizeTodos } from './todo'

/**
 * 网址项目拿不到 favicon 时的降级头像。
 *
 * 为什么不用默认灰图标：一排抓取失败的网址如果全是同一个灰图标，
 * 用户根本分不清哪个是哪个。用「域名首字母 + 由域名稳定推导出的品牌色」
 * 至少能靠颜色和字母区分开。
 */

function stripWww(value: string): string {
  return value.replace(/^www\./i, '')
}

/** 从原始输入里粗略截出主机部分（去协议、去路径与查询），用于解析失败或 punycode 化的兜底。 */
function extractRawHost(raw: string): string {
  return raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0]
}

/** 从 URL 里取主机名；取不到时退回原串，再取不到就空串。纯函数，不抛异常。 */
export function getDisplayHost(url: string): string {
  const raw = (url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    /* 用 `host` 而不是 `hostname`：localhost:3000 与 localhost:8080 是两个服务，
       只显示 hostname 卡片上完全分不清。URL 会自己消掉协议的默认端口，
       所以这里非空就一定是要显示的那个。 */
    const host = parsed.host
    /* 中文等非 ASCII 域名会被 URL 规范化成 punycode（`xn--…`），界面上就是一串乱码。
       这种情况退回用户输入的原文——宁可显示中文域名，也不要显示编码。 */
    if (/(^|\.)xn--/i.test(host)) return stripWww(extractRawHost(raw))
    return stripWww(host)
  } catch {
    return stripWww(extractRawHost(raw))
  }
}

/** 头像上的那个字母：优先取域名去掉公共后缀后的第一个字母，取不到就用域名首字母。 */
export function getAvatarLetter(url: string): string {
  const host = getDisplayHost(url)
  if (!host) return '?'
  // 去掉常见后缀，让 `github.com` → `g`、`www.baidu.com` → `b`
  const core = host.split('.').filter(part => !/^(com|cn|net|org|edu|gov|io|co|me|dev|app|xyz|top|info|biz)$/i.test(part))
  const source = core[0] || host
  return source.slice(0, 1).toUpperCase()
}

/**
 * 由域名稳定推导一个色相。
 * 同一个域名永远得到同一个颜色（纯哈希，无随机），用户下次还能认出来。
 */
export function getAvatarHue(url: string): number {
  const host = getDisplayHost(url)
  let hash = 0
  for (let i = 0; i < host.length; i++) {
    hash = (hash * 31 + host.charCodeAt(i)) % 360
  }
  return hash
}

/** 直接产出可用的 CSS 渐变背景（同一个域名每次一样）。 */
export function getAvatarBackground(url: string): string {
  const hue = getAvatarHue(url)
  return `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 28) % 360} 58% 40%))`
}

/** 卡片上悬停要显示的完整地址：网址项目显示链接，其余显示路径。 */
export function getCardTitle(app: AppItem): string {
  if (app.type === 'url') return app.path
  if (app.type === 'note') {
    /* 待办显示进度 + 前几条未完成，比甩一段空正文有用得多 */
    return app.noteKind === 'todo' ? summarizeTodos(app.todoItems ?? []) : (app.noteContent || app.name)
  }
  if (app.type === 'group') return `${app.name}（组合）`
  return app.path
}
