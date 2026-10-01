import http from 'http'
import https from 'https'
import type { UrlMetaError } from '../shared/types'
import { normalizeHttpUrl, parseHttpUrl } from '../shared/urls'

/**
 * 网页元信息抓取（标题 + favicon）。
 *
 * 这是全项目唯一一处「主进程主动访问用户指定的外部地址」，所以边界要收紧：
 * 只允许 http/https、总耗时 5s 封顶（含重定向）、响应体有上限、
 * 只解析 `<title>` 与 `<link rel="icon">`，不执行任何脚本、不解析 CSS/JS。
 *
 * 体积控制走**结构**而不是纯字节数：`<title>` 和图标声明一定在 `<head>` 里，
 * 所以读到 `</head>` 就立刻断开连接，1MB 只作为"页面畸形、始终没有 `</head>`"的兜底。
 * （一开始按固定 512KB 截断，实测 github.com 首页光 `<head>` 就超过这个数，
 * 直接判成 too-large —— 用结构判断后这类大站才抓得到标题。）
 *
 * 本文件刻意不 import electron：解析与抓取都是纯 Node 逻辑，
 * 放在这里才能被单元测试直接覆盖（`urlPolicy.ts` 那种顶层读 `app` 的模块做不到）。
 */

const MAX_REDIRECTS = 5
const REQUEST_TIMEOUT_MS = 5_000
/** 兜底上限：只在页面始终不出现 `</head>` 时才会用到 */
const MAX_HTML_BYTES = 1024 * 1024
const MAX_ICON_BYTES = 256 * 1024
const MAX_TITLE_LENGTH = 200
/** 跨 chunk 检测 `</head>` 时保留的重叠长度，防止标签被切在两块之间漏掉 */
const HEAD_SCAN_OVERLAP = 32

/**
 * 用浏览器 UA 而不是 `tidy-desktop/...`：相当一部分站点对非浏览器 UA 直接 403/302 到验证页，
 * 那样"抓标题"这个功能对它们就完全失效了。我们抓的是浏览器本来就会渲染的同一个页面，
 * 不跟随 robots 之外的任何额外行为，因此这里选择兼容性优先。
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface PageMeta {
  ok: boolean
  title: string
  iconUrl: string | null
  error: UrlMetaError | null
}

type FetchOutcome =
  | { ok: true; statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; finalUrl: string }
  | { ok: false; error: UrlMetaError }

interface RequestOptions {
  maxBytes: number
  timeoutMs: number
  accept: string
  /** 读到 `</head>` 就提前断开——HTML 抓取专用 */
  stopAtHeadClose?: boolean
}

/* ------------------------------------------------------------------ 实体解码 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', thinsp: ' ', shy: '',
  hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•', sect: '§',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', divide: '÷',
  laquo: '«', raquo: '»', iexcl: '¡', cent: '¢', pound: '£', yen: '¥', euro: '€',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ'
}

function codePointToString(code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** 解码 HTML 实体。只认 `&name;` / `&#123;` / `&#x1F;` 三种写法，认不出的原样保留。 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    const body = entity.slice(1)
    if (entity[0] === '#') {
      const code = body[0] === 'x' || body[0] === 'X'
        ? Number.parseInt(body.slice(1), 16)
        : Number.parseInt(body, 10)
      const decoded = codePointToString(code)
      return decoded || match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/* -------------------------------------------------------------------- 属性解析 */

