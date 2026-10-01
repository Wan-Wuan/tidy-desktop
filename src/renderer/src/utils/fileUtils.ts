/**
 * 文件/路径处理工具函数
 *
 * ⚠️ 这里**只留路径字符串解析**。文件扩展名分类表（`ALL_FILE_EXTS` / `*_EXTS_SET`）
 * 曾在这里另有一份，与 `shared/utils.ts` 的 `*_FILE_EXTS_SET` 完全重复，
 * 且渲染层真正 import 的一直是 `shared/utils.ts` 那一份——已删除，避免两处表各改一半。
 */

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
