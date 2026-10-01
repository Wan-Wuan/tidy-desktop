import React, { useState } from 'react'
import type { AppItem, BrowserEntry, Category, Subcategory } from '../../../shared/types'
import { handleMenuArrowNav } from '../utils/menuA11y'
import { CategoryIcon } from './CategoryIcon'

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
  browsers,
  onOpen,
  onOpenAsAdmin,
  onOpenWithSystem,
  onLocate,
  onCopyPath,
  onCopyLink,
  onOpenWithBrowser,
  onMoveTo,
  onHide,
  onHideInFolder,
  onEdit,
  onDelete,
  onClose,
  collectionName,
  onRemoveFromCollection
}: {
  menu: AppContextMenuState
  categories: Category[]
  subcategories: Subcategory[]
  /** 可用于打开网址的浏览器列表（Config.browsers），空数组则不显示"用其它浏览器打开" */
  browsers: BrowserEntry[]
  onOpen: (app: AppItem) => void
  onOpenAsAdmin: (app: AppItem) => void
  /** 忽略「用指定程序打开」，强制走系统关联程序 */
  onOpenWithSystem: (app: AppItem) => void
  onLocate: (app: AppItem) => void
  onCopyPath: (app: AppItem) => void
  onCopyLink: (app: AppItem) => void
  onOpenWithBrowser: (app: AppItem, browserId: string) => void
  onMoveTo: (app: AppItem, target: MoveTarget) => void
  onHide: (app: AppItem) => void
  /** 关联文件夹同步产生的条目：不在分类里隐藏，而是在该文件夹里隐藏 */
  onHideInFolder: (app: AppItem) => void
  onEdit: (app: AppItem) => void
  onDelete: (app: AppItem) => void
  onClose: () => void
  /** 这张卡当前所在的收纳格名字；不在任何收纳格里时为 null，此时不显示「移出收纳格」 */
  collectionName: string | null
  onRemoveFromCollection: (app: AppItem) => void
}) {
  const [moveOpen, setMoveOpen] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const { app } = menu
  const isCurrentCategory = (categoryId: string) => app.categoryId === categoryId
  const isCurrentSubcategory = (subId: string) => app.subcategoryId === subId

  const isUrl = app.type === 'url'
  const isNote = app.type === 'note'
  const isGroup = app.type === 'group'
  /** 有真实本地路径的类型——"打开所在位置""复制路径"只对它们有意义 */
  const hasLocalPath = !isUrl && !isNote && !isGroup
  const isSynced = app.isSynced === true
  /* 配了「用指定程序打开」才需要「用系统默认方式打开」这条临时绕过的路：
     没配的话它和上面的「打开」是同一件事，多一条纯属噪音。 */
  const hasOpenWith = !!app.openWith?.command
  /* 指定浏览器：只有一个浏览器时不显示子菜单，直接内联成两项也没必要——
     列表为空（还没配）或只有一个（没得选）都隐藏。 */
  const showBrowserPicker = isUrl && browsers.length > 1

  return (
    <div
      role="menu"
      aria-label={`项目操作：${app.name}`}
      className="fixed z-[70] w-52 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl shadow-slate-900/15 backdrop-blur-md"
      style={{ left: menu.x, top: menu.y }}
      /* 上下方向键在菜单项之间循环。菜单项较多（含"移动到分类"展开后的长列表），
         纯靠 Tab 逐个走很累；这是 role="menu" 应有的基本键盘行为。 */
      onKeyDown={handleMenuArrowNav}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <button role="menuitem" onClick={() => { onClose(); onOpen(app) }} className={itemClass}>
        {isGroup ? '启动全部' : isNote ? '查看' : '打开'}
      </button>
      {app.type === 'app' && (
        <button role="menuitem" onClick={() => { onClose(); onOpenAsAdmin(app) }} className={itemClass}>以管理员身份运行</button>
      )}
      {hasOpenWith && (
        <button
          role="menuitem"
          onClick={() => { onClose(); onOpenWithSystem(app) }}
          className={itemClass}
          title={app.openWith?.command}
        >
          用系统默认方式打开
        </button>
      )}
      {isUrl && (
        <button role="menuitem" onClick={() => { onClose(); onCopyLink(app) }} className={itemClass}>复制链接</button>
      )}
      {isNote && (
        <button role="menuitem" onClick={() => { onClose(); onCopyLink(app) }} className={itemClass}>复制内容</button>
      )}
      {isUrl && showBrowserPicker && (
        <>
          <button
            role="menuitem"
            onClick={() => setBrowserOpen(open => !open)}
            aria-expanded={browserOpen}
            className={itemClass}
          >
            用其它浏览器打开 {browserOpen ? '▾' : '▸'}
          </button>
          {browserOpen && (
            <div
              role="group"
              aria-label="用其它浏览器打开"
              className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-1"
            >
              {browsers.map(browser => (
                <button
                  key={browser.id}
                  role="menuitem"
                  onClick={() => { onClose(); onOpenWithBrowser(app, browser.id) }}
                  className={moveItemClass}
                  title={browser.path}
                >
                  {browser.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {hasLocalPath && (
        <>
          <button role="menuitem" onClick={() => { onClose(); onLocate(app) }} className={itemClass}>打开所在位置</button>
          <button role="menuitem" onClick={() => { onClose(); onCopyPath(app) }} className={itemClass}>复制路径</button>
        </>
      )}

      <div className="my-1 h-px bg-slate-100" />

      {categories.length > 0 && (
        <>
          <button
            role="menuitem"
            onClick={() => setMoveOpen(open => !open)}
            aria-expanded={moveOpen}
            className={itemClass}
          >
            移动到分类 {moveOpen ? '▾' : '▸'}
          </button>
          {moveOpen && (
            <div
              role="group"
              aria-label="移动到分类"
              className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-1"
            >
              {app.categoryId && (
                <button role="menuitem" onClick={() => { onClose(); onMoveTo(app, { type: 'none' }) }} className={moveItemClass}>
                  ✳ 未分类
                </button>
              )}
              {categories.map(category => {
                const catSubs = subcategories.filter(sub => sub.parentId === category.id)
                return (
                  <div key={category.id}>
                    <button
                      role="menuitem"
                      onClick={() => { onClose(); onMoveTo(app, { type: 'category', id: category.id }) }}
                      className={moveItemClass}
                      title={isCurrentCategory(category.id) ? '当前分类' : undefined}
                    >
                      {isCurrentCategory(category.id) && !app.subcategoryId ? '✓ ' : ''}<CategoryIcon icon={category.icon} size={14} className="shrink-0" /> {category.name}
                    </button>
                    {catSubs.map(sub => (
                      <button
                        key={sub.id}
                        role="menuitem"
                        onClick={() => { onClose(); onMoveTo(app, { type: 'subcategory', id: sub.id }) }}
                        className={`${moveItemClass} pl-5`}
                      >
                        {isCurrentSubcategory(sub.id) ? '✓ ' : ''}<CategoryIcon icon={sub.icon} size={14} className="shrink-0" /> {sub.name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* 卡片一旦被拖进收纳格，就没有别的路能出来了（拖到另一个收纳格只是换个格子，
          删掉收纳格又会连格一起没）。这条菜单项是唯一的"放回去"出口。
          收纳格名放进 title：菜单是固定宽度，名字一长就会被截断成半个字。 */}
      {collectionName && (
        <button
          role="menuitem"
          onClick={() => { onClose(); onRemoveFromCollection(app) }}
          className={itemClass}
          title={`移出收纳格「${collectionName}」`}
        >
          移出收纳格
        </button>
      )}

      <button role="menuitem" onClick={() => { onClose(); onHide(app) }} className={itemClass}>在搜索中隐藏</button>
      {/* 同步条目是只读的：改它没有意义（下次同步就被覆盖），能做的只有"在这个文件夹里不显示" */}
      {isSynced ? (
        <button role="menuitem" onClick={() => { onClose(); onHideInFolder(app) }} className={itemClass}>在文件夹中隐藏</button>
      ) : (
        <button role="menuitem" onClick={() => { onClose(); onEdit(app) }} className={itemClass}>编辑…</button>
      )}

      <div className="my-1 h-px bg-slate-100" />
      <button role="menuitem" onClick={() => { onClose(); onDelete(app) }} className={dangerClass}>删除</button>
    </div>
  )
}
