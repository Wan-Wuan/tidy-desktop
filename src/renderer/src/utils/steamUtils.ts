/**
 * Steam URL parsing utilities (合并两处重复逻辑)
 */

export interface SteamParseResult {
  steamUrl: string
  appId: string
}

/**
 * 从文本中解析 Steam URL，支持多种格式：
 * - steam://launch/<appId>/0
 * - steam://rungameid/<appId>
 * - https://store.steampowered.com/app/<appId>/
 */
export function parseSteamUrl(text: string): SteamParseResult | null {
  const launchMatch = text.match(/steam:\/\/launch\/(\d+)/)
  if (launchMatch) {
    return { steamUrl: `steam://launch/${launchMatch[1]}/0`, appId: launchMatch[1] }
  }
  const storeMatch = text.match(/steampowered\.com\/app\/(\d+)/)
  if (storeMatch) {
    return { steamUrl: `steam://launch/${storeMatch[1]}/0`, appId: storeMatch[1] }
  }
  const runGameMatch = text.match(/steam:\/\/rungameid\/(\d+)/)
  if (runGameMatch) {
    return { steamUrl: `steam://rungameid/${runGameMatch[1]}`, appId: runGameMatch[1] }
  }
  return null
}
