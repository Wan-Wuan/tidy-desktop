import React, { useState } from 'react'
import type { AppItem, Category } from '../../../../shared/types'

export const EditAppModal = React.memo(function EditAppModal({ app, categories, onClose, onUpdate }: {
  app: AppItem
  categories: Category[]
  onClose: () => void
  onUpdate: (id: string, name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam', aliases?: string[]) => void
}) {
  const [name, setName] = useState(app.name)
  const [path, setPath] = useState(app.path)
  const [categoryId, setCategoryId] = useState(app.categoryId || (categories.length > 0 ? categories[0].id : ''))
  const [type, setType] = useState<'app' | 'folder' | 'steam'>(app.type || 'app')
  const [aliasText, setAliasText] = useState((app.aliases || []).join(', '))

  const parseAliases = (value: string) => {
    return value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean)
  }

  const parseSteamUrl = (url: string): { name: string; steamUrl: string } | null => {
    const launchMatch = url.match(/steam:\/\/launch\/(\d+)/)
    if (launchMatch) return { name: '', steamUrl: `steam://launch/${launchMatch[1]}/0` }
    const storeMatch = url.match(/steampowered\.com\/app\/(\d+)/)
    if (storeMatch) return { name: '', steamUrl: `steam://launch/${storeMatch[1]}/0` }
    const runGameMatch = url.match(/steam:\/\/rungameid\/(\d+)/)
    if (runGameMatch) return { name: '', steamUrl: `steam://rungameid/${runGameMatch[1]}` }
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (type === 'steam') {
      const parsed = parseSteamUrl(path.trim())
      if (parsed) {
        onUpdate(app.id, name.trim() || 'Steam 游戏', parsed.steamUrl, categoryId, 'steam', parseAliases(aliasText))
        return
      }
    }
    if (name.trim() && path.trim()) {
      onUpdate(app.id, name.trim(), path.trim(), categoryId, type, parseAliases(aliasText))
    }
  }

  const placeholders: Record<string, { name: string; path: string }> = {
    app: { name: '输入应用名称', path: '输入应用路径，如 C:\\Program Files\\app.exe' },
    folder: { name: '输入文件夹名称', path: '输入文件夹路径，如 D:\\Documents' },
    steam: { name: '输入游戏名称（可选）', path: '粘贴 Steam 链接，如 steam://launch/730/0 或 https://store.steampowered.com/app/730/' }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass rounded-2xl p-6 w-96 shadow-xl shadow-brand-500/5 modal-enter">
        <h2 className="text-lg font-display font-bold text-slate-800 mb-4">编辑应用</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <div className="flex gap-4 flex-wrap">
              {(['app', 'folder', 'steam'] as const).map(itemType => (
                <label key={itemType} className="flex items-center text-sm text-slate-600">
                  <input
                    type="radio"
                    value={itemType}
                    checked={type === itemType}
                    onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                    className="mr-2 accent-brand-500"
                  />
                  {{ app: '应用程序', folder: '文件夹', steam: 'Steam 链接' }[itemType]}
                </label>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
              placeholder={placeholders[type].name}
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">{type === 'steam' ? 'Steam 链接' : '路径'}</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
              placeholder={placeholders[type].path}
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
            >
              <option value="">无分类</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">搜索别名</label>
            <input
              type="text"
              value={aliasText}
              onChange={(e) => setAliasText(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
              placeholder="ps, vx, work"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">取消</button>
            <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/20">保存</button>
          </div>
        </form>
      </div>
    </div>
  )
})
