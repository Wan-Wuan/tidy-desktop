import React from 'react'
import type { AppItem, Category, Subcategory } from '../../../shared/types'
import type { CategoryContextMenuTarget } from './CategoryOverlays'

// 与 App.tsx 中局部定义的 ParsedDrop 保持一致：解析拖入文件得到的结果。
type ParsedDrop = { apps: AppItem[]; duplicateCount: number; unsupportedCount: number }

interface CategoryNavProps {
  categoryBarRef: React.RefObject<HTMLDivElement>
  activeCategory: string | null
  setActiveCategory: (id: string | null) => void
  openCategoryContextMenu: (e: React.MouseEvent, target: CategoryContextMenuTarget) => void
  categories: Category[]
  subcategories: Subcategory[]
  dragOverCategory: string | null
  setDragOverCategory: (id: string | null) => void
  draggedAppIdRef: React.MutableRefObject<string | null>
  moveDragGhost: (x: number, y: number) => void
  clearDragState: () => void
  handleMoveAppToCategory: (appId: string, categoryId: string) => void | Promise<void>
  getDroppedPathsFromEvent: (dataTransfer: DataTransfer) => string[]
  appsRef: React.MutableRefObject<AppItem[]>
  setApps: (apps: AppItem[]) => void
  /** 落盘封装：检查 saveApps 的 boolean 返回值，失败时提示（见 App.tsx 的 persistApps） */
  persistApps: (apps: AppItem[], hint?: string) => Promise<boolean>
  parsePathsToApps: (filePaths: string[], categoryId: string) => Promise<ParsedDrop>
  extractIconsForApps: (apps: AppItem[]) => void | Promise<void>
  showDropResult: (result: ParsedDrop) => void
  renderSubcategoryButton: (sub: Subcategory) => React.ReactNode
  createCategoryFromMenu: () => void
  addSubcategoryFromMenu: (parentCategory: Category) => void
  subcategoryBarRef: React.RefObject<HTMLDivElement>
  handleSubcategoryWheel: (e: React.WheelEvent<HTMLDivElement>) => void
  displaySubcategories: Subcategory[]
}

