import type { BrowserEntry } from '../../../shared/types'

/**
 * 把项目上存的 `browserId` 解析成配置里的浏览器条目。
 *
 * 解析不出来（没设过 / 该浏览器已被从设置里删掉）一律返回 `null`，
 * 调用方据此回落到系统默认浏览器——**静默回落，不报错**：
 * 用户的意图是「打开这个网址」，不是「打开那个浏览器」，
 * 为此弹一句「找不到指定的浏览器」纯属干扰。
 */
export function resolveUrlBrowser(
  browserId: string | null | undefined,
  browsers: BrowserEntry[] | undefined | null
): BrowserEntry | null {
  if (!browserId || !Array.isArray(browsers)) return null
  return browsers.find(browser => browser.id === browserId) ?? null
}
