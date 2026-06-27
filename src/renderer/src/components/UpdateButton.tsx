import React from 'react'
import type { UpdateProgress } from '../../../shared/electron.d'

interface UpdateButtonProps {
  state: string
  version?: string
  progress?: UpdateProgress
}

export function UpdateButton({ state, version, progress }: UpdateButtonProps) {
  if (state !== 'downloading') return null

  return (
    <div className="px-3.5 py-1.5 bg-brand-500/10 text-brand-600 rounded-lg text-sm font-medium flex items-center gap-1.5">
      <svg
        className="animate-spin"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          strokeDasharray="50"
          strokeDashoffset={50 - (progress?.percent || 0) / 2}
        />
      </svg>
      {progress ? `${progress.percent}%` : '下载中...'}
    </div>
  )
}

interface UpdateDialogProps {
  version?: string
  releaseNotes?: string
  onConfirm: () => void
  onDismiss: () => void
}

export function UpdateDialog({ version, releaseNotes, onConfirm, onDismiss }: UpdateDialogProps) {
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div className="glass rounded-2xl p-6 w-[400px] shadow-xl shadow-brand-500/5 modal-enter">
        <h3 className="text-lg font-display font-bold text-slate-800 mb-2">
          🎉 新版本 v{version} 已准备就绪
        </h3>
        {releaseNotes && (
          <div className="text-sm text-slate-600 mb-4 max-h-40 overflow-y-auto">
            <p className="font-medium mb-1">更新内容：</p>
            <div className="whitespace-pre-wrap">{releaseNotes}</div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            立即安装
          </button>
        </div>
      </div>
    </div>
  )
}
