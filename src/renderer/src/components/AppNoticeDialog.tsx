import React, { useSyncExternalStore } from 'react'
import { dismissAppNotice, getAppNotice, subscribeAppNotice } from '../utils/appNotice'
import { useDialogA11y } from '../hooks/useDialogA11y'

/**
 * 应用内提示框（window.alert 的窗口内替代品，见 utils/appNotice）。
 *
 * ⚠️ 订阅与弹窗本体必须拆成两层：useDialogA11y 会在 document 上挂捕获阶段的
 * Escape 监听并 stopPropagation。如果常驻挂载，整个应用的 Esc（隐藏窗口）
 * 都会被它吞掉——所以必须等真的有提示时才挂载。
 *
 * 它画在窗口内部，不参与「失焦自动隐藏」的拦截：窗口藏起来时它一起藏，
 * 重新打开窗口时状态还在，不会留下没有归属的弹窗。
 */
export function AppNoticeDialog() {
  const message = useSyncExternalStore(subscribeAppNotice, getAppNotice, getAppNotice)
  if (message === null) return null
  return <NoticeContent message={message} />
}

function NoticeContent({ message }: { message: string }) {
  const { ref, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose: dismissAppNotice,
    labelledBy: 'app-notice-title'
  })

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismissAppNotice() }}
    >
      <div
        ref={ref}
        {...dialogProps}
        className="glass rounded-2xl p-6 w-[400px] shadow-xl shadow-brand-500/5 modal-enter"
      >
        <h2 id="app-notice-title" className="text-base font-display font-bold text-slate-800 mb-2">提示</h2>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 max-h-64 overflow-y-auto">{message}</p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={dismissAppNotice}
            className="focus-ring cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
