import React from 'react'
import { AppCard } from './AppCard'
import { CategoryIcon } from './CategoryIcon'
import { CollectionBox } from './CollectionBox'
import type { AppItem, Category, Collection, Subcategory, Config } from '../../../shared/types'

interface GroupedApps {
  /** 该分组所属的子分类；null 表示"未归入任何子分类"的那一组 */
  sub: Subcategory | null
  apps: AppItem[]
}

/** 一个收纳格 + 它当前解析出来的成员项目 */
export interface CollectionGroup {
  collection: Collection
  apps: AppItem[]
}

interface AppGridProps {
  dropZoneRef: React.RefObject<HTMLDivElement>
  handleContentScroll: () => void
  activeCategory: string | null
  dragOverGroupSubId: string | null
  groupedApps: GroupedApps[]
  /** 当前视图里要显示的收纳格（已按分类过滤好） */
  collectionGroups: CollectionGroup[]
  dragOverCollectionId: string | null
  onToggleCollectionCollapse: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onDeleteCollection: (id: string) => void
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
  /** 当前分类的条目高度（P2-3，px）；未设置时按内容自适应 */
  activeItemHeight?: number
  /** 当前分类对象；"全部"视图下为 null。空状态要靠它决定是否引导"关联文件夹" */
  activeCategoryObject: Category | null
  onBindFolder: (category: Category) => void
}

// 主内容区：按子分类分组的卡片网格 + 空状态。纯展示 + 回调透传，
// JSX 与原 App 内联实现逐字一致（含分组容器不加拖拽高亮底色的性能注释），行为不变。
//
// React.memo：App 层有些高频状态（维护提示倒计时、轻提示等）与网格无关，
// 却会让 App 每秒重渲染一次。这里所有 props 都是稳定引用（ref / useCallback /
// useMemo / useStableCallback 包装），memo 能把这些无关渲染整棵挡在门外。
export const AppGrid = React.memo(function AppGrid({
  dropZoneRef,
  handleContentScroll,
  activeCategory,
  dragOverGroupSubId,
  groupedApps,
  collectionGroups,
  dragOverCollectionId,
  onToggleCollectionCollapse,
  onRenameCollection,
  onDeleteCollection,
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
  filteredApps,
  activeItemHeight,
  activeCategoryObject,
  onBindFolder
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
      {/* 收纳格排在子分类分组之前：它是"项目区里的容器"，层级上更靠近顶部 */}
      {collectionGroups.map(group => (
        <CollectionBox
          key={group.collection.id}
          collection={group.collection}
          apps={group.apps}
          ui={config?.ui}
          isDragOver={dragOverCollectionId === group.collection.id}
          draggedAppId={draggedAppId}
          dragOverAppId={dragOverAppId}
          dropInsertAfter={dropInsertAfter}
          selectedAppIdSet={selectedAppIdSet}
          cardOnOpen={cardOnOpen}
          cardOnEdit={cardOnEdit}
          cardOnDelete={cardOnDelete}
          cardOnSendFile={cardOnSendFile}
          cardOnMouseDown={cardOnMouseDown}
          cardOnContextMenu={cardOnContextMenu}
          cardOnKeyDown={cardOnKeyDown}
          onToggleCollapse={onToggleCollectionCollapse}
          onRename={onRenameCollection}
          onDelete={onDeleteCollection}
        />
      ))}
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
                    <CategoryIcon icon={group.sub.icon} size={16} className="shrink-0 text-brand-700" />
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
                }`} style={{ gridAutoRows: activeItemHeight ? `minmax(${activeItemHeight}px, auto)` : 'min-content', contain: 'layout style' }}>
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
          {/* 空分类是最需要"关联文件夹"的时机：用户正盯着空白，也还没养成
             右键分类的习惯。入口只在这个状态下出现，不占常驻位置。 */}
          {activeCategoryObject && !activeCategoryObject.linkFolder ? (
            <>
              <p className="text-slate-600 text-sm font-medium">该分类暂无项目</p>
              <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                点击「添加应用」或「添加文件夹」手动添加，也可以关联一个本地文件夹，让其中的内容自动出现在这里。
              </p>
              <button
                type="button"
                onClick={() => onBindFolder(activeCategoryObject)}
                className="focus-ring mt-4 cursor-pointer rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-brand-500/20 transition-colors hover:bg-brand-700"
              >
                关联文件夹…
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-600 text-sm font-medium">暂无项目</p>
              <p className="text-slate-500 text-xs mt-1">点击「添加应用」或「添加文件夹」，也可以直接拖入快捷方式</p>
            </>
          )}
        </div>
      )}
      </div>
    </main>
  )
})
