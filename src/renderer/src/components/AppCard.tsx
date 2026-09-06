import React from 'react'
import { AppWindow, FolderPlus } from '@phosphor-icons/react'
import type { AppItem, UISettings } from '../../../shared/types'
import { DOC_FILE_EXTS, isImageFile } from '../../../shared/utils'
import { hasDisplayableIcon } from '../utils/iconUtils'

export function isDocFile(app: AppItem): boolean {
  if (app.type !== 'app') return false
  const ext = app.path.toLowerCase().substring(app.path.lastIndexOf('.'))
  return DOC_FILE_EXTS.includes(ext)
}

export function canNativeDrag(app: AppItem): boolean {
  return isDocFile(app) || isImageFile(app)
}

export const AppCard = React.memo(function AppCard({
  app,
  ui,
  isDragging,
  isDragOver,
  isSelected,
  onOpen,
  onEdit,
  onDelete,
  onSendFile,
  onMouseDown,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onKeyDown
}: {
  app: AppItem
  ui?: UISettings
  isDragging: boolean
  isDragOver: boolean
  isSelected: boolean
  onOpen: (e: React.MouseEvent, app: AppItem) => void
  onEdit: (app: AppItem) => void
  onDelete: (app: AppItem) => void
  onSendFile: (app: AppItem) => void
  onMouseDown: (e: React.MouseEvent, app: AppItem) => void
  onContextMenu: (e: React.MouseEvent, app: AppItem) => void
  onDragStart: (e: React.DragEvent, app: AppItem) => void
  onDragOver: (e: React.DragEvent, app: AppItem) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, app: AppItem) => void
  onDragEnd: (e: React.DragEvent) => void
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
      draggable
      tabIndex={0}
      role="button"
      aria-label={`打开 ${app.name}`}
      onKeyDown={(e) => onKeyDown(e, app)}
      onMouseDown={(e) => onMouseDown(e, app)}
      onContextMenu={(e) => onContextMenu(e, app)}
      onDragStart={(e) => onDragStart(e, app)}
      onDragOver={(e) => onDragOver(e, app)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, app)}
      onDragEnd={onDragEnd}
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
          app.type === 'folder' ? 'bg-gradient-to-br from-orange-50 to-orange-100' : app.type === 'steam' ? 'bg-gradient-to-br from-aurora-50 to-aurora-100' : 'bg-gradient-to-br from-brand-50 to-brand-100'
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
        <p className={`${textSize} text-center text-slate-700 font-medium truncate`}>{app.name}</p>
      )}
    </div>
  )
})
