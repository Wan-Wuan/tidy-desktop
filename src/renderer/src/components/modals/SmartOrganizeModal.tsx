import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppItem, Category } from '../../../../shared/types'
import type { HealthReport, IconRefreshProgress } from './types'

type ActionKey =
  | 'scan'
  | 'tuneup'
  | 'fix'
  | 'icons'
  | 'categorize'
  | 'import'
  | 'cleanup'
  | 'restore'
  | 'export'
  | 'importBackup'

interface SmartOrganizeModalProps {
  apps: AppItem[]
  categories: Category[]
  healthReport: HealthReport | null
  iconRefreshProgress: IconRefreshProgress | null
  onClose: () => void
  onRunHealthCheck: () => Promise<void>
  onFixHealthIssues: () => Promise<void>
  onRefreshIcons: () => Promise<void>
  onAutoCategorize: () => Promise<void>
  onImportShortcuts: () => Promise<void>
  onCleanupInvalid: () => Promise<void>
  onRestoreHidden: () => Promise<void>
  onExportBackup: () => Promise<void>
  onImportBackup: () => Promise<void>
}

interface Recommendation {
  id: string
  title: string
  detail: string
  actionLabel: string
  actionKey: ActionKey
  tone: 'danger' | 'warn' | 'info' | 'ok'
  priority: number
  action: () => Promise<void>
}

const actionButton =
  'smart-button focus-ring inline-flex cursor-pointer items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border disabled:opacity-60 disabled:cursor-not-allowed'

const panelClass = 'smart-panel rounded-xl shadow-sm shadow-brand-500/5'

