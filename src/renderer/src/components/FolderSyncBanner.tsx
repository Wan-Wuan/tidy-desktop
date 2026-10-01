import React from 'react'
import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react'
import type { FolderSyncError } from '../../../shared/types'

/** 同步失败的文案。`missing` 与 `permission-denied` 对用户要采取的行动完全不同。 */
const ERROR_TEXT: Record<FolderSyncError, string> = {
  missing: '关联文件夹不存在：可能已被移动、重命名，或所在磁盘未接入',
  'not-a-directory': '关联路径不是文件夹',
  'permission-denied': '没有权限读取该文件夹',
  'read-failed': '读取文件夹失败'
}

/**
 * 关联文件夹的状态横幅。
 *
 * 只在「出错了」或「正在同步」时出现——正常情况下不占位置。
 * 出错时**不清空上一次的条目**（主进程的 `applyFolderSync` 保证），
 * 所以横幅的措辞是"显示的是上次同步的结果"，而不是"内容为空"。
 */
export const FolderSyncBanner = React.memo(function FolderSyncBanner({ folderPath, error, syncing, entryCount, onResync, onRebind, onUnbind }: {
  folderPath: string
  error: FolderSyncError | null
  syncing: boolean
  entryCount: number
  onResync: () => void
  onRebind: () => void
  onUnbind: () => void
}) {
  if (!error && !syncing) return null

  return (
    <div
      role="status"
      className={`folder-sync-banner mx-5 mt-2 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 ${
        error ? 'folder-sync-banner-error' : ''
      }`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {error
          ? <WarningCircle size={16} weight="fill" />
          : <ArrowsClockwise size={16} className="animate-spin" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {error ? ERROR_TEXT[error] : `正在同步「${folderPath}」…`}
        </p>
        <p className="mt-0.5 truncate text-[11px] opacity-80" title={folderPath}>
          {error ? `${folderPath} · 以下为上次成功同步的 ${entryCount} 个条目` : folderPath}
        </p>
      </div>
      {error && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={onResync} className="folder-sync-banner-action focus-ring rounded-lg px-2 py-1 text-[11px] font-medium transition-colors">
            重试
          </button>
          <button type="button" onClick={onRebind} className="folder-sync-banner-action focus-ring rounded-lg px-2 py-1 text-[11px] font-medium transition-colors">
            重新选择目录
          </button>
          <button type="button" onClick={onUnbind} className="folder-sync-banner-action focus-ring rounded-lg px-2 py-1 text-[11px] font-medium transition-colors">
            解除关联
          </button>
        </div>
      )}
    </div>
  )
})
