/**
 * 图标处理工具函数
 */

/**
 * 判断图标是否需要更新
 * @param icon 当前图标（data URL 或空字符串）
 * @returns true 如果需要重新提取图标
 */
export function needsIconUpdate(icon: string): boolean {
  if (!icon) return true
  if (!icon.startsWith('data:')) return true
  // data:image 的有效图标通常 > 200 字节
  if (icon.length < 200) return true
  return false
}