/** 从单个标签字符串里抽出属性（值支持双引号 / 单引号 / 无引号三种写法）。 */
export function parseTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1].toLowerCase()
    if (name in attributes) continue
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function resolveAgainst(href: string, baseUrl: string): string | null {
  const value = href.trim()
  if (!value) return null
  // data: 图标的体积不可控，直接跳过，让调用方走 favicon.ico 兜底
  if (/^data:/i.test(value)) return null
  try {
    return parseHttpUrl(new URL(value, baseUrl).toString())?.toString() ?? null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------- 元信息解析 */

function extractTitle(html: string): string {
  // 兼容没有闭合标签的页面：`</title>` 缺失时取到下一个 `<` 为止
  const match = html.match(/<title[^>]*>([\s\S]*?)(?:<\/title>|$)/i)
  if (!match) return ''
  const title = decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim()
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH)}…` : title
}

function extractIconUrl(html: string, baseUrl: string): string | null {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0]
  const declaredBase = baseTag ? parseTagAttributes(baseTag).href : ''
  const effectiveBase = (declaredBase && resolveAgainst(declaredBase, baseUrl)) || baseUrl

  const candidates: Array<{ href: string; rank: number }> = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseTagAttributes(tag)
    const rel = (attributes.rel ?? '').toLowerCase()
    if (!rel.includes('icon') || !attributes.href) continue
    // 优先标准 rel="icon"，其次 rel="shortcut icon"，apple-touch-icon 排最后
    const rank = rel.includes('apple-touch-icon') ? 2 : rel.split(/\s+/).includes('icon') ? 0 : 1
    candidates.push({ href: attributes.href, rank })
  }
  candidates.sort((a, b) => a.rank - b.rank)
  for (const candidate of candidates) {
    const absolute = resolveAgainst(candidate.href, effectiveBase)
    if (absolute) return absolute
  }
  // 页面没声明图标时按惯例猜根目录 favicon.ico；抓不到就由调用方降级
  return resolveAgainst('/favicon.ico', effectiveBase)
}

/** 只解析标题与图标地址，其余内容一概不看。 */
export function parsePageMeta(html: string, baseUrl: string): { title: string; iconUrl: string | null } {
  return {
    title: extractTitle(html),
    iconUrl: extractIconUrl(html, baseUrl)
  }
}

/* ------------------------------------------------------------------------ 编码 */

const CHARSET_IN_TEXT = /charset\s*=\s*["']?\s*([\w-]+)/i

/** 从响应头或 `<meta charset>` 里定编码；gb2312/gbk 统一升到 gb18030（超集，不会解错）。 */
export function detectCharset(headAscii: string, contentType: string): string {
  const declared = contentType.match(CHARSET_IN_TEXT)?.[1] ?? headAscii.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]
  const charset = (declared ?? 'utf-8').trim().toLowerCase()
  if (charset === 'gb2312' || charset === 'gbk') return 'gb18030'
  return charset || 'utf-8'
}

/**
 * 按页面声明的编码解码。
 * 先用 latin1 粗读头部找 `<meta charset>`——latin1 是单字节映射，不会吞掉字节，
 * 中文站（gbk）与 UTF-8 站都能正确识别。
 */
export function decodeBody(body: Buffer, contentType: string): string {
  const head = body.subarray(0, 4096).toString('latin1')
  const charset = detectCharset(head, contentType)
  try {
    return new TextDecoder(charset, { fatal: false }).decode(body)
  } catch {
    return body.toString('utf8')
  }
}

/* ------------------------------------------------------------------------ 请求 */

function isRedirectStatus(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308
}

function requestOnce(url: string, options: RequestOptions): Promise<FetchOutcome> {
  const { maxBytes, timeoutMs, accept, stopAtHeadClose } = options
  return new Promise(resolve => {
    let settled = false
    const done = (outcome: FetchOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }

    const client = url.startsWith('https:') ? https : http
    let request: http.ClientRequest
    try {
      request = client.get(
        url,
        {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: accept,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
          }
        },
        response => {
          const statusCode = response.statusCode ?? 0
          // 重定向与错误状态不读 body——只要头部信息
          if (isRedirectStatus(statusCode) || statusCode >= 400) {
            response.resume()
            done({ ok: true, statusCode, headers: response.headers, body: Buffer.alloc(0), finalUrl: url })
            return
          }

          const chunks: Buffer[] = []
          let size = 0
          let headClosed = false
          let scanTail = ''

          const finish = () => {
            response.destroy()
            done({
              ok: true,
              statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks),
              finalUrl: url
            })
          }

          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
            size += chunk.length

            if (stopAtHeadClose && !headClosed) {
              const scan = scanTail + chunk.toString('latin1')
              if (/<\/head\s*>/i.test(scan)) {
                headClosed = true
                finish()
                return
              }
              // 只留末尾一小段用于跨块匹配，避免 scan 随页面无限增长
              scanTail = scan.slice(-HEAD_SCAN_OVERLAP)
            }

            if (size > maxBytes) {
              response.destroy()
              done({ ok: false, error: 'too-large' })
            }
          })

          response.on('end', () => {
            done({
              ok: true,
              statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks),
              finalUrl: url
            })
          })
          response.on('error', () => done({ ok: false, error: 'network' }))
        }
      )
    } catch {
      done({ ok: false, error: 'network' })
      return
    }

    request.on('error', () => done({ ok: false, error: 'network' }))
    request.setTimeout(timeoutMs, () => {
      request.destroy()
      done({ ok: false, error: 'timeout' })
    })
  })
}

/** 跟随重定向，但整个链路共用一份 5s 预算——不能靠"每跳 5s"叠出 30s。 */
async function fetchWithRedirects(startUrl: string, options: RequestOptions): Promise<FetchOutcome> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS
  let current = startUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { ok: false, error: 'timeout' }

    const outcome = await requestOnce(current, { ...options, timeoutMs: remaining })
    if (!outcome.ok) return outcome
    if (!isRedirectStatus(outcome.statusCode)) return outcome

    const location = outcome.headers.location
    if (!location) return { ok: false, error: 'http-error' }
    const next = parseHttpUrl(new URL(location, current).toString())
    if (!next) return { ok: false, error: 'http-error' }
    current = next.toString()
  }

  return { ok: false, error: 'http-error' }
}

/* -------------------------------------------------------------------- 对外接口 */

/** 抓页面标题与 favicon 地址。任何失败都返回结构化错误，不抛异常。 */
export async function fetchPageMeta(rawUrl: string): Promise<PageMeta> {
  // 自己也补一次协议，这样单独调用（比如测试）也不会因为少了 https:// 而判非法
  const normalized = normalizeHttpUrl(rawUrl)
  if (!normalized) return { ok: false, title: '', iconUrl: null, error: 'invalid-url' }

  const page = await fetchWithRedirects(normalized, {
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: REQUEST_TIMEOUT_MS,
    accept: 'text/html,application/xhtml+xml',
    stopAtHeadClose: true
  })
  if (!page.ok) return { ok: false, title: '', iconUrl: null, error: page.error }
  if (page.statusCode >= 400) return { ok: false, title: '', iconUrl: null, error: 'http-error' }
  if (page.body.length === 0) return { ok: false, title: '', iconUrl: null, error: 'empty-response' }

  const html = decodeBody(page.body, String(page.headers['content-type'] ?? ''))
  const meta = parsePageMeta(html, page.finalUrl)
  if (!meta.title && !meta.iconUrl) return { ok: false, title: '', iconUrl: null, error: 'empty-response' }

  return { ok: true, title: meta.title, iconUrl: meta.iconUrl, error: null }
}

export type IconFetchOutcome =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; error: UrlMetaError }

/** 下载 favicon 原始字节。 */
export async function fetchIconBytes(iconUrl: string): Promise<IconFetchOutcome> {
  const url = parseHttpUrl(iconUrl)
  if (!url) return { ok: false, error: 'no-icon' }

  const response = await fetchWithRedirects(url.toString(), {
    maxBytes: MAX_ICON_BYTES,
    timeoutMs: REQUEST_TIMEOUT_MS,
    accept: 'image/*'
  })
  if (!response.ok) return { ok: false, error: response.error }
  if (response.statusCode >= 400 || response.body.length === 0) return { ok: false, error: 'no-icon' }

  return {
    ok: true,
    bytes: response.body,
    contentType: String(response.headers['content-type'] ?? '')
  }
}
