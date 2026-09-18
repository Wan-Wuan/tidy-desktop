import React from 'react'
import { UndoToast } from './CategoryOverlays'
import type { UndoSnapshot } from '../hooks/useUndoSnapshot'
import type { MaintenanceSummary } from '../hooks/useMaintenance'

interface ToastStackProps {
  undoSnapshot: UndoSnapshot | null
  restoreUndoSnapshot: () => void | Promise<void>
  setUndoSnapshot: (snapshot: UndoSnapshot | null) => void
  copyToast: string | null
  maintenanceSummary: MaintenanceSummary | null
  showSmartOrganize: boolean
  clearMaintenanceSummary: () => void
}

// 右上角维护提示 + 底部撤销 / 复制提示。纯展示 + 回调透传，
// JSX 与原 App 内联实现逐字一致，行为不变。
export function ToastStack({
  undoSnapshot,
  restoreUndoSnapshot,
  setUndoSnapshot,
  copyToast,
  maintenanceSummary,
  showSmartOrganize,
  clearMaintenanceSummary
}: ToastStackProps) {
  return (
    <>
      {undoSnapshot && (
        <UndoToast
          label={undoSnapshot.label}
          onUndo={restoreUndoSnapshot}
          onClose={() => setUndoSnapshot(null)}
        />
      )}

      {copyToast && (
        <div
          role="status"
          aria-live="polite"
          className="glass fixed bottom-6 left-1/2 z-[95] -translate-x-1/2 rounded-xl border border-brand-200/70 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-xl shadow-slate-900/10"
        >
          {copyToast}
        </div>
      )}

      {maintenanceSummary && !showSmartOrganize && (
        <div
          role="status"
          aria-live="polite"
          className="glass fixed right-5 top-24 z-[90] w-[min(360px,calc(100vw-40px))] rounded-xl border border-brand-200/70 px-4 py-3 shadow-xl shadow-slate-900/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">{maintenanceSummary.title}</div>
              <div className="mt-1 space-y-0.5">
                {maintenanceSummary.items.map((item, index) => (
                  <div key={`${item}-${index}`} className="text-xs leading-5 text-slate-600">{item}</div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={clearMaintenanceSummary}
              aria-label="关闭提示"
              title="关闭提示"
              className="focus-ring shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}
