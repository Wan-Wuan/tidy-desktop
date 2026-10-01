import React from 'react'
import { ArrowUUpLeft, X } from '@phosphor-icons/react'
import type { Category, Subcategory } from '../../../shared/types'
import { handleMenuArrowNav } from '../utils/menuA11y'
import { CategoryIconPicker } from './CategoryIconPicker'

export type CategoryContextMenuTarget =
  | { type: 'all' }
  | { type: 'category'; id: string }
  | { type: 'subcategory'; id: string }

export type CategoryContextMenu = CategoryContextMenuTarget & { x: number; y: number }

export type CategoryEditDialog =
  | { type: 'create-category'; title: string; name: string; icon: string }
  | { type: 'rename-category'; title: string; id: string; name: string; icon: string }
  | { type: 'add-subcategory'; title: string; parentId: string; name: string; icon: string }
  | { type: 'rename-subcategory'; title: string; id: string; name: string; icon: string }

export type CategoryDeleteDialog = {
  type: 'category' | 'subcategory'
  id: string
  name: string
  appCount: number
}

export function UndoToast({ label, onUndo, onClose }: {
  label: string
  onUndo: () => void
  onClose: () => void
}) {
  return (
    <div className="glass toast-enter-up fixed bottom-16 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-200/70 px-4 py-3 shadow-xl shadow-emerald-500/10">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600"
        aria-hidden="true"
      >
        <ArrowUUpLeft size={16} weight="bold" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">可以撤销：{label}</div>
        {/* 文案刻意不写死「应用、分类和子分类」：批量删除只动应用，
            照搬那句会让人以为连分类一起被删了。 */}
        <div className="mt-0.5 text-xs text-slate-500">将恢复到操作前的状态。</div>
      </div>
      <div className="ml-1 flex shrink-0 items-center gap-1.5">
        <button
          onClick={onUndo}
          className="focus-ring cursor-pointer rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/25 transition-colors hover:bg-emerald-800"
        >
          撤销
        </button>
        <button
          onClick={onClose}
          aria-label="关闭撤销提示"
          title="关闭"
          className="focus-ring inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
        >
          <X size={15} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function CategoryContextMenuOverlay({
  menu,
  categories,
  subcategories,
  onCreateCategory,
  onManageCategories,
  onSelectCategory,
  onRenameCategory,
  onAddSubcategory,
  onDeleteCategory,
  onLocateSubcategory,
  onRenameSubcategory,
  onMoveSubcategory,
  onDeleteSubcategory,
  onBindFolder,
  onResyncFolder,
  onUnbindFolder
}: {
  menu: CategoryContextMenu
  categories: Category[]
  subcategories: Subcategory[]
  onCreateCategory: () => void
  /** 打开「管理分类」弹窗（图标 / 名称 / 外观 / 关联文件夹） */
  onManageCategories: () => void
  onSelectCategory: (category: Category) => void
  onRenameCategory: (category: Category) => void
  onAddSubcategory: (category: Category) => void
  onDeleteCategory: (category: Category) => void
  onLocateSubcategory: (subcategory: Subcategory) => void
  onRenameSubcategory: (subcategory: Subcategory) => void
  /** 把子分类改挂到另一个分类下（目标分类 id） */
  onMoveSubcategory: (subcategory: Subcategory, parentId: string) => void
  onDeleteSubcategory: (subcategory: Subcategory) => void
  /** 绑定 / 更换关联文件夹（弹目录选择器） */
  onBindFolder: (category: Category) => void
  onResyncFolder: (category: Category) => void
  onUnbindFolder: (category: Category) => void
}) {
  // focus-ring 是补上的：这个菜单以前没有它，键盘 Tab 过来完全看不出焦点在哪
  const itemClass = 'focus-ring w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-brand-600 hover:text-white'
  const dangerClass = 'focus-ring w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-500 hover:text-white'
  const category = menu.type === 'category' ? categories.find(item => item.id === menu.id) : null
  const subcategory = menu.type === 'subcategory' ? subcategories.find(item => item.id === menu.id) : null
  /* 「移动到其他分类」的二级列表。菜单每次打开都是重新挂载（父层按 categoryContextMenu
     是否为空条件渲染），所以这里不需要在 menu 变化时手动复位。 */
  const [movePickerOpen, setMovePickerOpen] = React.useState(false)
  if ((menu.type === 'category' && !category) || (menu.type === 'subcategory' && !subcategory)) return null

  /* 子分类只能挂在某个分类下（`parentId === null` 的子分类在任何分类下都不渲染，
     等于凭空消失），所以候选里排除它当前所属的那个，也不提供"不归属分类"这个选项。 */
  const moveTargets = subcategory ? categories.filter(item => item.id !== subcategory.parentId) : []

  return (
    <div
      role="menu"
      aria-label={
        category ? `分类操作：${category.name}`
          : subcategory ? `子分类操作：${subcategory.name}`
            : '分类导航操作'
      }
      className="fixed z-[70] w-44 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl shadow-slate-900/15 backdrop-blur-md"
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={handleMenuArrowNav}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {menu.type === 'all' && (
        <>
          <button onClick={onCreateCategory} role="menuitem" className={itemClass}>新建分类</button>
          <button onClick={onManageCategories} role="menuitem" className={itemClass}>管理分类…</button>
        </>
      )}
      {category && (
        <>
          <button onClick={() => onSelectCategory(category)} role="menuitem" className={itemClass}>切换到此分类</button>
          <button onClick={() => onRenameCategory(category)} role="menuitem" className={itemClass}>重命名分类</button>
          <button onClick={() => onAddSubcategory(category)} role="menuitem" className={itemClass}>添加子分类</button>
          <div className="my-1 h-px bg-slate-100" />
          {/* 关联文件夹：绑定后分类内容跟着目录走，同步条目只读（只能隐藏，不能编辑） */}
          <button onClick={() => onBindFolder(category)} role="menuitem" className={itemClass}>
            {category.linkFolder ? '更换关联文件夹…' : '关联文件夹…'}
          </button>
          {category.linkFolder && (
            <>
              <button onClick={() => onResyncFolder(category)} role="menuitem" className={itemClass}>立即同步</button>
              <button onClick={() => onUnbindFolder(category)} role="menuitem" className={itemClass}>解除关联</button>
            </>
          )}
          <div className="my-1 h-px bg-slate-100" />
          <button onClick={() => onDeleteCategory(category)} role="menuitem" className={dangerClass}>删除分类</button>
        </>
      )}
      {subcategory && !movePickerOpen && (
        <>
          <button onClick={() => onLocateSubcategory(subcategory)} role="menuitem" className={itemClass}>定位子分类</button>
          <button onClick={() => onRenameSubcategory(subcategory)} role="menuitem" className={itemClass}>重命名子分类</button>
          {/* 改挂到别的分类下。以前只有已删除的 SubcategoryManagerModal 能改，
              而删掉再重建会让这个子分类下的项目丢掉归属，所以必须留一条路。 */}
          <button
            onClick={() => setMovePickerOpen(true)}
            role="menuitem"
            className={itemClass}
            disabled={moveTargets.length === 0}
          >
            移动到其他分类…
          </button>
          <div className="my-1 h-px bg-slate-100" />
          <button onClick={() => onDeleteSubcategory(subcategory)} role="menuitem" className={dangerClass}>删除子分类</button>
        </>
      )}
      {subcategory && movePickerOpen && (
        <>
          <div className="px-3 pb-1 pt-0.5 text-xs text-slate-400">移到分类</div>
          {moveTargets.map(target => (
            <button
              key={target.id}
              onClick={() => onMoveSubcategory(subcategory, target.id)}
              role="menuitem"
              className={itemClass}
            >
              {target.name}
            </button>
          ))}
          <div className="my-1 h-px bg-slate-100" />
          <button onClick={() => setMovePickerOpen(false)} role="menuitem" className={itemClass}>返回</button>
        </>
      )}
    </div>
  )
}

export function CategoryEditDialogOverlay({ dialog, onChange, onClose, onSubmit }: {
  dialog: CategoryEditDialog
  onChange: (dialog: CategoryEditDialog) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="w-[360px] rounded-2xl border border-brand-100/80 bg-white/95 p-5 shadow-2xl shadow-slate-900/15" onMouseDown={event => event.stopPropagation()}>
        <h3 className="text-base font-display font-bold text-slate-800">{dialog.title}</h3>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">名称</span>
            <input
              id="category-edit-name"
              value={dialog.name}
              onChange={event => onChange({ ...dialog, name: event.target.value })}
              onKeyDown={event => {
                if (event.key === 'Enter') onSubmit()
                if (event.key === 'Escape') onClose()
              }}
              autoFocus
              className="focus-ring mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">图标</span>
            <div className="mt-1">
              <CategoryIconPicker
                icon={dialog.icon}
                onChange={(icon) => onChange({ ...dialog, icon })}
              />
            </div>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">取消</button>
          <button onClick={onSubmit} disabled={!dialog.name.trim()} className="focus-ring cursor-pointer rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">保存</button>
        </div>
      </div>
    </div>
  )
}

export function CategoryDeleteDialogOverlay({ dialog, onClose, onConfirm }: {
  dialog: CategoryDeleteDialog
  onClose: () => void
  onConfirm: (keepApps: boolean) => void
}) {
  const targetLabel = dialog.type === 'category' ? '分类' : '子分类'

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/40 px-5 backdrop-blur-sm"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-delete-title"
        className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <h3 id="category-delete-title" className="text-base font-display font-bold text-slate-800">
          删除{targetLabel}「{dialog.name}」？
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {dialog.appCount > 0
            ? `其中有 ${dialog.appCount} 个应用，请选择如何处理。`
            : `该${targetLabel}中没有应用，仅删除${targetLabel}本身。`}
        </p>

        <div className="mt-5 space-y-2">
          {dialog.appCount > 0 && (
            <button
              type="button"
              autoFocus
              onClick={() => onConfirm(true)}
              className="focus-ring w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-100"
            >
              <span className="block text-sm font-semibold text-brand-700">保留应用</span>
              <span className="mt-0.5 block text-xs text-slate-600">保留项目并回到「全部」视图，应用与快捷方式不会被删除</span>
            </button>
          )}
          <button
            type="button"
            autoFocus={dialog.appCount === 0}
            onClick={() => onConfirm(false)}
            className="focus-ring w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left transition-colors hover:border-red-400 hover:bg-red-100"
          >
            <span className="block text-sm font-semibold text-red-700">
              {dialog.appCount > 0 ? `删除${targetLabel}和 ${dialog.appCount} 个应用` : `删除${targetLabel}`}
            </span>
            <span className="mt-0.5 block text-xs text-red-600">
              {dialog.appCount > 0 ? '仅从 Tidy Desktop 移除，不会删除磁盘中的程序' : `仅删除这个${targetLabel}`}
            </span>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
