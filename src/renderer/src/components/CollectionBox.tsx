import React, { useEffect, useRef, useState } from 'react'
import { CaretDown, CaretRight, PencilSimple, Trash } from '@phosphor-icons/react'
import type { AppItem, Collection, UISettings } from '../../../shared/types'
import { AppCard } from './AppCard'

/**
 * 收纳格。
 *
 * 视觉与交互约定：
 *   · 虚线边框容器，标题行 = 折叠箭头 + 图标 + 名称 + 成员计数；
 *   · 内部网格沿用主网格的列数，但**间距减半**（gap-2 vs gap-3）——
 *     容器里再套一层大间距会显得比外面还松散；
 *   · ⚠️ 它是新的拖拽放置目标：`data-collection-id` + `data-dragover` 都要有，
 *     且 `:hover` 规则必须排除 `[data-dragover]`，否则拖拽时高亮永远不显示
 *     （这个坑项目里已经踩过三次）。
 *   · 重命名走**行内输入**，不弹原生 prompt——原生对话框会夺焦，
 *     开着"失焦自动隐藏"时会把整个主界面一起藏掉。
 */
export const CollectionBox = React.memo(function CollectionBox({
  collection,
  apps,
  ui,
  isDragOver,
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
  onToggleCollapse,
  onRename,
  onDelete
}: {
  collection: Collection
  apps: AppItem[]
  ui?: UISettings
  isDragOver: boolean
  draggedAppId: string | null
  dragOverAppId: string | null
  dropInsertAfter: boolean | null
  selectedAppIdSet: Set<string>
  cardOnOpen: (e: React.MouseEvent, app: AppItem) => void
  cardOnEdit: (app: AppItem) => void
  cardOnDelete: (app: AppItem) => void
  cardOnSendFile: (app: AppItem) => void
  cardOnMouseDown: (e: React.MouseEvent, app: AppItem) => void
  cardOnContextMenu: (e: React.MouseEvent, app: AppItem) => void
  cardOnKeyDown: (e: React.KeyboardEvent, app: AppItem) => void
  onToggleCollapse: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(collection.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // 名称被外部改掉（撤销/同步）时同步草稿，避免下次进编辑态显示旧名字
  useEffect(() => {
    if (!editing) setDraftName(collection.name)
  }, [collection.name, editing])

  const commitRename = () => {
    setEditing(false)
    if (draftName.trim() && draftName.trim() !== collection.name) onRename(collection.id, draftName)
  }

  const gridCols =
    ui?.gridColumns === 4 ? 'grid-cols-4' :
    ui?.gridColumns === 5 ? 'grid-cols-5' :
    ui?.gridColumns === 7 ? 'grid-cols-7' :
    ui?.gridColumns === 8 ? 'grid-cols-8' :
    'grid-cols-6'

  return (
    <section
      data-collection-id={collection.id}
      data-dragover={isDragOver ? 'true' : undefined}
      data-collapsed={collection.collapsed ? 'true' : undefined}
      aria-label={`收纳格：${collection.name}`}
      className="collection-box rounded-xl mb-5"
    >
      <div className="collection-box-header flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => onToggleCollapse(collection.id)}
          aria-expanded={!collection.collapsed}
          title={collection.collapsed ? '展开' : '折叠'}
          className="focus-ring shrink-0 rounded-md p-0.5 transition-colors"
        >
          {collection.collapsed
            ? <CaretRight size={13} weight="bold" aria-hidden="true" />
            : <CaretDown size={13} weight="bold" aria-hidden="true" />}
        </button>

        <span aria-hidden="true">{collection.icon}</span>

        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { e.preventDefault(); setDraftName(collection.name); setEditing(false) }
            }}
            className="collection-box-name-input w-40 rounded-md px-1.5 py-0.5 text-sm"
            aria-label="收纳格名称"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="点击重命名"
            className="focus-ring min-w-0 truncate rounded-md px-1 text-sm font-semibold font-display transition-colors"
          >
            {collection.name}
          </button>
        )}

        <span className="collection-box-count shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
          {apps.length}
        </span>

        {isDragOver && (
          <span className="shrink-0 text-[11px] font-medium text-brand-600">放到此处加入</span>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setEditing(true)}
          title="重命名"
          className="focus-ring shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:text-brand-500"
        >
          <PencilSimple size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(collection.id)}
          title="删除收纳格（不会删除里面的项目）"
          className="focus-ring shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:text-red-500"
        >
          <Trash size={13} aria-hidden="true" />
        </button>
      </div>

      {!collection.collapsed && (
        apps.length > 0 ? (
          <div className={`grid gap-2 px-3 pb-3 ${gridCols}`} style={{ gridAutoRows: 'min-content' }}>
            {apps.map(app => (
              <AppCard
                key={app.id}
                app={app}
                ui={ui}
                isDragging={draggedAppId === app.id}
                isDragOver={dragOverAppId === app.id}
                insertAfter={
                  dragOverAppId === app.id && dropInsertAfter !== null
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
        ) : (
          <p className="collection-box-empty px-3 pb-3 text-xs">
            把项目拖进来即可加入收纳格（不会改变它原本的分类）
          </p>
        )
      )}
    </section>
  )
})
