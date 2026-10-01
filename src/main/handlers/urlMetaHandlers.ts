import { ipcMain, nativeImage } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { CONFIG_FILE, ICONS_DIR, readJsonFile } from '../config'
import { assertSender, assertString } from '../ipcGuard'
import { fetchIconBytes, fetchPageMeta } from '../urlMeta'
import { normalizeHttpUrl } from '../../shared/urls'
import type { Config, UrlMetaResult } from '../../shared/types'

/**
 * 网址元信息抓取。
 *
 * 这是主进程唯一一处「主动访问用户指定的外部地址」的能力，因此校验顺序是：
 * 来源 → URL 合法性 → 用户是否允许抓取 → 才发请求。
 * 任何一步不过都返回结构化错误，渲染层据此提示并降级为字母头像，
 * 绝不把失败伪装成空结果（那会让用户以为站点就是没标题）。
 */

const MAX_URL_LENGTH = 2048
/** 小于这个字节数的图标基本是 1x1 占位图，留着不如走字母头像 */
const MIN_ICON_BYTES = 100

function failure(error: UrlMetaResult['error']): UrlMetaResult {
  return { ok: false, title: '', icon: null, error }
}

/**
 * favicon 缓存路径。
 * 沿用 `extract-icon` 那套「sha256 截断 32 位十六进制」方案，只加 `urlmeta:` 前缀
 * 把来源分开，避免某个文件路径的哈希与某个图标地址的哈希撞在一起。
 */
function iconCachePath(iconUrl: string): string {
  const hash = crypto.createHash('sha256').update(`urlmeta:${iconUrl}`).digest('hex').slice(0, 32)
  return path.join(ICONS_DIR, `${hash}.png`)
}

function toIconDataUrl(bytes: Buffer, contentType: string): string | null {
  if (bytes.length < MIN_ICON_BYTES) return null
  try {
    // 统一转 PNG：favicon 可能是 .ico / .png / .svg / .jpg，格式不一，
    // 但应用内其它图标一律是 PNG data URL，出口保持一致渲染层才不用分支。
    const image = nativeImage.createFromBuffer(bytes)
    if (!image.isEmpty()) {
      const png = image.toPNG()
      if (png.length > MIN_ICON_BYTES) return `data:image/png;base64,${png.toString('base64')}`
    }
  } catch { /* 落到下面的兜底 */ }
  // nativeImage 解不开但本来就是 PNG 时直接透传（极少见，多一层保险）
  if (contentType.includes('image/png')) return `data:image/png;base64,${bytes.toString('base64')}`
  return null
}

/** 取 favicon：先查缓存，未命中再下载并回写缓存。 */
async function resolveFavicon(iconUrl: string): Promise<string | null> {
  const cachePath = iconCachePath(iconUrl)
  try {
    if (fs.existsSync(cachePath)) {
      const cached = fs.readFileSync(cachePath)
      if (cached.length >= MIN_ICON_BYTES) return `data:image/png;base64,${cached.toString('base64')}`
    }
  } catch { /* 缓存读失败就当作未命中，重新抓一次 */ }

  const fetched = await fetchIconBytes(iconUrl)
  if (!fetched.ok) return null
  const dataUrl = toIconDataUrl(fetched.bytes, fetched.contentType)
  if (!dataUrl) return null

  // 写缓存失败只影响下次，不影响本次返回
  try {
    if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true })
    fs.writeFileSync(cachePath, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
  } catch { /* ignore */ }

  return dataUrl
}

export function registerUrlMetaHandlers() {
  ipcMain.handle('fetch-url-meta', async (event, rawUrl: unknown): Promise<UrlMetaResult> => {
    if (!assertSender(event)) return failure('invalid-url')

    const url = normalizeHttpUrl(assertString(rawUrl, MAX_URL_LENGTH))
    if (!url) return failure('invalid-url')

    const config = readJsonFile<Config>(CONFIG_FILE, {} as Config)
    if (config.urlMetaEnabled === false) return failure('disabled')

    const page = await fetchPageMeta(url)
    if (!page.ok) return failure(page.error)

    const icon = page.iconUrl ? await resolveFavicon(page.iconUrl) : null
    // ok 只表示「页面抓到了」；icon 为 null 表示拿不到图标，渲染层走字母头像降级
    return { ok: true, title: page.title, icon, error: null }
  })
}
