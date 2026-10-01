import React from 'react'
import { CheckSquare, Eye, EyeSlash, Trash, X } from '@phosphor-icons/react'
import type { Category, Subcategory } from '../../../shared/types'
import { categoryIconGlyph } from '../utils/categoryIcon'

interface SelectionBarProps {
  selectedAppIds: string[]
  categories: Category[]
  /** 当前分类下的子分类；下拉里以「子分类」分组展示 */
  subcategories: Subcategory[]
  /** 当前可见（未隐藏、且属于当前分类）的应用 id，用于全选 */
  visibleAppIds: string[]
  batchMoveToCategory: (categoryId: string) => void | Promise<void>
  batchMoveToSubcategory: (subcategoryId: string, parentCategoryId: string | null) => void | Promise<void>
  batchHideApps: () => void | Promise<void>
  batchRestoreApps: () => void | Promise<void>
  batchDeleteApps: () => void | Promise<void>
  toggleSelectAll: (ids: string[]) => void
  clearAppSelection: () => void
}

/* 按钮样式统一在这里：同一行里 6 个控件，样式散落在 JSX 里必然会漂。
   主次分明——危险动作用实心红，其余用「浅底 + 悬停染色」的胶囊。 */
const chipClass = 'focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-white hover:text-brand-700'
/* 实心红按钮用 red-600 而不是 500：白字压在 #EF4444 上只有 3.76:1，12px 达不到
   WCAG AA；#DC2626 是 4.83:1，过线且仍是明确的危险色。 */
const dangerClass = 'focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-red-500/25 transition-colors hover:bg-red-700'
const iconButtonClass = 'focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-800'
/* 分隔线走 slate-300 而不是 brand-100：brand-100 在深色主题被重映射成深靛
   （49 46 129），画在深色玻璃卡片上等于隐形；slate-300 三个主题都是浅色，
   作为发丝线在任何底色上都能看见。 */
const dividerClass = 'mx-0.5 h-5 w-px shrink-0 bg-slate-300/70'

// 多选工具条：选中若干应用后固定在底部。
// 布局按「计数 → 全选 │ 移动到 │ 动作组 │ 关闭」分区，用细竖线分隔，
// 避免 6 个同尺寸按钮平铺时看不出主次。
export function SelectionBar({
  selectedAppIds,
  categories,
  subcategories,
  visibleAppIds,
  batchMoveToCategory,
  batchMoveToSubcategory,
  batchHideApps,
  batchRestoreApps,
  batchDeleteApps,
  toggleSelectAll,
  clearAppSelection
}: SelectionBarProps) {
  if (selectedAppIds.length === 0) return null

  const selectedSet = new Set(selectedAppIds)
  const allSelected = visibleAppIds.length > 0 && visibleAppIds.every(id => selectedSet.has(id))

  const handleMove = (value: string) => {
    if (!value) return
    if (value.startsWith('sub:')) {
      const subId = value.slice(4)
      const sub = subcategories.find(item => item.id === subId)
      void batchMoveToSubcategory(subId, sub?.parentId ?? null)
      return
    }
    void batchMoveToCategory(value.slice(4))
  }

  return (
    /* ⚠️ 这一行有 6 个 shrink-0 控件，总宽是「硬」的：窗口最小宽 600px
       （src/main/index.ts 的 minWidth），工具条必须挤得进去。
       约束点只有一处：<select> 会按**最长选项**撑宽，分类名一长就能顶到
       208px，所以给它定宽（见下面的 w-[6.5rem]）。

       ⚠️⚠️ `w-max` 不能省，也别换成 max-w —— 这是踩过的坑：
       `fixed` + `left-1/2` + `right:auto` 时，绝对定位的 shrink-to-fit
       可用宽度只有**半屏**（600px 窗口 → 300px），算出来是
       `min(max(min-content, 300), max-content)`。而这排控件的
       min-content（文字可换行）只有 484px、max-content 是 541px，
       于是容器被定成 484px；子元素全是 shrink-0 不肯收，内容就**溢出
       胶囊背景 57px** —— 删除/关闭按钮跑到圆角外面去了。
       显式写 `w-max` 把宽度钉成 max-content，才是这条工具条的真实需求宽度。
       （同理不要加 `max-w`：max-w < max-content 时会退回同一个 min-content 陷阱。） */
    <div className="glass toast-enter-up fixed bottom-16 left-1/2 z-[60] flex w-max -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-brand-200/70 px-3 py-2 shadow-xl shadow-brand-500/10">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-500/25">
        <CheckSquare size={14} weight="fill" aria-hidden="true" />
        已选 {selectedAppIds.length}
      </span>

      <button
        onClick={() => toggleSelectAll(visibleAppIds)}
        className={chipClass}
        title="全选 / 取消全选（Ctrl+A）"
      >
        <CheckSquare size={14} aria-hidden="true" />
        {allSelected ? '取消全选' : '全选'}
      </button>

      <span className={dividerClass} aria-hidden="true" />

      <select
        value=""
        onChange={e => handleMove(e.target.value)}
        aria-label="批量移动到分类或子分类"
        /* shrink-0 + 定宽：不加 shrink-0 的话它会被 flex 压到 60px 上下，
           只剩「移」一个字 + 箭头，等于把标签吃掉。定宽 6.5rem 刚好放得下
           「移动到…」，被选中的分类名本来也不会回填到这个 select 上。 */
        className="focus-ring w-[6.5rem] shrink-0 cursor-pointer rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-colors hover:border-brand-300"
      >
        <option value="">移动到…</option>
        <optgroup label="分类">
          {categories.map(category => (
            <option key={category.id} value={`cat:${category.id}`}>{categoryIconGlyph(category.icon)} {category.name}</option>
          ))}
        </optgroup>
        {subcategories.length > 0 && (
          <optgroup label="子分类">
            {subcategories.map(sub => (
              <option key={sub.id} value={`sub:${sub.id}`}>{categoryIconGlyph(sub.icon)} {sub.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      <span className={dividerClass} aria-hidden="true" />

      <button onClick={() => void batchHideApps()} className={chipClass}>
        <EyeSlash size={14} aria-hidden="true" />
        隐藏
      </button>
      <button onClick={() => void batchRestoreApps()} className={chipClass}>
        <Eye size={14} aria-hidden="true" />
        恢复
      </button>
      <button
        onClick={() => void batchDeleteApps()}
        className={dangerClass}
        title="删除选中项（Delete）"
      >
        <Trash size={14} weight="bold" aria-hidden="true" />
        删除
      </button>

      <span className={dividerClass} aria-hidden="true" />

      <button
        onClick={clearAppSelection}
        aria-label="取消选择"
        title="取消选择（Esc）"
        className={iconButtonClass}
      >
        <X size={15} weight="bold" aria-hidden="true" />
      </button>
    </div>
  )
}
