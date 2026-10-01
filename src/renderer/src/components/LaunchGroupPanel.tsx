import React, { useEffect, useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { AppItem } from '../../../shared/types'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { AppTypeIcon } from './AppTypeIcon'
import { getDisplayHost } from '../utils/domainAvatar'

/**
 * 组合启动的确认面板。
 *
 * 只在组合勾了「启动前先确认」时才出现。默认全选，用户可以临时取消几个再启动——
 * 复用 SelectionBar 那套勾选视觉（同一颗 accent 色、同一套 hover 语义）。
 */
export const LaunchGroupPanel = React.memo(function LaunchGroupPanel({ group, members, launching, onConfirm, onCancel }: {
  group: AppItem
  members: AppItem[]
  launching: boolean
  onConfirm: (memberIds: string[]) => void
  onCancel: () => void
}) {
  const { ref: dialogRef, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose: onCancel,
    labelledBy: 'launch-group-title'
  })

  // 默认全选。members 变化时重置——面板打开期间成员列表不该悄悄变，真变了就以新的为准。
  const [selected, setSelected] = useState<string[]>(() => members.map(app => app.id))
  useEffect(() => {
    setSelected(members.map(app => app.id))
  }, [members])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggle = (id: string) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]))
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        {...dialogProps}
        className="glass rounded-2xl p-6 w-[26rem] max-h-[88vh] overflow-y-auto shadow-xl shadow-brand-500/5 modal-enter"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 id="launch-group-title" className="text-lg font-display font-bold text-slate-800">
            启动「{group.name}」
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-700"
            title="取消"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          取消勾选可以跳过本次不启动的项目，不会改动组合本身。
        </p>

        <div className="launch-group-list max-h-64 overflow-y-auto rounded-lg p-1">
          {members.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-500">该组合已无可启动的项目。</p>
          ) : (
            members.map(app => {
              const checked = selectedSet.has(app.id)
              const subtitle = app.type === 'url' ? getDisplayHost(app.path) : app.path
              return (
                <label
                  key={app.id}
                  className="launch-group-row flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(app.id)}
                    className="accent-brand-500 shrink-0"
                  />
                  <span className="shrink-0 text-slate-400">
                    <AppTypeIcon type={app.type || 'app'} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700">{app.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{subtitle}</span>
                  </span>
                </label>
              )
            })
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={launching || selected.length === 0}
            className="focus-ring px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20 disabled:opacity-50"
          >
            {launching ? '启动中…' : `启动 ${selected.length} 个项目`}
          </button>
        </div>
      </div>
    </div>
  )
})
