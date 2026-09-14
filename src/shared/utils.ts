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
export function getFolderSuggestion(query: string): { id: string; name: string; path: string; icon: string; categoryId: string | null; subcategoryId: null; pinyin: string; firstLetter: string; type: 'folder' } | null {
  const trimmed = query.trim()
  if (!isFolderPath(trimmed)) return null
  const folderName = trimmed.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || trimmed
  return {
    id: '__folder_path__',
    name: `打开文件夹: ${folderName}`,
    path: trimmed,
    icon: '',
    categoryId: null,
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

/* ── 文件类型白名单 ──
   全项目唯一来源：拖入添加、图标提取、复制/拖拽按钮都从这里取，
   以前 App.tsx 里另有一份本地副本，加类型时很容易漏改。 */

/** 可执行 / 快捷方式 */
export const EXEC_FILE_EXTS = [
  '.exe', '.lnk', '.msi', '.bat', '.cmd', '.vbs', '.ps1', '.com', '.scr', '.appref-ms', '.url'
]

/** 文档与文本：可一键复制到剪贴板发送 */
export const DOC_FILE_EXTS = [
  // 办公文档
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.ppt', '.pptx', '.rtf', '.csv', '.txt', '.odt', '.ods', '.odp',
  // 标记语言与网页
  '.md', '.markdown', '.mdown', '.html', '.htm', '.xhtml', '.mhtml', '.vue',
  // 数据与配置
  '.json', '.jsonc', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.properties', '.reg',
  // 代码与脚本
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.svelte', '.astro',
  '.py', '.java', '.kt', '.kts', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.scala', '.lua', '.r', '.pl',
  '.sql', '.sh', '.bash', '.zsh', '.fish', '.gradle', '.cmake', '.make', '.mk',
  // 日志 / 纯文本
  '.log', '.tex', '.bib', '.org', '.rst', '.adoc', '.nfo', '.diff', '.patch', '.srt', '.vtt', '.lrc'
]

/** 图片：可直接复制图片内容粘贴，或拖到外部应用 */
export const IMAGE_FILE_EXTS = [
  '.jpg', '.jpeg', '.jpe', '.jfif', '.pjpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
  '.ico', '.tiff', '.tif', '.heic', '.heif', '.avif', '.emf', '.wmf', '.psd', '.sketch'
]

/** 压缩包 */
export const ARCHIVE_FILE_EXTS = [
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.iso', '.cab', '.lz', '.lzma', '.zst'
]

/** 音视频（图片格式已归入 IMAGE_FILE_EXTS，不在此重复） */
export const MEDIA_FILE_EXTS = [
  '.mp3', '.mp4', '.wav', '.avi', '.mkv', '.flv', '.wmv', '.mov', '.m4a', '.m4v',
  '.aac', '.flac', '.ogg', '.oga', '.opus', '.webm', '.mpg', '.mpeg', '.3gp', '.aiff', '.mid', '.midi', '.amr'
]

/** 字体 */
export const FONT_FILE_EXTS = ['.ttf', '.otf', '.woff', '.woff2', '.eot', '.fon']

/** 拖入添加时判定"支持的文件"的全集 */
export const ALL_FILE_EXTS = [
  ...EXEC_FILE_EXTS,
  ...DOC_FILE_EXTS,
  ...IMAGE_FILE_EXTS,
  ...ARCHIVE_FILE_EXTS,
  ...MEDIA_FILE_EXTS,
  ...FONT_FILE_EXTS
]

const extSet = (list: string[]) => new Set(list)

export const EXEC_FILE_EXTS_SET = extSet(EXEC_FILE_EXTS)
export const DOC_FILE_EXTS_SET = extSet(DOC_FILE_EXTS)
export const IMAGE_FILE_EXTS_SET = extSet(IMAGE_FILE_EXTS)
export const ARCHIVE_FILE_EXTS_SET = extSet(ARCHIVE_FILE_EXTS)
export const MEDIA_FILE_EXTS_SET = extSet(MEDIA_FILE_EXTS)
export const FONT_FILE_EXTS_SET = extSet(FONT_FILE_EXTS)
export const ALL_FILE_EXTS_SET = extSet(ALL_FILE_EXTS)

/** 取路径的扩展名（小写，含点）；无扩展名返回空串 */
export function getFileExtension(filePath: string): string {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return ''
  const slash = lower.lastIndexOf('/')
  const backslash = lower.lastIndexOf('\\')
  // 点号出现在路径分隔符之前说明它属于目录名，不是扩展名
  if (dot < slash || dot < backslash) return ''
  return lower.substring(dot)
}

/**
 * 判断 AppItem 是否为图片文件
 */
export function isImageFile(app: { type?: string; path: string }): boolean {
  if (app.type !== 'app') return false
  return IMAGE_FILE_EXTS_SET.has(getFileExtension(app.path))
}
