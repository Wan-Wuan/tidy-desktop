import React from 'react'
import type { Category } from '../../../shared/types'

interface SelectionBarProps {
  selectedAppIds: string[]
  batchMoveToCategory: (categoryId: string) => void | Promise<void>
  categories: Category[]
  batchHideApps: () => void | Promise<void>
  batchDeleteApps: () => void | Promise<void>
  clearAppSelection: () => void
}

// 多选工具条：选中若干应用后固定在底部，支持批量移动 / 隐藏 / 删除。
// 纯展示 + 回调透传，JSX 与原 App 内联实现逐字一致，行为不变。
export function SelectionBar({
  selectedAppIds,
  batchMoveToCategory,
  categories,
  batchHideApps,
  batchDeleteApps,
  clearAppSelection
}: SelectionBarProps) {
  if (selectedAppIds.length === 0) return null
  return (
    <div className="glass fixed bottom-16 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-brand-200/80 px-4 py-2.5 shadow-xl">
      <span className="text-sm font-semibold text-slate-800">已选 {selectedAppIds.length} 项</span>
      <select
        value=""
        onChange={e => { if (e.target.value) void batchMoveToCategory(e.target.value) }}
        aria-label="批量移动到分类"
        className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
      >
        <option value="">移动到分类…</option>
        {categories.map(category => (
          <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
        ))}
      </select>
      <button
        onClick={() => void batchHideApps()}
        className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
      >
        隐藏
      </button>
      <button
        onClick={() => void batchDeleteApps()}
        className="focus-ring cursor-pointer rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
      >
        删除
      </button>
      <button
        onClick={clearAppSelection}
        aria-label="取消选择"
        className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
      >
        取消
      </button>
    </div>
  )
}
