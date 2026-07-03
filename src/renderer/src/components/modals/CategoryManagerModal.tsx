import React, { useRef, useState } from 'react'
import type { Category } from '../../../../shared/types'
import { EMOJI_LIST } from './constants'

export const CategoryManagerModal = React.memo(function CategoryManagerModal({ categories, onClose, onAdd, onDelete, onUpdate }: {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string, icon: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, name: string, icon: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📦')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
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
                <>
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
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-400 text-sm" onKeyDown={(e) => e.key === 'Enter' && editingId && editName.trim() && (onUpdate(editingId, editName.trim(), editIcon), setEditingId(null))} autoFocus />
                  <button onClick={() => { if (editingId && editName.trim()) { onUpdate(editingId, editName.trim(), editIcon); setEditingId(null) } }} className="px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm transition-colors">保存</button>
                  <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm transition-colors">取消</button>
                </>
              ) : (
                <>
                  <span className="text-xl w-10 h-10 flex items-center justify-center">{cat.icon}</span>
                  <span className="flex-1 text-sm font-medium text-slate-700">{cat.name}</span>
                  <span className="text-xs text-slate-400">ID: {cat.id.slice(0, 8)}...</span>
                  <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditIcon(cat.icon) }} className="px-2 py-1 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 text-sm transition-colors">编辑</button>
                  <button
                    onClick={async () => {
                      const confirmed = await window.electronAPI.confirm(`确定要删除分类"${cat.name}"吗？该分类下的应用将被移到"其他"分类。`)
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
