import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AppItem, Category, Config } from '../../shared/types'
import { pinyin } from 'pinyin-pro'
import { v4 as uuidv4 } from 'uuid'

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<Config>
      saveConfig: (config: Config) => Promise<boolean>
      getApps: () => Promise<{ apps: AppItem[] }>
      saveApps: (data: { apps: AppItem[] }) => Promise<boolean>
      getCategories: () => Promise<{ categories: Category[] }>
      saveCategories: (data: { categories: Category[] }) => Promise<boolean>
      openApp: (path: string) => Promise<boolean>
      openFolder: (path: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      selectFolder: () => Promise<string | null>
      hideMainWindow: () => Promise<void>
      confirm: (message: string) => Promise<boolean>
      extractIcon: (filePath: string) => Promise<string | null>
    }
  }
}

interface SearchEngineInfo {
  key: string
  name: string
  url: string
}

const EMOJI_LIST = ['🌐', '💻', '🎬', '📄', '🎮', '📦', '🎨', '📱', '🔧', '🎵', '📷', '🛒', '💼', '📚', '🗂️', '⚙️']

function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [activeEngine, setActiveEngine] = useState<SearchEngineInfo | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const categoryBarRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const draggedAppIdRef = useRef<string | null>(null)
  const appsRef = useRef<AppItem[]>([])
  const activeCategoryRef = useRef<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    appsRef.current = apps
  }, [apps])

  useEffect(() => {
    activeCategoryRef.current = activeCategory
  }, [activeCategory])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSettings && !showAddApp && !showCategoryManager) {
        window.electronAPI.hideMainWindow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showAddApp, showCategoryManager])

  const loadData = async () => {
    const [configData, appsData, categoriesData] = await Promise.all([
      window.electronAPI.getConfig(),
      window.electronAPI.getApps(),
      window.electronAPI.getCategories()
    ])
    setConfig(configData)
    setApps(appsData.apps)
    setCategories(categoriesData.categories.sort((a, b) => a.order - b.order))
  }

  const getPinyin = (name: string): string => {
    try {
      return pinyin(name, { toneType: 'none', type: 'array' }).join('')
    } catch {
      return name.toLowerCase()
    }
  }

  const getFirstLetter = (name: string): string => {
    try {
      return pinyin(name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
    } catch {
      return name.charAt(0).toLowerCase()
    }
  }

  const getFileNameFromPath = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, '/').split('/')
    const fileName = parts[parts.length - 1] || ''
    return fileName.replace(/\.exe$/i, '').replace(/\.lnk$/i, '')
  }

  const checkSearchEngine = useCallback((input: string): { isEngine: boolean; engine?: SearchEngineInfo } => {
    if (!config?.searchEngines) return { isEngine: false }

    const trimmed = input.trimEnd()
    
    for (const [key, engine] of Object.entries(config.searchEngines)) {
      const engineName = engine.name.toLowerCase()
      const aliases = [key, engineName]
      
      if (key === 'b') aliases.push('bing', 'baidu', 'bd')
      if (key === 'g') aliases.push('google')
      if (key === 'baidu') aliases.push('b', 'bd', 'baidu')
      
      if (aliases.includes(trimmed.toLowerCase())) {
        return {
          isEngine: true,
          engine: {
            key,
            name: engine.name,
            url: engine.url
          }
        }
      }
    }

    return { isEngine: false }
  }, [config])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setActiveEngine(null)
  }, [])

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)

    if (activeEngine) {
      return
    }

    if (value.endsWith(' ')) {
      const engineCheck = checkSearchEngine(value)
      if (engineCheck.isEngine && engineCheck.engine) {
        setActiveEngine(engineCheck.engine)
        setSearchQuery('')
        return
      }
    }
  }, [activeEngine, checkSearchEngine])

  const filterApps = useCallback(() => {
    let filtered = apps

    if (activeCategory) {
      filtered = filtered.filter(app => app.categoryId === activeCategory)
    }

    if (!searchQuery.trim()) {
      return filtered
    }

    const query = searchQuery.toLowerCase().trim()
    
    return filtered.filter(app => {
      const nameMatch = app.name.toLowerCase().includes(query)
      const pinyinMatch = app.pinyin.toLowerCase().includes(query)
      const firstLetterMatch = app.firstLetter.toLowerCase().startsWith(query)
      return nameMatch || pinyinMatch || firstLetterMatch
    })
  }, [apps, searchQuery, activeCategory])

  const handleOpenApp = async (app: AppItem) => {
    if (app.type === 'folder') {
      await window.electronAPI.openFolder(app.path)
    } else {
      await window.electronAPI.openApp(app.path)
    }
  }

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (activeEngine) {
      if (searchQuery.trim()) {
        const url = activeEngine.url + encodeURIComponent(searchQuery.trim())
        await window.electronAPI.openUrl(url)
        setActiveEngine(null)
        setSearchQuery('')
      }
      return
    }

    const query = searchQuery.trim()
    if (!query) return

    const searchEngineMatch = query.match(/^([a-z]+)\s+(.+)$/i)
    if (searchEngineMatch) {
      const [, prefix, searchTerm] = searchEngineMatch
      const engine = config?.searchEngines[prefix.toLowerCase()]
      if (engine) {
        const url = engine.url + encodeURIComponent(searchTerm)
        await window.electronAPI.openUrl(url)
        setSearchQuery('')
        return
      }
    }

    const filteredApps = filterApps()
    if (filteredApps.length > 0) {
      await handleOpenApp(filteredApps[0])
      setSearchQuery('')
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (activeEngine) {
        setActiveEngine(null)
        setSearchQuery('')
      }
    }
    if (e.key === 'Backspace' && searchQuery === '' && activeEngine) {
      setActiveEngine(null)
    }
  }

  const handleAddApp = async (name: string, path: string, categoryId: string, type: 'app' | 'folder' = 'app') => {
    const duplicate = apps.find(app => app.name === name)
    if (duplicate) {
      alert(`已存在同名应用"${name}"，请使用其他名称。`)
      return
    }

    const newApp: AppItem = {
      id: uuidv4(),
      name,
      path,
      icon: '',
      categoryId,
      pinyin: getPinyin(name),
      firstLetter: getFirstLetter(name),
      type
    }

    const updatedApps = [...apps, newApp]
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setShowAddApp(false)

    const iconPath = await window.electronAPI.extractIcon(path)
    if (iconPath) {
      const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
      setApps(withIcon)
      await window.electronAPI.saveApps({ apps: withIcon })
    }
  }

  const handleAddFolder = async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return

    const parts = folderPath.replace(/\\/g, '/').split('/')
    const folderName = parts[parts.length - 1] || '文件夹'

    const duplicate = apps.find(app => app.name === folderName)
    if (duplicate) {
      alert(`已存在同名文件夹"${folderName}"，请使用其他名称。`)
      return
    }

    const newApp: AppItem = {
      id: uuidv4(),
      name: folderName,
      path: folderPath,
      icon: '',
      categoryId: 'folder',
      pinyin: getPinyin(folderName),
      firstLetter: getFirstLetter(folderName),
      type: 'folder'
    }

    const updatedApps = [...apps, newApp]
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })

    const iconPath = await window.electronAPI.extractIcon(folderPath)
    if (iconPath) {
      const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
      setApps(withIcon)
      await window.electronAPI.saveApps({ apps: withIcon })
    }
  }

  const handleDeleteApp = async (id: string) => {
    const app = apps.find(a => a.id === id)
    if (app) {
      const confirmed = await window.electronAPI.confirm(`确定要删除"${app.name}"吗？`)
      if (!confirmed) return
    }
    const updatedApps = apps.filter(app => app.id !== id)
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleMoveAppToCategory = async (appId: string, categoryId: string) => {
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app =>
      app.id === appId ? { ...app, categoryId } : app
    )
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const parseFilesToApps = (files: File[], categoryId: string): AppItem[] => {
    const currentApps = appsRef.current
    const newApps: AppItem[] = []

    for (const file of files) {
      const filePath = (file as any).path
      if (!filePath) continue

      const isExe = filePath.toLowerCase().endsWith('.exe')
      const isLnk = filePath.toLowerCase().endsWith('.lnk')
      const isDirectory = (file as any).type === '' && !filePath.includes('.')

      if (isExe || isLnk) {
        const name = getFileNameFromPath(filePath)
        if (!currentApps.find(app => app.name === name)) {
          newApps.push({
            id: uuidv4(),
            name,
            path: filePath,
            icon: '',
            categoryId,
            pinyin: getPinyin(name),
            firstLetter: getFirstLetter(name),
            type: 'app'
          })
        }
      } else if (isDirectory) {
        const parts = filePath.replace(/\\/g, '/').split('/')
        const folderName = parts[parts.length - 1] || '文件夹'
        if (!currentApps.find(app => app.name === folderName)) {
          newApps.push({
            id: uuidv4(),
            name: folderName,
            path: filePath,
            icon: '',
            categoryId,
            pinyin: getPinyin(folderName),
            firstLetter: getFirstLetter(folderName),
            type: 'folder'
          })
        }
      }
    }

    return newApps
  }

  const extractIconsForApps = async (newApps: AppItem[]) => {
    const appsWithIcons: AppItem[] = []
    for (const app of newApps) {
      const iconPath = await window.electronAPI.extractIcon(app.path)
      appsWithIcons.push({ ...app, icon: iconPath || '' })
    }

    if (appsWithIcons.length > 0) {
      const currentApps = appsRef.current
      const updatedApps = currentApps.map(a => {
        const found = appsWithIcons.find(n => n.id === a.id)
        return found || a
      })
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })
    }
  }

  const handleUpdateConfig = async (newConfig: Config) => {
    setConfig(newConfig)
    await window.electronAPI.saveConfig(newConfig)
  }

  const handleAddCategory = async (name: string, icon: string) => {
    const newCategory: Category = {
      id: uuidv4(),
      name,
      icon,
      order: categories.length + 1
    }
    const updatedCategories = [...categories, newCategory]
    setCategories(updatedCategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories })
  }

  const handleDeleteCategory = async (id: string) => {
    const updatedCategories = categories.filter(cat => cat.id !== id)
    setCategories(updatedCategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories })
    
    if (activeCategory === id) {
      setActiveCategory(null)
    }

    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app => 
      app.categoryId === id ? { ...app, categoryId: 'other' } : app
    )
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleUpdateCategory = async (id: string, name: string, icon: string) => {
    const updatedCategories = categories.map(cat => 
      cat.id === id ? { ...cat, name, icon } : cat
    )
    setCategories(updatedCategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories })
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current++
      if (dragCounterRef.current === 1) {
        setIsDragging(true)
      }
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setIsDragging(false)
      }
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    dragCounterRef.current = 0
    setIsDragging(false)
    setDraggedAppId(null)
    setDragOverCategory(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const targetCategory = activeCategoryRef.current || 'other'
    const newApps = parseFilesToApps(files, targetCategory)

    if (newApps.length > 0) {
      const updatedApps = [...appsRef.current, ...newApps]
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })
      await extractIconsForApps(newApps)
    }
  }, [])

  const getEngineDisplayName = (engine: SearchEngineInfo) => {
    const names: { [key: string]: string } = {
      b: 'Bing',
      g: 'Google',
      baidu: 'Baidu',
      bd: 'Baidu'
    }
    return names[engine.key] || engine.name
  }

  const filteredApps = filterApps()

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">tidy_desktop</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddApp(true)}
            className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            添加应用
          </button>
          <button
            onClick={handleAddFolder}
            className="px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
          >
            添加文件夹
          </button>
          <button
            onClick={() => setShowCategoryManager(true)}
            className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
          >
            管理分类
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          >
            设置
          </button>
        </div>
      </header>

      <div className="px-4 py-3">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          {activeEngine && (
            <div className="absolute left-3 z-10 flex items-center">
              <span className="bg-blue-500 text-white px-2 py-0.5 rounded text-xs font-medium">
                {getEngineDisplayName(activeEngine)}
              </span>
            </div>
          )}
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchInputChange}
            onKeyDown={handleSearchKeyDown}
            placeholder={activeEngine ? `在 ${activeEngine.name} 中搜索...` : '搜索应用... (输入 b/g + 空格调用搜索引擎)'}
            className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              activeEngine ? 'pl-24' : ''
            }`}
          />
          <button
            type="submit"
            className="absolute right-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            {activeEngine ? '搜索' : '打开'}
          </button>
        </form>
      </div>

      <div ref={categoryBarRef} className="px-4 pb-2 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
            activeCategory === null
              ? 'bg-blue-500 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          全部
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const appId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
              const hasFiles = e.dataTransfer.types.includes('Files')
              if (appId || hasFiles) {
                e.dataTransfer.dropEffect = appId ? 'move' : 'copy'
                setDragOverCategory(cat.id)
              }
            }}
            onDragLeave={() => setDragOverCategory(null)}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOverCategory(null)

              const appId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
              const files = Array.from(e.dataTransfer.files)

              if (files.length > 0) {
                const newApps = parseFilesToApps(files, cat.id)
                if (newApps.length > 0) {
                  const updatedApps = [...appsRef.current, ...newApps]
                  setApps(updatedApps)
                  await window.electronAPI.saveApps({ apps: updatedApps })
                  await extractIconsForApps(newApps)
                }
                draggedAppIdRef.current = null
                setDraggedAppId(null)
              } else if (appId) {
                await handleMoveAppToCategory(appId, cat.id)
                draggedAppIdRef.current = null
                setDraggedAppId(null)
              }
            }}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? 'bg-blue-500 text-white'
                : dragOverCategory === cat.id
                  ? 'bg-green-500 text-white scale-110 shadow-lg ring-2 ring-green-300'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      <main 
        ref={dropZoneRef}
        className={`flex-1 overflow-auto p-4 ${isDragging ? 'bg-blue-50' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-2">📥</div>
              <p className="text-blue-600 font-medium">拖放文件或文件夹到此处添加</p>
              <p className="text-sm text-gray-500 mt-1">支持 .exe、.lnk 文件和文件夹</p>
            </div>
          </div>
        )}

        {!isDragging && (
          <div className="grid grid-cols-6 gap-4">
            {filteredApps.map(app => (
              <div
                key={app.id}
                draggable
                onDragStart={(e) => {
                  draggedAppIdRef.current = app.id
                  setDraggedAppId(app.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', app.id)
                }}
                onDragEnd={() => {
                  setTimeout(() => {
                    draggedAppIdRef.current = null
                    setDraggedAppId(null)
                    setDragOverCategory(null)
                  }, 100)
                }}
                className={`bg-white rounded-lg p-4 hover:shadow-md transition-all cursor-pointer group relative ${
                  draggedAppId === app.id ? 'opacity-50 scale-95' : ''
                }`}
                onClick={() => handleOpenApp(app)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteApp(app.id)
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                >
                  ×
                </button>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 mx-auto ${
                  app.type === 'folder' ? 'bg-orange-100' : 'bg-blue-100'
                }`}>
                  {app.icon ? (
                    <img src={app.icon.startsWith('/') || app.icon.match(/^[A-Za-z]:/) ? `file://${app.icon}` : app.icon} alt={app.name} className="w-10 h-10" />
                  ) : (
                    <span className="text-2xl">{app.type === 'folder' ? '📁' : '📦'}</span>
                  )}
                </div>
                <p className="text-sm text-center text-gray-700 truncate">{app.name}</p>
              </div>
            ))}
          </div>
        )}

        {!isDragging && filteredApps.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            {searchQuery ? '未找到匹配的应用' : '暂无应用，点击"添加应用"或"添加文件夹"开始使用'}
          </div>
        )}
      </main>

      <footer className="bg-white border-t px-4 py-2 text-xs text-gray-400 flex justify-between">
        <span>Esc 关闭窗口</span>
        <span>快捷键: {config?.hotkey || 'Alt+Space'} | 搜索: {config?.searchHotkey || 'Ctrl+K'}</span>
      </footer>

      {showSettings && config && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onSave={handleUpdateConfig}
        />
      )}

      {showAddApp && (
        <AddAppModal
          categories={categories}
          onClose={() => setShowAddApp(false)}
          onAdd={handleAddApp}
          defaultCategory={activeCategory || categories[0]?.id || 'other'}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onAdd={handleAddCategory}
          onDelete={handleDeleteCategory}
          onUpdate={handleUpdateCategory}
        />
      )}
    </div>
  )
}

