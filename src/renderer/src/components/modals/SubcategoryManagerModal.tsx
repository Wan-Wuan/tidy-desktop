import React, { useRef, useState } from 'react'
import type { Category, Subcategory } from '../../../../shared/types'
import { EMOJI_LIST } from './constants'

export const SubcategoryManagerModal = React.memo(function SubcategoryManagerModal({ categories, subcategories, activeCategory, onClose, onAdd, onDelete, onUpdate, onMove }: {
  categories: Category[]
  subcategories: Subcategory[]
  activeCategory: string | null
  onClose: () => void
  onAdd: (name: string, icon: string, parentId: string | null) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, name: string, icon: string) => void
  onMove: (id: string, parentId: string | null) => void
}) {
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📂')
  const [newParentId, setNewParentId] = useState<string | null>(activeCategory)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState<'new' | string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim(), newIcon, newParentId)
      setNewName('')
      setNewIcon('📂')
    }
  }

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      onUpdate(editingId, editName.trim(), editIcon)
      setEditingId(null)
    }
  }

  const handleEmojiSelect = (emoji: string, target: 'new' | string) => {
    if (target === 'new') setNewIcon(emoji)
    else setEditIcon(emoji)
    setShowEmojiPicker(null)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const visibleSubcategories = activeCategory
    ? subcategories.filter(sub => sub.parentId === activeCategory)
    : subcategories

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '全局'
    return categories.find(c => c.id === parentId)?.name || '未知'
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass rounded-2xl p-6 w-[520px] max-h-[80vh] overflow-auto shadow-xl shadow-brand-500/5 modal-enter">
        <h2 className="text-lg font-display font-bold text-slate-800 mb-4">管理子分类</h2>

        <div className="mb-4 p-3 bg-brand-50/50 rounded-xl">
          <h3 className="text-sm font-medium text-slate-700 mb-2">添加子分类</h3>
          <div className="flex gap-2">
            <div className="relative">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowEmojiPicker(showEmojiPicker === 'new' ? null : 'new')} className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50">
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
              placeholder="子分类名称"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <select value={newParentId || ''} onChange={(e) => setNewParentId(e.target.value || null)} className="px-2 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">全局</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <button onClick={handleAdd} className="px-4 py-2 bg-aurora-500 text-white rounded-lg hover:bg-aurora-600 transition-colors shadow-sm shadow-aurora-500/20">添加</button>
          </div>
        </div>

        <div className="space-y-2">
          {visibleSubcategories.map(sub => (
            <div key={sub.id} className="flex items-center gap-2 p-2 bg-white/60 border border-brand-100/40 rounded-xl">
              {editingId === sub.id ? (
                <>
                  <div className="relative">
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowEmojiPicker(showEmojiPicker === sub.id ? null : sub.id)} className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50">
                      {editIcon}
                    </button>
                    {showEmojiPicker === sub.id && (
                      <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64" onClick={(e) => e.stopPropagation()}>
                        {EMOJI_LIST.map(emoji => (
                          <button key={emoji} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleEmojiSelect(emoji, sub.id)} className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg">
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-400 text-sm" onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} autoFocus />
                  <button onClick={handleSaveEdit} className="px-2 py-1 bg-emerald-500 text-white rounded-lg text-sm transition-colors">保存</button>
                  <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm transition-colors">取消</button>
                </>
              ) : (
                <>
                  <span className="text-xl w-10 h-10 flex items-center justify-center">{sub.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700 block truncate">{sub.name}</span>
                    <span className="text-xs text-slate-400">{getParentName(sub.parentId)}</span>
                  </div>
                  <select value={sub.parentId || ''} onChange={(e) => onMove(sub.id, e.target.value || null)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs max-w-[120px]">
                    <option value="">全局</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <button onClick={() => { setEditingId(sub.id); setEditName(sub.name); setEditIcon(sub.icon) }} className="px-2 py-1 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 text-sm transition-colors">编辑</button>
                  <button
                    onClick={async () => {
                      const confirmed = await window.electronAPI.confirm(`确定要删除子分类"${sub.name}"吗？`)
                      if (confirmed) onDelete(sub.id)
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

        {visibleSubcategories.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">暂无子分类</div>}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">关闭</button>
        </div>
      </div>
    </div>
  )
})
