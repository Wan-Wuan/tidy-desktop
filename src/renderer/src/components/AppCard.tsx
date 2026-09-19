import React from 'react'
import { AppWindow, FolderPlus } from '@phosphor-icons/react'
import type { AppItem, UISettings } from '../../../shared/types'
import { isImageFile } from '../../../shared/utils'
import { hasDisplayableIcon } from '../utils/iconUtils'
import { isDocFile } from '../utils/fileKind'

export const AppCard = React.memo(function AppCard({
  app,
  ui,
  isDragging,
  isDragOver,
  insertAfter,
  isSelected,
  onOpen,
  onEdit,
  onDelete,
  onSendFile,
  onMouseDown,
  onContextMenu,
  onKeyDown
}: {
  app: AppItem
  ui?: UISettings
  isDragging: boolean
  isDragOver: boolean
  /** 拖拽落点要插到本卡片前还是后；undefined = 本卡片不是当前落点，不画指示线 */
  insertAfter?: boolean
  isSelected: boolean
  onOpen: (e: React.MouseEvent, app: AppItem) => void
  onEdit: (app: AppItem) => void
  onDelete: (app: AppItem) => void
  onSendFile: (app: AppItem) => void
  onMouseDown: (e: React.MouseEvent, app: AppItem) => void
  onContextMenu: (e: React.MouseEvent, app: AppItem) => void
  onKeyDown: (e: React.KeyboardEvent, app: AppItem) => void
}) {
  const pSize = ui?.cardSize === 'small' ? 'p-2' : ui?.cardSize === 'large' ? 'p-5' : 'p-4'
  const iconSize = ui?.cardSize === 'small' ? 'w-10 h-10' : ui?.cardSize === 'large' ? 'w-14 h-14' : 'w-12 h-12'
  const iconInner = ui?.cardSize === 'small' ? 'w-8 h-8' : ui?.cardSize === 'large' ? 'w-12 h-12' : 'w-10 h-10'
  const textSize = ui?.cardSize === 'small' ? 'text-xs' : ui?.cardSize === 'large' ? 'text-base' : 'text-sm'
  const br = ui?.borderRadius ?? 8

  return (
    <div
      key={app.id}
      data-app-id={app.id}
      data-dragover={isDragOver ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      data-dragging={isDragging ? 'true' : undefined}
      /* 落点指示：before = 松手后插到本卡片前面，after = 插到后面 */
      data-insert={insertAfter === undefined ? undefined : insertAfter ? 'after' : 'before'}
      tabIndex={0}
      role="button"
      aria-label={`打开 ${app.name}`}
      onKeyDown={(e) => onKeyDown(e, app)}
      onMouseDown={(e) => onMouseDown(e, app)}
      onContextMenu={(e) => onContextMenu(e, app)}
      style={{ borderRadius: br }}
      className={`app-tile glass-card focus-ring ${pSize} card-hover cursor-pointer group relative select-none ${
        isDragging ? 'opacity-30 scale-95 blur-[2px]' : ''
      } ${isDragOver ? 'scale-[1.03] ring-2 ring-brand-500 ring-offset-2 shadow-xl shadow-brand-500/20 bg-brand-50/50' : ''} ${
        isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
      } ${app.hidden ? 'opacity-45 saturate-[0.4]' : ''
      }`}
      onClick={(e) => onOpen(e, app)}
    >
      {app.hidden && (
        <span className="absolute top-1.5 left-1.5 rounded-full bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white pointer-events-none">
          已隐藏
        </span>
      )}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(app)
          }}
          className="text-slate-400 hover:text-brand-500 p-0.5 transition-colors"
          title="编辑"
        >
          ✎
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(app)
          }}
          className="text-slate-400 hover:text-red-500 p-0.5 transition-colors"
          title="删除"
        >
          ×
        </button>
        {(isDocFile(app) || isImageFile(app)) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSendFile(app)
            }}
            className="text-slate-400 hover:text-emerald-500 p-0.5 transition-colors"
            title={isDocFile(app) ? '发送文件（复制到剪贴板）' : '复制图片（可粘贴到微信等应用）'}
          >
            📤
          </button>
        )}
      </div>
      {ui?.showIcon !== false && (
        <div style={{ borderRadius: Math.min(br, 12) }} className={`${iconSize} flex items-center justify-center mb-3 mx-auto ${
          app.type === 'folder' ? 'icon-bg-folder' : app.type === 'steam' ? 'icon-bg-steam' : 'icon-bg-app'
        }`}>
          {hasDisplayableIcon(app.icon) ? (
            <img src={app.icon} alt={app.name} className={iconInner} draggable={false} />
          ) : (
            app.type === 'folder'
              ? <FolderPlus size={ui?.cardSize === 'small' ? 24 : ui?.cardSize === 'large' ? 34 : 30} weight="duotone" aria-hidden="true" />
              : <AppWindow size={ui?.cardSize === 'small' ? 24 : ui?.cardSize === 'large' ? 34 : 30} weight="duotone" aria-hidden="true" />
          )}
        </div>
      )}
      {ui?.showName !== false && (
        <p className={`${textSize} text-center app-tile-name font-medium truncate`}>{app.name}</p>
      )}
    </div>
  )
})
