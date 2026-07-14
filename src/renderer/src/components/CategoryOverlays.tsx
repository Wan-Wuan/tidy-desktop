import React from 'react'
import type { Category, Subcategory } from '../../../shared/types'

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

const CATEGORY_ICON_OPTIONS = ['📁', '💼', '🧰', '🎮', '📚', '🖼️', '🎵', '⭐', '🔧', '🌐', '📦', '⚙️']
const SUBCATEGORY_ICON_OPTIONS = ['•', '◦', '▪', '▸', '✓', '★', '◇', '◆', 'A', '1', '📌', '🔖']

export function UndoToast({ label, onUndo, onClose }: {
  label: string
  onUndo: () => void
  onClose: () => void
}) {
  return (
    <div className="glass fixed bottom-16 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-200/80 px-4 py-3 text-sm shadow-xl shadow-slate-900/12 backdrop-blur-md">
      <div>
        <div className="font-semibold text-slate-800">可以撤销：{label}</div>
        <div className="mt-0.5 text-xs text-slate-500">将恢复应用、分类和子分类到操作前状态。</div>
      </div>
      <button onClick={onUndo} className="focus-ring cursor-pointer rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600">
        撤销
      </button>
      <button onClick={onClose} className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100">
        关闭
      </button>
    </div>
  )
}

export function CategoryContextMenuOverlay({
  menu,
  categories,
  subcategories,
  onCreateCategory,
  onSelectCategory,
  onRenameCategory,
  onAddSubcategory,
  onDeleteCategory,
  onLocateSubcategory,
  onRenameSubcategory,
  onDeleteSubcategory
}: {
  menu: CategoryContextMenu
  categories: Category[]
  subcategories: Subcategory[]
  onCreateCategory: () => void
  onSelectCategory: (category: Category) => void
  onRenameCategory: (category: Category) => void
  onAddSubcategory: (category: Category) => void
  onDeleteCategory: (category: Category) => void
  onLocateSubcategory: (subcategory: Subcategory) => void
  onRenameSubcategory: (subcategory: Subcategory) => void
  onDeleteSubcategory: (subcategory: Subcategory) => void
}) {
  const itemClass = 'w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-brand-600 hover:text-white'
  const dangerClass = 'w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-500 hover:text-white'
  const category = menu.type === 'category' ? categories.find(item => item.id === menu.id) : null
  const subcategory = menu.type === 'subcategory' ? subcategories.find(item => item.id === menu.id) : null
  if ((menu.type === 'category' && !category) || (menu.type === 'subcategory' && !subcategory)) return null

  return (
    <div
      className="fixed z-[70] w-44 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl shadow-slate-900/15 backdrop-blur-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {menu.type === 'all' && <button onClick={onCreateCategory} className={itemClass}>新建分类</button>}
      {category && (
        <>
          <button onClick={() => onSelectCategory(category)} className={itemClass}>切换到此分类</button>
          <button onClick={() => onRenameCategory(category)} className={itemClass}>重命名分类</button>
          <button onClick={() => onAddSubcategory(category)} className={itemClass}>添加子分类</button>
          <div className="my-1 h-px bg-slate-100" />
          <button onClick={() => onDeleteCategory(category)} className={dangerClass}>删除分类</button>
        </>
      )}
      {subcategory && (
        <>
          <button onClick={() => onLocateSubcategory(subcategory)} className={itemClass}>定位子分类</button>
          <button onClick={() => onRenameSubcategory(subcategory)} className={itemClass}>重命名子分类</button>
          <div className="my-1 h-px bg-slate-100" />
          <button onClick={() => onDeleteSubcategory(subcategory)} className={dangerClass}>删除子分类</button>
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
  const baseIconOptions = dialog.type === 'create-category' || dialog.type === 'rename-category'
    ? CATEGORY_ICON_OPTIONS
    : SUBCATEGORY_ICON_OPTIONS
  const iconOptions = dialog.icon && !baseIconOptions.includes(dialog.icon)
    ? [dialog.icon, ...baseIconOptions]
    : baseIconOptions

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
            <select
              id="category-edit-icon"
              value={dialog.icon}
              onChange={event => onChange({ ...dialog, icon: event.target.value })}
              onKeyDown={event => {
                if (event.key === 'Enter') onSubmit()
                if (event.key === 'Escape') onClose()
              }}
              className="focus-ring mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-400"
            >
              {iconOptions.map(icon => <option key={icon} value={icon}>{icon}</option>)}
            </select>
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
          删除{targetLabel}“{dialog.name}”？
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
              <span className="mt-0.5 block text-xs text-slate-600">移到“全部”，应用和快捷方式不会被删除</span>
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
