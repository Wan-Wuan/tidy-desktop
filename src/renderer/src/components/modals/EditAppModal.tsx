import React, { useMemo } from 'react'
import type { AppItem, AppItemDraft, BrowserEntry, Category } from '../../../../shared/types'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { AppDraftForm } from './AppDraftForm'

export const EditAppModal = React.memo(function EditAppModal({ app, categories, apps, browsers, urlMetaEnabled, onClose, onUpdate }: {
  app: AppItem
  categories: Category[]
  /** 供「组合」类型的成员勾选使用 */
  apps: AppItem[]
  /** 网址项目的「打开方式」选项 */
  browsers: BrowserEntry[]
  urlMetaEnabled: boolean
  onClose: () => void
  onUpdate: (id: string, draft: AppItemDraft) => void
}) {
  // 之前这个弹窗没有 a11y 接线，Esc 关不掉、焦点也逃得出去，与添加弹窗不一致
  const { ref: dialogRef, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose,
    labelledBy: 'edit-app-title'
  })

  const initial = useMemo<AppItemDraft>(() => ({
    name: app.name,
    path: app.path,
    categoryId: app.categoryId || categories[0]?.id || '',
    type: app.type || 'app',
    aliases: app.aliases || [],
    args: app.args,
    workingDir: app.workingDir,
    browserId: app.browserId ?? null,
    openWith: app.openWith ?? null,
    noteContent: app.noteContent,
    noteKind: app.noteKind,
    todoItems: app.todoItems,
    memberIds: app.memberIds,
    confirmBeforeLaunch: app.confirmBeforeLaunch,
    icon: app.icon
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [app.id])

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
        className="glass rounded-2xl p-6 w-[26rem] max-h-[88vh] overflow-y-auto shadow-xl shadow-brand-500/5 modal-enter"
      >
        <h2 id="edit-app-title" className="text-lg font-display font-bold text-slate-800 mb-4">编辑项目</h2>
        <AppDraftForm
          initial={initial}
          categories={categories}
          apps={apps}
          browsers={browsers}
          urlMetaEnabled={urlMetaEnabled}
          submitLabel="保存"
          excludeAppId={app.id}
          onSubmit={(draft) => onUpdate(app.id, draft)}
          onCancel={onClose}
        />
      </div>
    </div>
  )
})
