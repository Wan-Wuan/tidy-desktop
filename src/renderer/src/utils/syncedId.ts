const PREFIX = 'synced:'

/**
 * 关联文件夹同步产生的条目需要一个稳定的 React key / DOM `data-app-id`。
 *
 * 用「分类 id + 绝对路径」而不是随机 uuid：同步项不落盘（只驻留内存 +
 * folderCache.json），每次扫描都要重建，随机 id 会让 React 每次都当作新节点
 * 整批重挂载——图标闪、拖拽状态丢。路径是天然稳定的身份。
 *
 * 分类 id 是 uuid（不含冒号），所以用**第一个**冒号切分是安全的，
 * 后面的路径里带 `D:\…` 这种冒号不受影响。
 */
export function syncedAppId(categoryId: string, entryPath: string): string {
  return `${PREFIX}${categoryId}:${entryPath}`
}

export function isSyncedAppId(id: string): boolean {
  return id.startsWith(PREFIX)
}

export function parseSyncedAppId(id: string): { categoryId: string; path: string } | null {
  if (!isSyncedAppId(id)) return null
  const rest = id.slice(PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator <= 0) return null
  return { categoryId: rest.slice(0, separator), path: rest.slice(separator + 1) }
}