export const SmartOrganizeModal = React.memo(function SmartOrganizeModal({
  apps,
  categories,
  healthReport,
  iconRefreshProgress,
  onClose,
  onRunHealthCheck,
  onFixHealthIssues,
  onRefreshIcons,
  onAutoCategorize,
  onImportShortcuts,
  onCleanupInvalid,
  onRestoreHidden,
  onExportBackup,
  onImportBackup
}: SmartOrganizeModalProps) {
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null)
  const initialScanRef = useRef(false)

  useEffect(() => {
    if (initialScanRef.current || healthReport) return
    initialScanRef.current = true
    setBusyAction('scan')
    onRunHealthCheck().finally(() => setBusyAction(null))
  }, [healthReport, onRunHealthCheck])

  const stats = useMemo(() => {
    const invalid = healthReport?.invalidPaths.length ?? 0
    const missing = healthReport?.missingIcons.length ?? 0
    const duplicate = healthReport?.duplicatePaths.length ?? 0
    const empty = healthReport?.emptyCategories.length ?? 0
    const hidden = healthReport?.hiddenCount ?? apps.filter(app => app.hidden).length
    const uncategorized = apps.filter(app => !app.hidden && !app.categoryId).length
    const issueWeight = invalid * 18 + missing * 4 + duplicate * 8 + empty * 5 + hidden * 2 + uncategorized * 3
    const score = apps.length === 0 ? 100 : Math.max(0, Math.min(100, 100 - issueWeight))
    const issueCount = invalid + missing + duplicate + empty + hidden + uncategorized

    return {
      score,
      issueCount,
      invalid,
      missing,
      duplicate,
      empty,
      hidden,
      uncategorized,
      visible: apps.filter(app => !app.hidden).length
    }
  }, [apps, healthReport])

  const runAction = async (key: ActionKey, action: () => Promise<void>, refreshAfter = true) => {
    if (busyAction || iconRefreshProgress) return
    setBusyAction(key)
    try {
      await action()
      if (refreshAfter) {
        await onRunHealthCheck()
      }
    } finally {
      setBusyAction(null)
    }
  }

  const runTuneup = async () => {
    await runAction('tuneup', async () => {
      await onRunHealthCheck()
      if (stats.invalid > 0 || stats.duplicate > 0 || stats.empty > 0) {
        await onFixHealthIssues()
      }
      if (stats.missing > 0) {
        await onRefreshIcons()
      }
      if (categories.length > 0 && (stats.uncategorized > 0 || apps.length > 0)) {
        await onAutoCategorize()
      }
    })
  }

  const recommendations = useMemo<Recommendation[]>(() => {
    const items: Recommendation[] = []

    if (stats.invalid > 0) {
      items.push({
        id: 'invalid',
        title: '清理失效路径',
        detail: `${stats.invalid} 个项目的路径已经不可用，会拖慢搜索和打开动作。`,
        actionLabel: '清理',
        actionKey: 'cleanup',
        tone: 'danger',
        priority: 100,
        action: onCleanupInvalid
      })
    }

    if (stats.duplicate > 0) {
      items.push({
        id: 'duplicate',
        title: '合并重复项目',
        detail: `${stats.duplicate} 个项目指向重复路径，保留一个即可。`,
        actionLabel: '修复',
        actionKey: 'fix',
        tone: 'warn',
        priority: 90,
        action: onFixHealthIssues
      })
    }

    if (stats.missing > 0) {
      items.push({
        id: 'icons',
        title: '补全应用图标',
        detail: `${stats.missing} 个项目缺少可显示图标，刷新后主界面和搜索框会一起更新。`,
        actionLabel: '刷新',
        actionKey: 'icons',
        tone: 'info',
        priority: 80,
        action: onRefreshIcons
      })
    }

    if (stats.empty > 0) {
      items.push({
        id: 'empty',
        title: '移除空分类',
        detail: `${stats.empty} 个分类暂时没有可见项目，可以清掉让导航更轻。`,
        actionLabel: '处理',
        actionKey: 'fix',
        tone: 'info',
        priority: 70,
        action: onFixHealthIssues
      })
    }

    if (stats.uncategorized > 0 && categories.length > 0) {
      items.push({
        id: 'uncategorized',
        title: '整理未分类项目',
        detail: `${stats.uncategorized} 个项目还没有分类，可按规则和分类名自动归位。`,
        actionLabel: '分类',
        actionKey: 'categorize',
        tone: 'info',
        priority: 60,
        action: onAutoCategorize
      })
    }

    if (stats.hidden > 0) {
      items.push({
        id: 'hidden',
        title: '复查隐藏项',
        detail: `${stats.hidden} 个项目被搜索隐藏，可以恢复后重新整理。`,
        actionLabel: '恢复',
        actionKey: 'restore',
        tone: 'info',
        priority: 50,
        action: onRestoreHidden
      })
    }

    if (apps.length === 0) {
      items.push({
        id: 'empty-apps',
        title: '导入第一批项目',
        detail: '扫描桌面和开始菜单，先把常用入口收进来。',
        actionLabel: '导入',
        actionKey: 'import',
        tone: 'ok',
        priority: 40,
        action: onImportShortcuts
      })
    }

    if (items.length === 0) {
      items.push({
        id: 'healthy',
        title: '维护状态良好',
        detail: '当前没有明显问题，可以导出一份备份作为恢复点。',
        actionLabel: '备份',
        actionKey: 'export',
        tone: 'ok',
        priority: 10,
        action: onExportBackup
      })
    }

    return items.sort((a, b) => b.priority - a.priority).slice(0, 4)
  }, [
    apps.length,
    categories.length,
    stats.invalid,
    stats.duplicate,
    stats.missing,
    stats.empty,
    stats.uncategorized,
    stats.hidden,
    onCleanupInvalid,
    onFixHealthIssues,
    onRefreshIcons,
    onAutoCategorize,
    onRestoreHidden,
    onImportShortcuts,
    onExportBackup
  ])

  const scoreTone = stats.score >= 90
    ? 'text-emerald-600'
    : stats.score >= 70
      ? 'text-brand-600'
      : 'text-amber-600'

  const scoreArc = `conic-gradient(#10B981 ${stats.score * 3.6}deg, rgba(226,232,240,0.9) 0deg)`
  const disabled = !!busyAction || !!iconRefreshProgress

  const actions = [
    {
      key: 'fix' as const,
      icon: '✓',
      title: '一键修复',
      meta: `${stats.issueCount} 项待处理`,
      primary: true,
      action: onFixHealthIssues
    },
    {
      key: 'icons' as const,
      icon: '↻',
      title: '刷新图标',
      meta: iconRefreshProgress
        ? `${iconRefreshProgress.done}/${iconRefreshProgress.total}`
        : `${stats.missing} 个缺失`,
      action: onRefreshIcons
    },
    {
      key: 'categorize' as const,
      icon: '#',
      title: '自动分类',
      meta: `${categories.length} 个分类`,
      action: onAutoCategorize
    },
    {
      key: 'import' as const,
      icon: '↓',
      title: '导入快捷方式',
      meta: '桌面与开始菜单',
      action: onImportShortcuts
    },
    {
      key: 'cleanup' as const,
      icon: '!',
      title: '清理失效项',
      meta: `${stats.invalid} 个路径`,
      action: onCleanupInvalid
    },
    {
      key: 'restore' as const,
      icon: '↩',
      title: '恢复隐藏项',
      meta: `${stats.hidden} 个隐藏`,
      action: onRestoreHidden
    }
  ]

  return (
    <div
      className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="smart-organize-modal glass w-[940px] max-w-[calc(100vw-32px)] max-h-[88vh] overflow-auto rounded-2xl shadow-2xl shadow-brand-900/10 modal-enter">
        <div className="smart-organize-header px-6 py-5 border-b border-brand-100/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="smart-organize-badge w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 font-bold">
              2.0
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-slate-800">整理中心</h2>
              <div className="text-xs text-slate-500 mt-0.5">{stats.visible} 个可见项目 · {categories.length} 个分类 · {recommendations[0]?.title}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="smart-icon-button focus-ring cursor-pointer w-9 h-9 rounded-lg bg-white/80 border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="p-6 grid grid-cols-[280px_minmax(0,1fr)] gap-5">
          <section className={`${panelClass} smart-score-panel p-5`}>
            <div className="flex flex-col items-center">
              <div className="relative">
                <div
                  className="w-36 h-36 rounded-full p-2"
                  style={{ background: scoreArc }}
                >
                  <div className="smart-score-core w-full h-full rounded-full bg-white/95 flex flex-col items-center justify-center border border-white">
                    <div className={`text-4xl font-display font-extrabold ${scoreTone}`}>{stats.score}</div>
                    <div className="text-xs text-slate-500 mt-1">健康分</div>
                  </div>
                </div>
                <div className="absolute inset-4 rounded-full border border-emerald-200/70 animate-pulse pointer-events-none" />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-700">
                {stats.issueCount === 0 ? '状态良好' : `${stats.issueCount} 项需要处理`}
              </div>
              <button
                onClick={runTuneup}
                disabled={disabled}
                className={`${actionButton} mt-4 w-full smart-button-success bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600`}
              >
                {busyAction === 'tuneup' ? '智能维护中...' : '智能维护'}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-3 text-xs">
              <Metric label="项目" value={apps.length} />
              <Metric label="分类" value={categories.length} />
              <Metric label="失效" value={stats.invalid} tone={stats.invalid > 0 ? 'warn' : 'ok'} />
              <Metric label="缺图" value={stats.missing} tone={stats.missing > 0 ? 'warn' : 'ok'} />
              <Metric label="未分类" value={stats.uncategorized} tone={stats.uncategorized > 0 ? 'warn' : 'ok'} />
              <Metric label="隐藏" value={stats.hidden} tone={stats.hidden > 0 ? 'muted' : 'ok'} />
            </div>

            <button
              onClick={() => runAction('scan', onRunHealthCheck, false)}
              disabled={disabled}
              className={`${actionButton} smart-button-soft mt-5 w-full bg-white text-brand-700 border-brand-200 hover:bg-brand-50`}
            >
              {busyAction === 'scan' ? '扫描中...' : '重新扫描'}
            </button>
          </section>

          <section className="space-y-4">
            <div className={`${panelClass} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">建议队列</div>
                  <div className="text-xs text-slate-500 mt-0.5">按影响排序，先处理最值得做的事。</div>
                </div>
                <span className="smart-status-pill text-[11px] px-2 py-1 rounded-full bg-brand-50 text-brand-600 border border-brand-100">
                  {busyAction ? '处理中' : '就绪'}
                </span>
              </div>
              <div className="space-y-2">
                {recommendations.map(item => (
                  <div key={item.id} className="smart-recommendation flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white/82 px-3 py-3">
                    <div className={`w-2 h-8 rounded-full ${toneBarClass(item.tone)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 truncate">{item.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{item.detail}</div>
                    </div>
                    <button
                      onClick={() => runAction(item.actionKey, item.action)}
                      disabled={disabled}
                      className={`${actionButton} smart-button-neutral bg-white text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 shrink-0`}
                    >
                      {busyAction === item.actionKey ? '处理中' : item.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {iconRefreshProgress && (
              <div className={`${panelClass} p-4`}>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                  <span>刷新图标</span>
                  <span>{iconRefreshProgress.done}/{iconRefreshProgress.total}</span>
                </div>
                <div className="smart-progress-track h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="smart-progress-fill h-full bg-brand-500 transition-all"
                    style={{ width: `${iconRefreshProgress.total ? Math.round(iconRefreshProgress.done / iconRefreshProgress.total * 100) : 0}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 truncate">{iconRefreshProgress.current || '准备处理'}</div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {actions.map(action => (
                <button
                  key={action.key}
                  onClick={() => runAction(action.key, action.action)}
                  disabled={disabled}
                  className={`smart-action-card group focus-ring cursor-pointer text-left rounded-xl border p-4 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    action.primary
                      ? 'smart-action-card-primary border-brand-600 bg-brand-600 text-white hover:border-brand-700 hover:bg-brand-700'
                      : 'smart-action-card-neutral border-brand-100/70 bg-white/82 text-slate-800 hover:border-slate-900 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`w-6 h-6 rounded-md inline-flex items-center justify-center text-sm font-bold transition-colors ${action.primary ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-600 group-hover:bg-white/15 group-hover:text-white'}`}>{action.icon}</span>
                    <span className={`text-[11px] transition-colors ${action.primary ? 'text-brand-100' : 'text-slate-500 group-hover:text-slate-200'}`}>
                      {busyAction === action.key ? '处理中' : action.meta}
                    </span>
                  </div>
                  <div className={`mt-3 text-sm font-semibold transition-colors ${action.primary ? 'text-white' : 'text-slate-800 group-hover:text-white'}`}>
                    {action.title}
                  </div>
                </button>
              ))}
            </div>

            <div className={`${panelClass} p-4 flex items-center justify-between gap-3`}>
              <div>
                <div className="text-sm font-semibold text-slate-800">备份恢复点</div>
                <div className="text-xs text-slate-500 mt-1">整理前后都可以保存配置、分类和项目数据。</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => runAction('export', onExportBackup, false)}
                  disabled={disabled}
                  className={`${actionButton} smart-button-neutral bg-white text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900`}
                >
                  导出
                </button>
                <button
                  onClick={() => runAction('importBackup', onImportBackup)}
                  disabled={disabled}
                  className={`${actionButton} smart-button-neutral bg-white text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900`}
                >
                  导入
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
})

function Metric({ label, value, tone = 'muted' }: { label: string; value: number; tone?: 'ok' | 'warn' | 'muted' }) {
  const toneClass = tone === 'ok'
    ? 'text-emerald-600'
    : tone === 'warn'
      ? 'text-amber-600'
      : 'text-slate-600'

  return (
    <div className="smart-metric px-2 py-1.5 border-b border-slate-100 last:border-b-0">
      <div className={`text-base font-bold ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </div>
  )
}

function toneBarClass(tone: Recommendation['tone']) {
  if (tone === 'danger') return 'bg-red-400'
  if (tone === 'warn') return 'bg-amber-400'
  if (tone === 'ok') return 'bg-emerald-400'
  return 'bg-brand-400'
}
