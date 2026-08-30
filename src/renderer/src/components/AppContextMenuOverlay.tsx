import React, { useState } from 'react'
import type { AppItem, Category, Subcategory } from '../../../shared/types'

export type AppContextMenuState = {
  app: AppItem
  x: number
  y: number
}

export type MoveTarget =
  | { type: 'category'; id: string }
  | { type: 'subcategory'; id: string }
  | { type: 'none' }

const itemClass = 'focus-ring w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-brand-600 hover:text-white'
const dangerClass = 'focus-ring w-full rounded-lg px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-500 hover:text-white'
const moveItemClass = 'focus-ring w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-brand-500 hover:text-white'

export function AppContextMenuOverlay({
  menu,
  categories,
  subcategories,
  onOpen,
  onOpenAsAdmin,
  onLocate,
  onCopyPath,
  onMoveTo,
  onHide,
  onEdit,
  onDelete,
  onClose
}: {
  menu: AppContextMenuState
  categories: Category[]
  subcategories: Subcategory[]
  onOpen: (app: AppItem) => void
  onOpenAsAdmin: (app: AppItem) => void
  onLocate: (app: AppItem) => void
  onCopyPath: (app: AppItem) => void
  onMoveTo: (app: AppItem, target: MoveTarget) => void
  onHide: (app: AppItem) => void
  onEdit: (app: AppItem) => void
  onDelete: (app: AppItem) => void
  onClose: () => void
}) {
  const [moveOpen, setMoveOpen] = useState(false)
  const { app } = menu
  const isCurrentCategory = (categoryId: string) => app.categoryId === categoryId
  const isCurrentSubcategory = (subId: string) => app.subcategoryId === subId

  return (
    <div
      role="menu"
      aria-label={`应用操作：${app.name}`}
      className="fixed z-[70] w-52 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl shadow-slate-900/15 backdrop-blur-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <button onClick={() => { onClose(); onOpen(app) }} className={itemClass}>打开</button>
      {app.type === 'app' && (
        <button onClick={() => { onClose(); onOpenAsAdmin(app) }} className={itemClass}>以管理员身份运行</button>
      )}
      <button onClick={() => { onClose(); onLocate(app) }} className={itemClass}>打开所在位置</button>
      <button onClick={() => { onClose(); onCopyPath(app) }} className={itemClass}>复制路径</button>

      <div className="my-1 h-px bg-slate-100" />

      {categories.length > 0 && (
        <>
          <button
            onClick={() => setMoveOpen(open => !open)}
            aria-expanded={moveOpen}
            className={itemClass}
          >
            移动到分类 {moveOpen ? '▾' : '▸'}
          </button>
          {moveOpen && (
            <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-1">
              {app.categoryId && (
                <button onClick={() => { onClose(); onMoveTo(app, { type: 'none' }) }} className={moveItemClass}>
                  ✳ 未分类
                </button>
              )}
              {categories.map(category => {
                const catSubs = subcategories.filter(sub => sub.parentId === category.id)
                return (
                  <div key={category.id}>
                    <button
                      onClick={() => { onClose(); onMoveTo(app, { type: 'category', id: category.id }) }}
                      className={moveItemClass}
                      title={isCurrentCategory(category.id) ? '当前分类' : undefined}
                    >
                      {isCurrentCategory(category.id) && !app.subcategoryId ? '✓ ' : ''}{category.icon} {category.name}
                    </button>
                    {catSubs.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => { onClose(); onMoveTo(app, { type: 'subcategory', id: sub.id }) }}
                        className={`${moveItemClass} pl-5`}
                      >
                        {isCurrentSubcategory(sub.id) ? '✓ ' : ''}{sub.icon} {sub.name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <button onClick={() => { onClose(); onHide(app) }} className={itemClass}>在搜索中隐藏</button>
      <button onClick={() => { onClose(); onEdit(app) }} className={itemClass}>编辑…</button>

      <div className="my-1 h-px bg-slate-100" />
      <button onClick={() => { onClose(); onDelete(app) }} className={dangerClass}>删除</button>
    </div>
  )
}
