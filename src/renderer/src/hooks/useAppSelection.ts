import { useMemo, useRef, useState } from 'react'

/**
 * 多选状态：哪些卡片被选中、选中集合（用于 AppCard 的 O(1) 命中判定）、
 * 框选时的「锚点」索引，以及一键清空。
 *
 * 这里只搬「状态本身」。批量操作（batchMoveToCategory / batchHideApps /
 * batchDeleteApps）还依赖 appsRef、captureUndoSnapshot、维护模块的提示等，
 * 牵扯到更晚才初始化的依赖；它们留在 App.tsx 里直接复用下面解构出来的同名变量，
 * 行为完全一致，避免再引入一套 ref 转发。
 */
export function useAppSelection() {
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([])
  const lastClickedIndexRef = useRef<number | null>(null)

  // 选中判定走 Set：原来是 selectedAppIds.includes()，每张卡片各扫一遍整体 O(n²)。
  const selectedAppIdSet = useMemo(() => new Set(selectedAppIds), [selectedAppIds])

  const clearAppSelection = () => setSelectedAppIds([])

  return {
    selectedAppIds,
    setSelectedAppIds,
    selectedAppIdSet,
    lastClickedIndexRef,
    clearAppSelection
  }
}
