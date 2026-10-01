import React from 'react'
import { CheckCircle, Info, X } from '@phosphor-icons/react'
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

/* 三个浮层共用一套视觉语言：.glass + rounded-2xl + 语义色细边 + 同色系投影，
   入场动画统一走 .toast-enter-up / .toast-enter-right（见 index.css）。
   图标一律用「浅底圆角方块」承载，让标题与正文的左边缘对齐成一条竖线。 */
const closeButtonClass = 'focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-800'

// 右上角维护提示 + 底部撤销 / 复制提示。纯展示 + 回调透传。
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
          className="glass toast-enter-up fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-brand-200/70 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-xl shadow-slate-900/10"
        >
          <CheckCircle size={16} weight="fill" className="shrink-0 text-brand-500" aria-hidden="true" />
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
          className="glass toast-enter-right fixed right-5 top-24 z-[90] flex w-[min(360px,calc(100vw-40px))] items-start gap-3 overflow-hidden rounded-2xl border border-brand-200/70 px-4 py-3 shadow-xl shadow-slate-900/10"
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600"
            aria-hidden="true"
          >
            <Info size={15} weight="bold" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800">{maintenanceSummary.title}</div>
            <div className="mt-1.5 space-y-1">
              {maintenanceSummary.items.map((item, index) => (
                <div key={`${item}-${index}`} className="flex gap-1.5 text-xs leading-5 text-slate-600">
                  <span className="shrink-0 text-brand-400" aria-hidden="true">·</span>
                  <span className="min-w-0">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={clearMaintenanceSummary}
            aria-label="关闭提示"
            title="关闭提示"
            className={closeButtonClass}
          >
            <X size={14} weight="bold" aria-hidden="true" />
          </button>

          {/* 倒计时条：只表示「还有多久自动关闭」，不参与交互。
              ⚠️ 它靠 .glass > .absolute（index.css）才拿到 absolute —— .glass > * 会把
              直接子元素的 position 钉成 relative，光写 Tailwind 的 absolute 会被盖掉。
              也正因如此，它必须保持是 .glass 元素的**直接子元素**，
              所以这里没有把内容再包一层 flex 容器。 */}
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
