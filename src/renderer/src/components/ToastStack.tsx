import React from 'react'
import { UndoToast } from './CategoryOverlays'
import type { UndoSnapshot } from '../hooks/useUndoSnapshot'
import type { ActiveMaintenanceSummary } from '../hooks/useMaintenance'
import { MAINTENANCE_SUMMARY_DURATION_MS } from '../hooks/useMaintenance'

interface ToastStackProps {
  undoSnapshot: UndoSnapshot | null
  restoreUndoSnapshot: () => void | Promise<void>
  setUndoSnapshot: (snapshot: UndoSnapshot | null) => void
  copyToast: string | null
  maintenanceSummary: ActiveMaintenanceSummary | null
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
        /* key 用 token：新提示替换旧提示时强制重挂载，倒计时条才会从头开始走
           （同一个 DOM 节点上重跑 CSS 动画不会重置） */
        <div
          key={maintenanceSummary.token}
          role="status"
          aria-live="polite"
          className="glass fixed right-5 top-24 z-[90] w-[min(360px,calc(100vw-40px))] overflow-hidden rounded-xl border border-brand-200/70 px-4 py-3 shadow-xl shadow-slate-900/10"
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

          {/* 倒计时条：只表示「还有多久自动关闭」，不参与交互。
              ⚠️ 它靠 .glass > .absolute（index.css）才拿到 absolute —— .glass > * 会把
              直接子元素的 position 钉成 relative，光写 Tailwind 的 absolute 会被盖掉。 */}
          {maintenanceSummary.autoDismiss && (
            <div
              aria-hidden="true"
              className="toast-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand-500/70"
              style={{ animationDuration: `${MAINTENANCE_SUMMARY_DURATION_MS}ms` }}
            />
          )}
        </div>
      )}
    </>
  )
}
