/**
 * 共享工具函数
 */

export interface SteamParseResult {
  steamUrl: string
  appId: string
}

/**
 * 从文本中解析 Steam URL
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

/**
 * 检查是否为文件夹路径
 */
export function isFolderPath(query: string): boolean {
  const trimmed = query.trim()
  if (/^[A-Za-z]:\\/.test(trimmed) || /^[A-Za-z]:\//.test(trimmed)) return true
  if (trimmed.startsWith('\\\\')) return true
  if (trimmed.startsWith('/') && trimmed.length > 1) return true
  return false
}

/**
 * 获取文件夹建议
 */
export function getFolderSuggestion(query: string): { id: string; name: string; path: string; icon: string; categoryId: string; subcategoryId: null; pinyin: string; firstLetter: string; type: 'folder' } | null {
  const trimmed = query.trim()
  if (!isFolderPath(trimmed)) return null
  const folderName = trimmed.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || trimmed
  return {
    id: '__folder_path__',
    name: `打开文件夹: ${folderName}`,
    path: trimmed,
    icon: '',
    categoryId: '',
    subcategoryId: null,
    pinyin: '',
    firstLetter: '',
    type: 'folder'
  }
}

/**
 * 检查是否为搜索引擎关键词
 */
export function checkSearchEngine(
  input: string,
  searchEngines: Record<string, { name: string; url: string }>
): { isEngine: boolean; engine?: { key: string; name: string; url: string } } {
  const trimmed = input.trimEnd()
  for (const [key, engine] of Object.entries(searchEngines)) {
    const aliases = [key, engine.name.toLowerCase()]
    if (key === 'b') aliases.push('bing')
    if (key === 'g') aliases.push('google')
    if (key === 'bd') aliases.push('baidu')
    if (aliases.includes(trimmed.toLowerCase())) {
      return { isEngine: true, engine: { key, name: engine.name, url: engine.url } }
    }
  }
  return { isEngine: false }
}

/**
 * 文档文件扩展名
 */
export const DOC_FILE_EXTS = ['.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.txt', '.rtf', '.csv']

/**
 * 图片文件扩展名
 */
export const IMAGE_FILE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif']

/**
 * 判断 AppItem 是否为图片文件
 */
export function isImageFile(app: { type?: string; path: string }): boolean {
  if (app.type !== 'app') return false
  const ext = app.path.toLowerCase().substring(app.path.lastIndexOf('.'))
  return IMAGE_FILE_EXTS.includes(ext)
}
