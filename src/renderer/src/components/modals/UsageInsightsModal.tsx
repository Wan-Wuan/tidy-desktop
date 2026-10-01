import React, { useMemo } from 'react'
import type { AppItem } from '../../../../shared/types'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { hasDisplayableIcon } from '../../utils/iconUtils'
import { computeUsageStats, daysSinceLastOpen } from '../../utils/usageStats'

/** 每档最多渲染多少行；多出来的用「还有 N 个」收口，避免弹窗被几百条撑爆。 */
const MAX_ROWS = 10

function AppRow({ app, meta, onOpen }: {
  app: AppItem
  meta: string
  onOpen: (app: AppItem) => void
}) {
  return (
    <button
      onClick={() => onOpen(app)}
      title={app.path}
      className="focus-ring flex w-full items-center gap-2 rounded-lg border border-brand-100/40 bg-white/60 px-2.5 py-1.5 text-left transition-colors hover:bg-brand-50"
    >
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-brand-50 text-xs">
        {hasDisplayableIcon(app.icon)
          ? <img src={app.icon} alt="" className="h-4 w-4" draggable={false} />
          : app.type === 'folder' ? '📁' : '📄'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{app.name}</span>
      <span className="shrink-0 text-[11px] text-slate-500">{meta}</span>
    </button>
  )
}

function Section({ title, hint, children }: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

/**
 * 使用情况面板。
 *
 * `launchCount` / `lastOpenedAt` 一直在记录，但此前只用于顶部「智能启动」和排序模式，
 * 用户看不到全貌。这里把同一份数据整理成「常用 / 最近打开 / 可清理」三档，
 * 主要用来回答「哪些装进来就没动过」——这类应用正是最该清理的。
 */
export const UsageInsightsModal = React.memo(function UsageInsightsModal({ apps, onClose, onHideApps, onOpenApp }: {
  apps: AppItem[]
  onClose: () => void
  onHideApps: (ids: string[]) => void | Promise<void>
  onOpenApp: (app: AppItem) => void | Promise<void>
}) {
  const { ref: dialogRef, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose,
    labelledBy: 'usage-insights-title'
  })

  /* 隐藏项不参与统计：用户已经处理过它们了，再列出来只会让"可清理"列表永远清不空。 */
  const visibleApps = useMemo(() => apps.filter(app => !app.hidden), [apps])
  const stats = useMemo(() => computeUsageStats(visibleApps, { topN: MAX_ROWS, staleDays: 90 }), [visibleApps])

  const cleanupCandidates = useMemo(
    () => [...stats.stale, ...stats.neverLaunched],
    [stats]
  )
  const shownCleanup = cleanupCandidates.slice(0, MAX_ROWS)

  const handleHideAll = async () => {
    const ids = cleanupCandidates.map(app => app.id)
    if (ids.length === 0) return
    const confirmed = await window.electronAPI.confirm(
      `确定隐藏这 ${ids.length} 个项目吗？\n\n仅从列表隐藏，不会删除文件；之后可在「整理中心」中恢复。`
    )
    if (confirmed) await onHideApps(ids)
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        {...dialogProps}
        className="glass rounded-2xl p-6 w-[520px] max-h-[80vh] overflow-auto shadow-xl shadow-brand-500/5 modal-enter"
      >
        <h2 id="usage-insights-title" className="text-lg font-display font-bold text-slate-800 mb-1">使用情况</h2>
        <p className="mb-4 text-xs text-slate-500">
          共 {visibleApps.length} 个项目，其中 {stats.trackedCount} 个有启动记录。
        </p>

        {visibleApps.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">暂无可统计的项目</div>
        )}

        {stats.mostUsed.length > 0 && (
          <Section title="常用" hint={`按启动次数排序，前 ${stats.mostUsed.length} 个`}>
            {stats.mostUsed.map(app => (
              <AppRow
                key={app.id}
                app={app}
                meta={`${app.launchCount || 0} 次`}
                onOpen={onOpenApp}
              />
            ))}
          </Section>
        )}

        {stats.recentlyUsed.length > 0 && (
          <Section title="最近打开" hint="按最近一次打开排序">
            {stats.recentlyUsed.map(app => {
              const days = daysSinceLastOpen(app)
              return (
                <AppRow
                  key={app.id}
                  app={app}
                  meta={days === null ? '—' : days === 0 ? '今天' : `${days} 天前`}
                  onOpen={onOpenApp}
                />
              )
            })}
          </Section>
        )}

        <Section
          title="可清理"
          hint={`${stats.neverLaunched.length} 个从未启动 · ${stats.stale.length} 个超过 90 天未打开`}
        >
          {shownCleanup.length === 0 ? (
            <div className="rounded-lg border border-brand-100/40 bg-white/60 px-3 py-2 text-xs text-slate-500">
              没有可清理的项目，每个应用都还在用。
            </div>
          ) : (
            <>
              {shownCleanup.map(app => {
                const days = daysSinceLastOpen(app)
                return (
                  <AppRow
                    key={app.id}
                    app={app}
                    meta={days === null ? '从未打开' : `${days} 天前`}
                    onOpen={onOpenApp}
                  />
                )
              })}
              {cleanupCandidates.length > shownCleanup.length && (
                <div className="px-1 text-[11px] text-slate-500">
                  还有 {cleanupCandidates.length - shownCleanup.length} 个…
                </div>
              )}
            </>
          )}
        </Section>

        <div className="flex justify-between gap-2">
          <button
            onClick={() => void handleHideAll()}
            disabled={cleanupCandidates.length === 0}
            className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            隐藏全部可清理项{cleanupCandidates.length > 0 ? `（${cleanupCandidates.length}）` : ''}
          </button>
          <button
            onClick={onClose}
            className="focus-ring cursor-pointer rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
})