function SettingsModal({ config, onClose, onSave }: {
  config: Config
  onClose: () => void
  onSave: (config: Config) => void
}) {
  const [hotkey, setHotkey] = useState(config.hotkey)
  const [searchHotkey, setSearchHotkey] = useState(config.searchHotkey || 'Ctrl+K')
  const [engines, setEngines] = useState(config.searchEngines)

  const handleSave = () => {
    onSave({
      ...config,
      hotkey,
      searchHotkey,
      searchEngines: engines
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-auto">
        <h2 className="text-lg font-semibold mb-4">设置</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            显示/隐藏主窗口
          </label>
          <select
            value={hotkey}
            onChange={(e) => setHotkey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Alt+Space">Alt + Space</option>
            <option value="Ctrl+Space">Ctrl + Space</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            快速搜索框
          </label>
          <select
            value={searchHotkey}
            onChange={(e) => setSearchHotkey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Ctrl+K">Ctrl + K</option>
            <option value="Ctrl+Space">Ctrl + Space</option>
            <option value="Alt+Space">Alt + Space</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">仅弹出搜索框，不显示主窗口</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            搜索引擎
          </label>
          {Object.entries(engines).map(([key, engine]) => (
            <div key={key} className="mb-2 p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm bg-gray-200 px-2 py-0.5 rounded">
                  {key} + 空格
                </span>
                <span className="text-sm text-gray-600">→ {engine.name}</span>
              </div>
              <input
                type="text"
                value={engine.url}
                onChange={(e) => setEngines({
                  ...engines,
                  [key]: { ...engine, url: e.target.value }
                })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="搜索引擎URL"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAppModal({ categories, onClose, onAdd, defaultCategory }: {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string, path: string, categoryId: string, type: 'app' | 'folder') => void
  defaultCategory?: string | null
}) {
  const getInitialCategory = () => {
    if (categories.length > 0) {
      const match = categories.find(c => c.id === defaultCategory)
      if (match) return match.id
      return categories[0].id
    }
    return 'other'
  }

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [categoryId, setCategoryId] = useState(getInitialCategory())
  const [type, setType] = useState<'app' | 'folder'>('app')

  useEffect(() => {
    const valid = getInitialCategory()
    if (valid !== categoryId) {
      setCategoryId(valid)
    }
  }, [categories, defaultCategory])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && path.trim()) {
      onAdd(name.trim(), path.trim(), categoryId, type)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">添加应用</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              类型
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="app"
                  checked={type === 'app'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder')}
                  className="mr-2"
                />
                应用程序
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="folder"
                  checked={type === 'folder'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder')}
                  className="mr-2"
                />
                文件夹
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={type === 'app' ? '输入应用名称' : '输入文件夹名称'}
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              路径
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={type === 'app' ? '输入应用路径，如 C:\Program Files\app.exe' : '输入文件夹路径，如 D:\Documents'}
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              分类
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CategoryManagerModal({ categories, onClose, onAdd, onDelete, onUpdate }: {
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

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditIcon(cat.icon)
  }

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      onUpdate(editingId, editName.trim(), editIcon)
      setEditingId(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleEmojiSelect = (emoji: string, target: 'new' | string) => {
    if (target === 'new') {
      setNewIcon(emoji)
    } else {
      setEditIcon(emoji)
    }
    setShowEmojiPicker(null)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[480px] max-h-[80vh] overflow-auto">
        <h2 className="text-lg font-semibold mb-4">管理分类</h2>
        
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">添加新分类</h3>
          <div className="flex gap-2">
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowEmojiPicker(showEmojiPicker === 'new' ? null : 'new')}
                className="w-10 h-10 border border-gray-300 rounded flex items-center justify-center text-xl hover:bg-gray-100"
              >
                {newIcon}
              </button>
              {showEmojiPicker === 'new' && (
                <div className="absolute top-12 left-0 z-20 bg-white border rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1 w-64"
                  onClick={(e) => e.stopPropagation()}
                >
                  {EMOJI_LIST.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleEmojiSelect(emoji, 'new')}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-lg"
                    >
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="分类名称"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              添加
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 p-2 bg-white border rounded-lg">
              {editingId === cat.id ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowEmojiPicker(showEmojiPicker === cat.id ? null : cat.id)}
                      className="w-10 h-10 border border-gray-300 rounded flex items-center justify-center text-xl hover:bg-gray-100"
                    >
                      {editIcon}
                    </button>
                    {showEmojiPicker === cat.id && (
                      <div className="absolute top-12 left-0 z-20 bg-white border rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1 w-64"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {EMOJI_LIST.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleEmojiSelect(emoji, cat.id)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-lg"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xl w-10 h-10 flex items-center justify-center">{cat.icon}</span>
                  <span className="flex-1 text-sm font-medium">{cat.name}</span>
                  <span className="text-xs text-gray-400">ID: {cat.id.slice(0, 8)}...</span>
                  <button
                    onClick={() => handleStartEdit(cat)}
                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
                  >
                    编辑
                  </button>
                  <button
                    onClick={async () => {
                      const confirmed = await window.electronAPI.confirm(`确定要删除分类"${cat.name}"吗？该分类下的应用将被移到"其他"分类。`)
                      if (confirmed) onDelete(cat.id)
                    }}
                    className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {categories.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            暂无分类，请添加新分类
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
