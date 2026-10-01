import React from 'react'
import { Check, CopySimple, NotePencil, X } from '@phosphor-icons/react'
import type { AppItem } from '../../../../shared/types'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { countTodos, formatTodosAsMarkdown } from '../../utils/todo'

/**
 * 文本项目的阅读面板。
 *
 * 两种形态共用这一个面板：
 *   · `noteKind === 'text'`（缺省）——纯文本：看全文 / 复制 / 去编辑；
 *   · `noteKind === 'todo'`——待办清单：**点一下就勾掉，不必进编辑弹窗**。
 *     勾选是待办里最高频的动作，要是每次都得开弹窗再保存一遍，那就不叫待办了。
 *     改条目文字、增删条目仍然走「编辑」，职责分开。
 */
export const NoteViewerModal = React.memo(function NoteViewerModal({ app, onClose, onEdit, onCopy, onToggleTodo, onClearCompleted }: {
  app: AppItem
  onClose: () => void
  onEdit: (app: AppItem) => void
  onCopy: (app: AppItem) => void
  onToggleTodo: (app: AppItem, itemId: string) => void
  onClearCompleted: (app: AppItem) => void
}) {
  const { ref: dialogRef, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose,
    labelledBy: 'note-viewer-title'
  })
  const isTodo = app.noteKind === 'todo'
  const todoItems = app.todoItems ?? []
  const { total, done } = countTodos(todoItems)
  const content = app.noteContent || ''
  /* 「复制内容」对待办输出 Markdown 任务列表（`- [x]` / `- [ ]`）：
     粘到任何编辑器都看得懂，而且还能被再解析回来。
     复制成纯文本列表会丢掉完成状态，复制成 JSON 又没人看得懂。 */
  const copyable = isTodo ? formatTodosAsMarkdown(todoItems) : content

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
        className="glass rounded-2xl p-6 w-[26rem] max-h-[88vh] flex flex-col shadow-xl shadow-brand-500/5 modal-enter"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="note-viewer-title" className="flex min-w-0 items-center gap-2 text-lg font-display font-bold text-slate-800">
            <NotePencil size={18} weight="duotone" aria-hidden="true" />
            <span className="truncate">{app.name}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-700"
            title="关闭"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {isTodo && total > 0 && (
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            {/* 勾选后进度会变，让屏幕阅读器把它读出来 */}
            <span aria-live="polite">{done}/{total} 已完成</span>
            {done > 0 && (
              <button
                type="button"
                onClick={() => onClearCompleted(app)}
                className="focus-ring rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:text-rose-600"
              >
                清除已完成
              </button>
            )}
          </div>
        )}

        <div className="note-viewer-body min-h-[6rem] flex-1 overflow-y-auto rounded-lg p-3">
          {isTodo ? (
            todoItems.length === 0 ? (
              <p className="text-sm text-slate-500">暂无条目，点击「编辑」添加。</p>
            ) : (
              <ul className="space-y-0.5">
                {todoItems.map(item => (
                  <li key={item.id} className="todo-row flex items-start gap-2 rounded-md px-1.5 py-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      /* 可访问名就是条目文字本身：读屏时能听出勾的是哪一条 */
                      aria-label={item.text}
                      onClick={() => onToggleTodo(app, item.id)}
                      className={`focus-ring mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                        item.done
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-slate-300 text-transparent hover:border-brand-400'
                      }`}
                    >
                      <Check size={11} weight="bold" aria-hidden="true" />
                    </button>
                    <span
                      className={`min-w-0 flex-1 break-words whitespace-pre-wrap text-sm ${
                        item.done ? 'text-slate-400 line-through' : 'text-slate-700'
                      }`}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : content.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-slate-700 select-text">{content}</p>
          ) : (
            <p className="text-sm text-slate-500">（这条笔记还是空的）</p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(app)}
            className="focus-ring px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => onCopy(app)}
            disabled={!copyable.trim()}
            className="focus-ring inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20 disabled:opacity-50"
          >
            <CopySimple size={14} aria-hidden="true" />
            复制内容
          </button>
        </div>
      </div>
    </div>
  )
})
