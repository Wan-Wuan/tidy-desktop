/**
 * URL 判定的单一来源。
 *
 * 此前「这是不是一个可打开的外部链接」的判断长在 `main/urlPolicy.ts` 里，
 * 而那个文件在模块顶层读了 `app.isPackaged`（Electron 依赖）。于是任何只想
 * 判断一下协议的地方一旦 import 它，就被拖进 Electron 运行时，纯函数测试
 * 直接跑不起来（`app` 在 Node 下是 undefined，读属性即抛）。
 *
 * 判定逻辑本身与运行环境无关，挪到 shared 里谁都能用。
 */

/** 解析出 http/https 的 URL；其它协议与非法字符串一律返回 null。 */
export function parseHttpUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function isHttpUrl(raw: unknown): boolean {
  return parseHttpUrl(raw) !== null
}

/**
 * 把用户输入的地址补成合法 URL。
 *
 * `example.com`、`www.example.com/docs` 这类省略协议的写法是最常见的输入方式，
 * 不该让用户自己去补 `https://`。但已经写了别的协议（`mailto:`、`ftp:`、`javascript:`）
 * 就不再瞎补——那些是明确的"不是网页"，补了反而把非法输入洗成合法输入。
 */
export function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  const direct = parseHttpUrl(value)
  if (direct) return direct.toString()
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  return parseHttpUrl(`https://${value}`)?.toString() ?? null
}

/** 取主机名并去掉 `www.` 前缀；非法 URL 返回空串。 */
export function getHostname(raw: unknown): string {
  const url = parseHttpUrl(raw)
  if (!url) return ''
  return url.hostname.replace(/^www\./i, '')
}
