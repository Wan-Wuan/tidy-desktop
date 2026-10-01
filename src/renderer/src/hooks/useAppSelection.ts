import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * 多选状态：哪些卡片被选中、选中集合（用于 AppCard 的 O(1) 命中判定）、
 * 框选时的「锚点」索引，以及一键清空 / 全选切换。
 *
 * 这里只持有「状态本身」；批量操作（归类 / 隐藏 / 恢复 / 删除）在 useAppCrud 里，
 * 它们读下面解构出去的 selectedAppIds，行为与 App.tsx 内联时代一致。
 */
export function useAppSelection() {
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([])
  const lastClickedIndexRef = useRef<number | null>(null)

  // 选中判定走 Set：原来是 selectedAppIds.includes()，每张卡片各扫一遍整体 O(n²)。
  const selectedAppIdSet = useMemo(() => new Set(selectedAppIds), [selectedAppIds])

  const clearAppSelection = useCallback(() => setSelectedAppIds([]), [])

  /**
   * 全选 / 反选：传入「当前可见」的应用 id 列表。
   * 已经全选时再点一次即清空，符合工具条上那个按钮的直觉。
   * 用 Set 做包含判定，避免在几百个应用上跑 O(n²)。
   */
  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedAppIds(prev => {
      const prevSet = new Set(prev)
      const allSelected = ids.length > 0 && ids.length === prev.length && ids.every(id => prevSet.has(id))
      return allSelected ? [] : ids
    })
  }, [])

  return {
    selectedAppIds,
    setSelectedAppIds,
    selectedAppIdSet,
    lastClickedIndexRef,
    clearAppSelection,
    toggleSelectAll
  }
}
