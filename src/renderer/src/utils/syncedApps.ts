import type { AppItem, Category, FolderSyncSnapshot } from '../../../shared/types'
import { getPinyin, getFirstLetter } from './pinyin'
import { syncedAppId } from './syncedId'

/**
 * 把「分类 + 关联文件夹快照」铺平成 `AppItem` 形状。
 *
 * **两个窗口共用这一份实现**（主窗口的 `useFolderSync`、搜索窗的 `SearchApp`）。
 * 理由和 `launchAppTarget` 一样：同一个东西在两处各算一遍，迟早会算得不一样——
 * 表现就是"主界面里有的条目，搜索框搜不到"（或者反过来），而且两边单测都过。
 *
 * 输入刻意只有三样：
 *   · `categories` —— 提供绑定关系与**用户意图**（`hiddenPaths`）；
 *   · `snapshots` —— 主进程扫描结果（`folderCache.json` + `folder-sync-updated`）；
 *   · `iconCache` —— 图标只在内存里（同步项不落盘）。**可选**：
 *     搜索窗拿不到主窗口那份内存缓存，传空即可，条目照常可搜可启动。
 *
 * 扫描失败（`snapshot.error`）时**保留上次结果**由调用方保证——这里只负责
 * "快照里有就铺出来"，`error` 存在时跳过整个分类（避免把过期内容当成现状）。
 */
export function flattenSyncedApps(options: {
  categories: Category[]
  snapshots: Record<string, FolderSyncSnapshot>
  iconCache?: Record<string, string>
}): AppItem[] {
  const { categories, snapshots, iconCache } = options
  const list: AppItem[] = []

  for (const category of categories) {
    const link = category.linkFolder
    if (!link) continue

    const snapshot = snapshots[category.id]
    // 目录丢失 / 无权限时保留上次结果由上层决定；这里拿到 error 快照就直接跳过，
    // 否则会把"已经读不到了"的旧条目继续当成有效项目展示出来。
    if (!snapshot || snapshot.error) continue

    const hidden = new Set((link.hiddenPaths ?? []).map(item => item.toLowerCase()))
    for (const entry of snapshot.entries) {
      if (entry.hidden || hidden.has(entry.path.toLowerCase())) continue
      list.push({
        id: syncedAppId(category.id, entry.path),
        name: entry.name,
        path: entry.path,
        icon: iconCache?.[entry.path] || '',
        categoryId: category.id,
        subcategoryId: null,
        pinyin: getPinyin(entry.name),
        firstLetter: getFirstLetter(entry.name),
        type: entry.type,
        isSynced: true,
        sourceFolder: snapshot.path
      })
    }
  }

  return list
}
