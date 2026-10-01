import React, { useRef, useState } from 'react'
import { LinkSimple } from '@phosphor-icons/react'
import type { Category } from '../../../../shared/types'
import { EMOJI_LIST } from './constants'
import { CategoryIcon } from '../CategoryIcon'

/** 分类外观（P2-3）：字号 / 条目高度 / 图标尺寸，留空表示用默认 */
export interface CategoryAppearance {
  fontSize?: number
  itemHeight?: number
  iconSize?: number
}

/** 把输入框里的字符串解析成可选数值：空串 / 非数字 → undefined（= 用默认），否则夹到区间内 */
function parseAppearanceValue(raw: string, min: number, max: number): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value)))
}

export const CategoryManagerModal = React.memo(function CategoryManagerModal({
  categories,
  onClose,
  onAdd,
  onDelete,
  onUpdate,
  onBindFolder,
  onResyncFolder,
  onUnbindFolder,
  onSetIncludeSubdirs
}: {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string, icon: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, name: string, icon: string, appearance?: CategoryAppearance) => void
  /** 弹目录选择器绑定 / 更换；已关联时是「更换」 */
  onBindFolder: (category: Category) => void
  onResyncFolder: (category: Category) => void
  onUnbindFolder: (category: Category) => void
  /** 切换「含子文件夹」；改完立刻重扫，不需要重新选目录 */
  onSetIncludeSubdirs: (category: Category, includeSubdirs: boolean) => void
}) {
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📦')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  // 外观字段用字符串存：空串 = "用默认"，与"显式设成 0"区分开
  const [editFontSize, setEditFontSize] = useState('')
  const [editItemHeight, setEditItemHeight] = useState('')
  const [editIconSize, setEditIconSize] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState<'new' | string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim(), newIcon)
      setNewName('')
      setNewIcon('📦')
    }
  }

  const handleEmojiSelect = (emoji: string, target: 'new' | string) => {
    if (target === 'new') setNewIcon(emoji)
    else setEditIcon(emoji)
    setShowEmojiPicker(null)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const beginEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditIcon(cat.icon)
    setEditFontSize(cat.fontSize ? String(cat.fontSize) : '')
    setEditItemHeight(cat.itemHeight ? String(cat.itemHeight) : '')
    setEditIconSize(cat.iconSize ? String(cat.iconSize) : '')
  }

  const commitEdit = () => {
    if (!editingId || !editName.trim()) return
    onUpdate(editingId, editName.trim(), editIcon, {
      fontSize: parseAppearanceValue(editFontSize, 10, 24),
      itemHeight: parseAppearanceValue(editItemHeight, 24, 72),
      iconSize: parseAppearanceValue(editIconSize, 12, 48)
    })
    setEditingId(null)
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass rounded-2xl p-6 w-[480px] max-h-[80vh] overflow-auto shadow-xl shadow-brand-500/5 modal-enter">
        <h2 className="text-lg font-display font-bold text-slate-800 mb-4">管理分类</h2>

        <div className="mb-4 p-3 bg-brand-50/50 rounded-xl">
          <h3 className="text-sm font-medium text-slate-700 mb-2">添加新分类</h3>
          <div className="flex gap-2">
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowEmojiPicker(showEmojiPicker === 'new' ? null : 'new')}
                className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50"
              >
                {newIcon}
              </button>
              {showEmojiPicker === 'new' && (
                <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64" onClick={(e) => e.stopPropagation()}>
                  {EMOJI_LIST.map(emoji => (
                    <button key={emoji} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleEmojiSelect(emoji, 'new')} className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
              placeholder="分类名称"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20">添加</button>
          </div>
        </div>

        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 p-2 bg-white/60 border border-brand-100/40 rounded-xl">
              {editingId === cat.id ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowEmojiPicker(showEmojiPicker === cat.id ? null : cat.id)} className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50">
                        {editIcon}
                      </button>
                      {showEmojiPicker === cat.id && (
                        <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64" onClick={(e) => e.stopPropagation()}>
                          {EMOJI_LIST.map(emoji => (
                            <button key={emoji} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleEmojiSelect(emoji, cat.id)} className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg">
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-400 text-sm" onKeyDown={(e) => e.key === 'Enter' && commitEdit()} autoFocus />
                    <button onClick={commitEdit} className="shrink-0 px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm transition-colors">保存</button>
                    <button onClick={() => setEditingId(null)} className="shrink-0 px-2 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm transition-colors">取消</button>
                  </div>
                  {/* 外观（P2-3）：留空 = 用默认。范围与 validation.ts 里的夹取区间一致。 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[11px] text-slate-500">
                    <span className="text-slate-400">外观（留空用默认）</span>
                    <label className="flex items-center gap-1">
                      字号
                      <input type="number" min={10} max={24} value={editFontSize} placeholder="默认" onChange={(e) => setEditFontSize(e.target.value)} className="w-14 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-brand-400" />
                      px
                    </label>
                    <label className="flex items-center gap-1">
                      条目高
                      <input type="number" min={24} max={72} value={editItemHeight} placeholder="默认" onChange={(e) => setEditItemHeight(e.target.value)} className="w-14 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-brand-400" />
                      px
                    </label>
                    <label className="flex items-center gap-1">
                      图标
                      <input type="number" min={12} max={48} value={editIconSize} placeholder="默认" onChange={(e) => setEditIconSize(e.target.value)} className="w-14 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-brand-400" />
                      px
                    </label>
                  </div>
                  {/* 关联文件夹：与「外观」并列，都是这个分类自己的属性。
                      此前它只有侧边栏右键菜单一条路，用户根本找不到入口。 */}
                  <div className="flex flex-wrap items-center gap-2 pl-1 pt-0.5 text-[11px]">
                    <span className="flex shrink-0 items-center gap-1 font-medium text-brand-700">
                      <LinkSimple size={12} weight="bold" aria-hidden="true" />
                      关联文件夹
                    </span>
                    {cat.linkFolder ? (
                      <>
                        <span
                          title={cat.linkFolder.path}
                          className="min-w-0 flex-1 truncate rounded-md border border-brand-200/70 bg-white/85 px-2 py-0.5 font-mono text-[11px] text-slate-600"
                        >
                          {cat.linkFolder.path}
                        </span>
                        {/* 绑定的时候不问"要不要含子文件夹"——默认仅本层。想改在这里勾，
                            改完立刻重扫，不用重新选一遍目录。 */}
                        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-slate-600">
                          <input
                            type="checkbox"
                            checked={cat.linkFolder.includeSubdirs}
                            onChange={event => onSetIncludeSubdirs(cat, event.target.checked)}
                            className="h-3 w-3 accent-brand-600"
                          />
                          含子文件夹
                        </label>
                        <button type="button" onClick={() => onResyncFolder(cat)} className="focus-ring shrink-0 rounded-lg border border-brand-100 bg-white/75 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700">立即同步</button>
                        <button type="button" onClick={() => onBindFolder(cat)} className="focus-ring shrink-0 rounded-lg border border-brand-100 bg-white/75 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700">更换</button>
                        <button type="button" onClick={() => onUnbindFolder(cat)} className="focus-ring shrink-0 rounded-lg px-2 py-1 font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">解除</button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 text-slate-400">未关联 · 让目录内容自动出现在这个分类</span>
                        <button type="button" onClick={() => onBindFolder(cat)} className="focus-ring shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-brand-700">选择文件夹…</button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <CategoryIcon icon={cat.icon} size={40} className="w-10 h-10 flex items-center justify-center text-xl shrink-0" />
                  <span className="flex-1 text-sm font-medium text-slate-700">{cat.name}</span>
                  {cat.linkFolder && (
                    <LinkSimple size={14} weight="bold" className="shrink-0 text-brand-500" aria-label="已关联文件夹" />
                  )}
                  <span className="text-xs text-slate-400">ID: {cat.id.slice(0, 8)}...</span>
                  <button onClick={() => beginEdit(cat)} className="px-2 py-1 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 text-sm transition-colors">编辑</button>
                  <button
                    onClick={async () => {
                      const confirmed = await window.electronAPI.confirm(`确定删除分类「${cat.name}」吗？该分类下的项目将保留，并回到「全部」视图。`)
                      if (confirmed) onDelete(cat.id)
                    }}
                    className="px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm transition-colors"
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {categories.length === 0 && <div className="text-center text-slate-400 py-8">暂无分类，请添加新分类</div>}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">关闭</button>
        </div>
      </div>
    </div>
  )
})
