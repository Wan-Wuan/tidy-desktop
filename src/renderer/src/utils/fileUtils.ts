/**
 * 文件/路径处理工具函数
 */

export interface FileWithPath extends File {
  path: string
}

const EXEC_EXTS = ['.exe', '.lnk', '.msi', '.bat', '.cmd', '.vbs', '.ps1']
const DOC_EXTS = ['.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.txt', '.rtf', '.csv']
const ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']
const MEDIA_EXTS = ['.mp3', '.mp4', '.wav', '.avi', '.mkv', '.flv', '.wmv', '.mov', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg']

export const ALL_FILE_EXTS = [...EXEC_EXTS, ...DOC_EXTS, ...ARCHIVE_EXTS, ...MEDIA_EXTS]

export const EXEC_EXTS_SET = new Set(EXEC_EXTS)
export const DOC_EXTS_SET = new Set(DOC_EXTS)
export const ARCHIVE_EXTS_SET = new Set(ARCHIVE_EXTS)
export const MEDIA_EXTS_SET = new Set(MEDIA_EXTS)

/**
 * 从文件路径中提取文件名（去掉扩展名）
 */
export function getFileNameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  const fileName = parts[parts.length - 1] || ''
  return fileName.replace(/\.exe$/i, '').replace(/\.lnk$/i, '')
}

/**
 * 获取文件夹名称
 */
export function getFolderName(folderPath: string, defaultName = '文件夹'): string {
  const parts = folderPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || defaultName
}
