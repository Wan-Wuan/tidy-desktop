import React, { useEffect, useState } from 'react'
import type { Category } from '../../../../shared/types'

export const AddAppModal = React.memo(function AddAppModal({ categories, onClose, onAdd, defaultCategory }: {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam', aliases?: string[]) => void
  defaultCategory?: string | null
}) {
  const getInitialCategory = () => {
    if (defaultCategory && categories.find(c => c.id === defaultCategory)) {
      return defaultCategory
    }
    if (categories.length > 0) {
      return categories[0].id
    }
    return ''
  }

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [categoryId, setCategoryId] = useState(getInitialCategory())
  const [type, setType] = useState<'app' | 'folder' | 'steam'>('app')
  const [aliasText, setAliasText] = useState('')

  const parseAliases = (value: string) => {
    return value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean)
  }

  useEffect(() => {
    const valid = getInitialCategory()
    if (valid !== categoryId) {
      setCategoryId(valid)
    }
  }, [categories, defaultCategory])

  const parseSteamUrl = (url: string): { name: string; steamUrl: string } | null => {
    const launchMatch = url.match(/steam:\/\/launch\/(\d+)/)
    if (launchMatch) {
      return { name: '', steamUrl: `steam://launch/${launchMatch[1]}/0` }
    }
    const storeMatch = url.match(/steampowered\.com\/app\/(\d+)/)
    if (storeMatch) {
      return { name: '', steamUrl: `steam://launch/${storeMatch[1]}/0` }
    }
    const runGameMatch = url.match(/steam:\/\/rungameid\/(\d+)/)
    if (runGameMatch) {
      return { name: '', steamUrl: `steam://rungameid/${runGameMatch[1]}` }
    }
    return null
  }

  const handlePathChange = (value: string) => {
    if (type === 'steam') {
      setPath(value)
      const parsed = parseSteamUrl(value)
      if (parsed && !name.trim()) {
        const idMatch = value.match(/(\d+)/)
        if (idMatch) {
          setName(`Steam Game ${idMatch[1]}`)
        }
      }
    } else {
      setPath(value)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (type === 'steam') {
      const parsed = parseSteamUrl(path.trim())
      if (parsed) {
        onAdd(name.trim() || 'Steam 游戏', parsed.steamUrl, categoryId, 'steam', parseAliases(aliasText))
        return
      }
    }
    if (name.trim() && path.trim()) {
      onAdd(name.trim(), path.trim(), categoryId, type, parseAliases(aliasText))
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
        <h2 className="text-lg font-display font-bold text-slate-800 mb-4">添加应用</h2>

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
              onChange={(e) => handlePathChange(e.target.value)}
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
            <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20">添加</button>
          </div>
        </form>
      </div>
    </div>
  )
})
