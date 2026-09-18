import type { AppItem } from '../../../shared/types'

export type SortMode = 'manual' | 'name' | 'launchCount' | 'recent'

/**
 * 纯函数版的应用展示排序，语义与原 App 内的 useCallback 完全一致：
 * - manual 直接返回原数组（同一引用，不拷贝），调用方据此判断是否需要刷新；
 * - 其余模式一律先浅拷贝再排序，绝不原地修改入参。
 * 并列时的次序由 localeCompare / 减法比较保持原数组顺序（稳定）。
 */
export function sortAppsForDisplay(list: AppItem[], sortMode: SortMode = 'manual'): AppItem[] {
  if (sortMode === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  if (sortMode === 'launchCount') return [...list].sort((a, b) => (b.launchCount || 0) - (a.launchCount || 0))
  if (sortMode === 'recent') return [...list].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
  return list
}
