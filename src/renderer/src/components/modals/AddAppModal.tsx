import React, { useMemo } from 'react'
import type { AppItem, AppItemDraft, BrowserEntry, Category } from '../../../../shared/types'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { AppDraftForm } from './AppDraftForm'

export const AddAppModal = React.memo(function AddAppModal({ categories, apps, browsers, urlMetaEnabled, onClose, onAdd, defaultCategory }: {
  categories: Category[]
  /** 供「组合」类型的成员勾选使用 */
  apps: AppItem[]
  /** 网址项目的「打开方式」选项 */
  browsers: BrowserEntry[]
  urlMetaEnabled: boolean
  onClose: () => void
  onAdd: (draft: AppItemDraft) => void
  defaultCategory?: string | null
}) {
  // Esc 关闭、焦点进出、Tab 循环：此前这个弹窗按 Esc 关不掉，键盘用户也没法用
  const { ref: dialogRef, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose,
    labelledBy: 'add-app-title'
  })

  /* 初始草稿只在挂载时算一次。分类的有效性交给 AppDraftForm 里的 effect 校正，
     这样「打开弹窗 → 分类被删」这种边界情况也有兜底。 */
  const initial = useMemo<AppItemDraft>(() => {
    const preferred = defaultCategory && categories.some(c => c.id === defaultCategory)
      ? defaultCategory
      : categories[0]?.id ?? ''
    return { name: '', path: '', categoryId: preferred, type: 'app', aliases: [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <h2 id="add-app-title" className="text-lg font-display font-bold text-slate-800 mb-4">添加项目</h2>
        <AppDraftForm
          initial={initial}
          categories={categories}
          apps={apps}
          browsers={browsers}
          urlMetaEnabled={urlMetaEnabled}
          submitLabel="添加"
          onSubmit={onAdd}
          onCancel={onClose}
        />
      </div>
    </div>
  )
})
