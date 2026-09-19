import React from 'react'
import { AppCard } from './AppCard'
import type { AppItem, Subcategory, Config } from '../../../shared/types'

interface GroupedApps {
  /** 该分组所属的子分类；null 表示"未归入任何子分类"的那一组 */
  sub: Subcategory | null
  apps: AppItem[]
}

interface AppGridProps {
  dropZoneRef: React.RefObject<HTMLDivElement>
  handleContentScroll: () => void
  activeCategory: string | null
  dragOverGroupSubId: string | null
  groupedApps: GroupedApps[]
  config: Config | null
  draggedAppId: string | null
  dragOverAppId: string | null
  /** 落点在悬停卡片的哪一半：true 插到它后面。仅对当前悬停的那张卡片有意义 */
  dropInsertAfter: boolean | null
  selectedAppIdSet: Set<string>
  cardOnOpen: (e: React.MouseEvent, app: AppItem) => void
  cardOnEdit: (app: AppItem) => void
  cardOnDelete: (app: AppItem) => void
  cardOnSendFile: (app: AppItem) => void
  cardOnMouseDown: (e: React.MouseEvent, app: AppItem) => void
  cardOnContextMenu: (e: React.MouseEvent, app: AppItem) => void
  cardOnKeyDown: (e: React.KeyboardEvent, app: AppItem) => void
  filteredApps: AppItem[]
}

// 主内容区：按子分类分组的卡片网格 + 空状态。纯展示 + 回调透传，
// JSX 与原 App 内联实现逐字一致（含分组容器不加拖拽高亮底色的性能注释），行为不变。
export function AppGrid({
  dropZoneRef,
  handleContentScroll,
  activeCategory,
  dragOverGroupSubId,
  groupedApps,
  config,
  draggedAppId,
  dragOverAppId,
  dropInsertAfter,
  selectedAppIdSet,
  cardOnOpen,
  cardOnEdit,
  cardOnDelete,
  cardOnSendFile,
  cardOnMouseDown,
  cardOnContextMenu,
  cardOnKeyDown,
  filteredApps
}: AppGridProps) {
  // 与原 App 内联实现一致：拖拽中的来源应用被隐藏，用 draggedAppId 推导。
  const isDraggingApp = draggedAppId !== null
  return (
    <main
      ref={dropZoneRef}
      onScroll={handleContentScroll}
      className="app-content relative flex-1 overflow-y-scroll px-5 py-4"
      style={{ scrollbarGutter: 'stable', willChange: 'scroll-position', backdropFilter: 'blur(40px) saturate(1.2)', WebkitBackdropFilter: 'blur(40px) saturate(1.2)' }}
    >
      <div key={activeCategory} className="tab-fade-enter" style={{ contain: 'content' }}>
      {(() => {
        return (
          <div>
            {groupedApps.map((group, gi) => {
              const groupKey = group.sub?.id || '__none__'
              const isGroupDropTarget = dragOverGroupSubId === groupKey
              return (
              <div
                key={groupKey}
                id={group.sub ? `subcat-${group.sub.id}` : undefined}
                data-subcategory-drop={groupKey}
                className={`${gi > 0 ? 'mt-6' : ''} rounded-xl`}
                /* 这里原本挂着内部 HTML5 拖拽的三个处理器（onDragOver / onDragLeave / onDrop），
                   用于计算精确落点、高亮目标卡片与执行重排。拖拽统一到左键的自绘引擎后，
                   内部拖拽不再产生 HTML5 的 dragover/drop 事件，这些分支全部失效，已删除。
                   外层 <main> 上的 handleDragOver / handleDrop 仍负责「外部文件拖入导入」，
                   事件会自然冒泡上去，功能不受影响。

                   ⚠️ 这里**不能**给整个分组容器加拖拽高亮的底色（bg-brand-500/10），
                   也不能挂 transition-colors：分组容器在卡片的**背后**，而每张卡片都带
                   backdrop-filter——改一次容器底色就等于改了整组卡片的背景，
                   配上过渡就是整整 150ms 里每帧都让这组几十张卡重新算模糊，
                   拖拽每次划过一个分组就卡一下。落点反馈放在分组标题上（见下）。 */
              >
                {group.sub && (
                  <div className={`flex items-center gap-2.5 mb-3 px-2 py-1 rounded-lg transition-colors ${
                    isGroupDropTarget ? 'bg-brand-500/15' : ''
                  }`}>
                    <span className="text-sm">{group.sub.icon}</span>
                    <span className="text-sm font-semibold font-display text-brand-700">{group.sub.name}</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-brand-200/60 to-transparent"></div>
                    {isGroupDropTarget && (
                      <span className="shrink-0 text-[11px] font-medium text-brand-600">
                        {group.sub ? '放到此处归入' : '放到此处移出子分类'}
                      </span>
                    )}
                  </div>
                )}
                <div className={`grid gap-3 stagger-enter ${
                  config?.ui?.gridColumns === 4 ? 'grid-cols-4' :
                  config?.ui?.gridColumns === 5 ? 'grid-cols-5' :
                  config?.ui?.gridColumns === 7 ? 'grid-cols-7' :
                  config?.ui?.gridColumns === 8 ? 'grid-cols-8' :
                  'grid-cols-6'
                }`} style={{ gridAutoRows: 'min-content', contain: 'layout style' }}>
                  {group.apps.map(app => (
                    <AppCard
                      key={app.id}
                      app={app}
                      ui={config?.ui}
                      isDragging={draggedAppId === app.id}
                      isDragOver={dragOverAppId === app.id}
                      /* 插入位置指示线只画在当前悬停的那张卡片上：
                         false = 落在它前面，true = 落在它后面。
                         非手动排序时不画——那种模式下顺序由排序规则决定，拖拽只改归属
                         （见 handleReorderApp 的提前返回），画线会承诺一个不会发生的落点。 */
                      insertAfter={
                        dragOverAppId === app.id &&
                        dropInsertAfter !== null &&
                        (config?.ui?.sortMode ?? 'manual') === 'manual'
                          ? dropInsertAfter
                          : undefined
                      }
                      isSelected={selectedAppIdSet.has(app.id)}
                      onOpen={cardOnOpen}
                      onEdit={cardOnEdit}
                      onDelete={cardOnDelete}
                      onSendFile={cardOnSendFile}
                      onMouseDown={cardOnMouseDown}
                      onContextMenu={cardOnContextMenu}
                      onKeyDown={cardOnKeyDown}
                    />
                  ))}
                </div>
                {isDraggingApp && group.apps.length === 0 && (
                  <div className={`rounded-xl border-2 border-dashed px-4 py-5 text-center text-xs transition-colors ${
                    isGroupDropTarget
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                      : 'border-brand-300/60 text-slate-400'
                  }`}>
                    拖到此处归入「{group.sub?.name ?? '未分类'}」
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )
      })()}

      {filteredApps.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-500 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <p className="text-slate-600 text-sm font-medium">暂无应用</p>
          <p className="text-slate-500 text-xs mt-1">点击「添加应用」或「添加文件夹」，也可以直接拖入快捷方式</p>
        </div>
      )}
      </div>
    </main>
  )
}