// 分类导航：主分类横向栏 +（横向布局时）独立子分类栏。含拖入文件 / 拖应用归类的 drop 处理，
// 与原 App 内联实现逐字一致。renderSubcategoryButton 由 App 透传，保持单一来源。
export function CategoryNav({
  categoryBarRef,
  activeCategory,
  setActiveCategory,
  openCategoryContextMenu,
  categories,
  subcategories,
  dragOverCategory,
  setDragOverCategory,
  draggedAppIdRef,
  moveDragGhost,
  clearDragState,
  handleMoveAppToCategory,
  getDroppedPathsFromEvent,
  appsRef,
  setApps,
  persistApps,
  parsePathsToApps,
  extractIconsForApps,
  showDropResult,
  renderSubcategoryButton,
  createCategoryFromMenu,
  addSubcategoryFromMenu,
  subcategoryBarRef,
  handleSubcategoryWheel,
  displaySubcategories
}: CategoryNavProps) {
  return (
    <>
      <div ref={categoryBarRef} className="category-nav px-5 pt-3 pb-2 flex gap-2 items-start overflow-x-auto">
        <button
          data-active={activeCategory === null}
          aria-current={activeCategory === null ? 'page' : undefined}
          onClick={() => { setActiveCategory(null) }}
          onContextMenu={(e) => openCategoryContextMenu(e, { type: 'all' })}
          className={`focus-ring cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
            activeCategory === null
              ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
              : 'bg-white/60 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600 border border-brand-100/50'
          }`}
        >
          全部
        </button>
        {categories.map(cat => {
          const catSubs = subcategories.filter(s => s.parentId === cat.id)
          const isCatActive = activeCategory === cat.id
          return (
          <div key={cat.id} className="flex flex-col items-stretch gap-1.5 flex-shrink-0">
            <button
              data-category-id={cat.id}
              data-dragover={dragOverCategory === cat.id ? 'true' : undefined}
              data-active={isCatActive}
              aria-current={isCatActive ? 'page' : undefined}
              onClick={() => { setActiveCategory(cat.id) }}
              onContextMenu={(e) => openCategoryContextMenu(e, { type: 'category', id: cat.id })}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                moveDragGhost(e.clientX, e.clientY)
                const appId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
                const hasFiles = e.dataTransfer.types.includes('Files')
                if (appId || hasFiles) {
                  e.dataTransfer.dropEffect = appId ? 'move' : 'copy'
                  setDragOverCategory(cat.id)
                }
              }}
              onDragLeave={() => setDragOverCategory(null)}
              onDrop={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                // 先取出要移动的应用，再统一收尾——拖到别的分类会换分组、
                // 源卡片 DOM 被重建、dragend 丢失，拖完再清就晚了，贴图会留在屏幕上
                const internalAppId = draggedAppIdRef.current
                clearDragState()

                // 优先处理内部拖拽（包括原生拖拽放回应用内的情况）
                if (internalAppId) {
                  await handleMoveAppToCategory(internalAppId, cat.id)
                  return
                }

                const filePaths = getDroppedPathsFromEvent(e.dataTransfer)
                if (filePaths.length > 0) {
                  const result = await parsePathsToApps(filePaths, cat.id)
                  const newApps = result.apps
                  if (newApps.length > 0) {
                    const updatedApps = [...appsRef.current, ...newApps]
                    appsRef.current = updatedApps
                    setApps(updatedApps)
                    await persistApps(updatedApps, '导入')
                    await extractIconsForApps(newApps)
                  }
                  showDropResult(result)
                } else {
                  const appId = e.dataTransfer.getData('text/plain')
                  if (appId) {
                    await handleMoveAppToCategory(appId, cat.id)
                  }
                }
              }}
              className={`focus-ring cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                /* 拖拽悬停的判断必须排在 isCatActive 前面：
                   否则拖到"当前已选中的分类"上时走的是激活分支，不会变绿 */
                dragOverCategory === cat.id
                  ? 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-400/30 ring-2 ring-emerald-300'
                  : isCatActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
                    : 'bg-white/60 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600 border border-brand-100/50'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
            {/* 点击主分类后，子分类列表直接在该主分类下方展开 */}
            {isCatActive && (
              <div className="subcategory-dropdown flex flex-col gap-1">
                {catSubs.map(sub => renderSubcategoryButton(sub))}
                {catSubs.length === 0 && (
                  <span className="px-3 py-1 text-[11px] text-slate-400 whitespace-nowrap">暂无子分类</span>
                )}
              </div>
            )}
          </div>
          )
        })}
        <div className="category-bar-add-buttons flex gap-2 items-center">
          <button
            onClick={createCategoryFromMenu}
            className="focus-ring cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-white/60 text-slate-700 hover:bg-brand-500 hover:text-white transition-colors duration-200 border border-dashed border-brand-200/80 hover:border-brand-500"
          >
            + 分类
          </button>
          <button
            onClick={() => {
              if (categories.length === 0) {
                alert('请先创建一个主分类，然后再添加子分类。')
                return
              }
              const parentCategory = categories.find(category => category.id === activeCategory) || categories[0]
              addSubcategoryFromMenu(parentCategory)
            }}
            className="focus-ring cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-white/60 text-slate-700 hover:bg-brand-500 hover:text-white transition-colors duration-200 border border-dashed border-brand-200/80 hover:border-brand-500"
          >
            + 子分类
          </button>
        </div>
      </div>

      {/* 独立子分类栏：横向工作区布局使用，保持原有样式 */}
      <div
        ref={subcategoryBarRef}
        onWheel={handleSubcategoryWheel}
        className="subcategory-bar-standalone subcategory-nav subcategory-scroll px-5 pb-3 flex gap-2 overflow-x-auto"
      >
        {displaySubcategories.map(sub => renderSubcategoryButton(sub))}
        {activeCategory !== null && displaySubcategories.length === 0 && (
          <span className="self-center text-xs text-slate-400">当前分类暂无子分类，点击上方「+ 子分类」创建</span>
        )}
        <div className="subcategory-bar-add-buttons flex gap-2 items-center ml-1">
          <button
            onClick={createCategoryFromMenu}
            className="focus-ring cursor-pointer px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/60 text-slate-700 hover:bg-brand-500 hover:text-white transition-colors duration-200 border border-dashed border-brand-200/80 hover:border-brand-500"
          >
            + 分类
          </button>
          <button
            onClick={() => {
              if (categories.length === 0) {
                alert('请先创建一个主分类，然后再添加子分类。')
                return
              }
              const parentCategory = categories.find(category => category.id === activeCategory) || categories[0]
              addSubcategoryFromMenu(parentCategory)
            }}
            className="focus-ring cursor-pointer px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/60 text-slate-700 hover:bg-brand-500 hover:text-white transition-colors duration-200 border border-dashed border-brand-200/80 hover:border-brand-500"
          >
            + 子分类
          </button>
        </div>
      </div>
    </>
  )
}
