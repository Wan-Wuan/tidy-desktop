import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AppItem, Category, Subcategory, Config, UISettings } from '../../shared/types'
import { pinyin } from 'pinyin-pro'
import { v4 as uuidv4 } from 'uuid'

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<Config>
      saveConfig: (config: Config) => Promise<boolean>
      getApps: () => Promise<{ apps: AppItem[] }>
      saveApps: (data: { apps: AppItem[] }) => Promise<boolean>
      getCategories: () => Promise<{ categories: Category[]; subcategories: Subcategory[] }>
      saveCategories: (data: { categories: Category[]; subcategories: Subcategory[] }) => Promise<boolean>
      openApp: (path: string) => Promise<boolean>
      openFolder: (path: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      selectFolder: () => Promise<string | null>
      hideMainWindow: () => Promise<void>
      confirm: (message: string) => Promise<boolean>
      extractIcon: (filePath: string) => Promise<string | null>
      setAutoStart: (enabled: boolean) => Promise<boolean>
      getAutoStart: () => Promise<boolean>
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
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null)
  const [showSubcategoryManager, setShowSubcategoryManager] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [dragOverAppId, setDragOverAppId] = useState<string | null>(null)
  const [activeEngine, setActiveEngine] = useState<SearchEngineInfo | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const categoryBarRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const draggedAppIdRef = useRef<string | null>(null)
  const appsRef = useRef<AppItem[]>([])
  const categoriesRef = useRef<Category[]>([])
  const activeCategoryRef = useRef<string | null>(null)
  const isExternalDragRef = useRef(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    appsRef.current = apps
  }, [apps])

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  useEffect(() => {
    activeCategoryRef.current = activeCategory
  }, [activeCategory])

  useEffect(() => {
    const resetExternalDrag = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        dragCounterRef.current = 0
        setIsDragging(false)
        isExternalDragRef.current = false
      }
    }
    document.addEventListener('dragleave', resetExternalDrag)
    return () => document.removeEventListener('dragleave', resetExternalDrag)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSettings && !showAddApp && !showCategoryManager && !showSubcategoryManager) {
        window.electronAPI.hideMainWindow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showAddApp, showCategoryManager, showSubcategoryManager])

  const loadData = async () => {
    const [configData, appsData, categoriesData] = await Promise.all([
      window.electronAPI.getConfig(),
      window.electronAPI.getApps(),
      window.electronAPI.getCategories()
    ])
    setConfig(configData)

    const loadedApps = (appsData.apps || []).map(app => ({
      ...app,
      id: app.id || '',
      name: app.name || '',
      path: app.path || '',
      icon: app.icon || '',
      categoryId: app.categoryId || '',
      subcategoryId: app.subcategoryId || null,
      pinyin: app.pinyin || '',
      firstLetter: app.firstLetter || '',
      type: app.type || 'app'
    }))
    setApps(loadedApps)

    const sortedCats = (categoriesData.categories || []).sort((a, b) => a.order - b.order)
    setCategories(sortedCats)
    setSubcategories(categoriesData.subcategories || [])

    if (!activeCategoryRef.current && sortedCats.length > 0) {
      setActiveCategory(sortedCats[0].id)
      activeCategoryRef.current = sortedCats[0].id
    }

    const needsIconUpdate = loadedApps.filter(a => !a.icon || !a.icon.startsWith('data:') || a.icon.length < 1000)
    if (needsIconUpdate.length > 0) {
      const BATCH_SIZE = 3
      for (let i = 0; i < needsIconUpdate.length; i += BATCH_SIZE) {
        const batch = needsIconUpdate.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async app => {
            const icon = await window.electronAPI.extractIcon(app.path)
            return { id: app.id, icon: icon || '' }
          })
        )
        const currentApps = appsRef.current
        const updated = currentApps.map(a => {
          const r = results.find(r => r.id === a.id)
          return r ? { ...a, icon: r.icon } : a
        })
        setApps(updated)
      }
      await window.electronAPI.saveApps({ apps: appsRef.current })
    }
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
      
      if (key === 'b') aliases.push('bing')
      if (key === 'g') aliases.push('google')
      if (key === 'bd') aliases.push('baidu')
      
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

    if (activeSubcategoryId) {
      filtered = filtered.filter(app => app.subcategoryId === activeSubcategoryId)
    }

    if (!searchQuery.trim()) {
      return filtered
    }

    const terms = searchQuery.toLowerCase().trim().split(/\s+/)
    
    const matched = filtered.filter(app => {
      const name = (app.name || '').toLowerCase()
      const pinyin = (app.pinyin || '').toLowerCase()
      const firstLetter = (app.firstLetter || '').toLowerCase()
      const nameWords = name.split(/[\s\-_.,/\\|]+/)

      return terms.every(term => {
        if (name.includes(term)) return true
        if (pinyin.includes(term)) return true
        if (firstLetter.startsWith(term)) return true

        for (let i = 0; i < nameWords.length; i++) {
          if (nameWords[i].startsWith(term)) return true
        }

        let wi = 0
        for (let ti = 0; ti < term.length && wi < nameWords.length; wi++) {
          let matched = false
          for (let tj = ti; tj < term.length; tj++) {
            const sub = term.slice(ti, tj + 1)
            if (nameWords[wi] && nameWords[wi].startsWith(sub)) {
              matched = true
              ti = tj + 1
              break
            }
          }
          if (!matched) break
        }

        const flMatch = (() => {
          let ti = 0
          for (let wi = 0; wi < nameWords.length && ti < term.length; wi++) {
            const ch = nameWords[wi][0]
            if (ch === term[ti]) ti++
          }
          return ti === term.length
        })()

        if (flMatch) return true

        const pinyinWords = pinyin.split(/[\s\-_.,/\\|]+/)
        for (let i = 0; i < pinyinWords.length; i++) {
          if (pinyinWords[i].startsWith(term)) return true
        }

        let pti = 0
        for (let wi = 0; wi < pinyinWords.length && pti < term.length; wi++) {
          const ch = pinyinWords[wi][0]
          if (ch === term[pti]) pti++
        }
        if (pti === term.length) return true

        return false
      })
    })

    const suggestion = getFolderSuggestion(searchQuery)
    if (suggestion && matched.length === 0) {
      return [suggestion]
    }
    if (suggestion) {
      return [suggestion, ...matched]
    }

    return matched
  }, [apps, searchQuery, activeCategory, activeSubcategoryId])

  const handleOpenApp = async (app: AppItem) => {
    if (app.id === '__folder_path__') {
      await window.electronAPI.openFolder(app.path)
      setSearchQuery('')
      return
    }
    if (app.type === 'folder') {
      await window.electronAPI.openFolder(app.path)
    } else {
      await window.electronAPI.openApp(app.path)
    }
    setSearchQuery('')
  }

  const isFolderPath = (query: string): boolean => {
    const trimmed = query.trim()
    if (/^[A-Za-z]:\\/.test(trimmed) || /^[A-Za-z]:\//.test(trimmed)) return true
    if (trimmed.startsWith('\\\\')) return true
    if (trimmed.startsWith('/') && trimmed.length > 1) return true
    return false
  }

  const getFolderSuggestion = (query: string): AppItem | null => {
    const trimmed = query.trim()
    if (!isFolderPath(trimmed)) return null
    const folderName = trimmed.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || trimmed
    return {
      id: '__folder_path__',
      name: `打开文件夹: ${folderName}`,
      path: trimmed,
      icon: '',
      categoryId: '',
      pinyin: '',
      firstLetter: '',
      type: 'folder'
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
    if (categories.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

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
    if (categories.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

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
      categoryId: '',
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
      app.id === appId ? { ...app, categoryId, subcategoryId: null } : app
    )
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const parseFilesToApps = (files: File[], categoryId: string): AppItem[] => {
    const currentApps = appsRef.current
    const newApps: AppItem[] = []

    const execExts = ['.exe', '.lnk', '.msi', '.bat', '.cmd', '.vbs', '.ps1']
    const docExts = ['.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.txt', '.rtf', '.csv']
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']
    const mediaExts = ['.mp3', '.mp4', '.wav', '.avi', '.mkv', '.flv', '.wmv', '.mov', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg']
    const allFileExts = [...execExts, ...docExts, ...archiveExts, ...mediaExts]

    for (const file of files) {
      const filePath = (file as any).path
      if (!filePath) continue

      const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'))
      const isKnownFile = allFileExts.includes(ext)
      const isDirectory = (file as any).type === '' && !filePath.includes('.')

      if (isKnownFile) {
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
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories })
  }

  const handleDeleteCategory = async (id: string) => {
    const updatedCategories = categories.filter(cat => cat.id !== id)
    setCategories(updatedCategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories })
    
    if (activeCategory === id) {
      if (updatedCategories.length > 0) {
        setActiveCategory(updatedCategories[0].id)
      } else {
        setActiveCategory(null)
      }
    }

    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app => 
      app.categoryId === id ? { ...app, categoryId: '' } : app
    )
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleUpdateCategory = async (id: string, name: string, icon: string) => {
    const updatedCategories = categories.map(cat => 
      cat.id === id ? { ...cat, name, icon } : cat
    )
    setCategories(updatedCategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories })
  }

  const handleAddSubcategory = async (name: string, icon: string, parentId: string | null) => {
    const newSub: Subcategory = { id: uuidv4(), name, icon, parentId }
    const updated = [...subcategories, newSub]
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
  }

  const handleDeleteSubcategory = async (id: string) => {
    const updated = subcategories.filter(s => s.id !== id)
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
    if (activeSubcategoryId === id) setActiveSubcategoryId(null)
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(a => a.subcategoryId === id ? { ...a, subcategoryId: null } : a)
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleUpdateSubcategory = async (id: string, name: string, icon: string) => {
    const updated = subcategories.map(s => s.id === id ? { ...s, name, icon } : s)
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
  }

  const handleMoveSubcategory = async (id: string, newParentId: string | null) => {
    const updated = subcategories.map(s => s.id === id ? { ...s, parentId: newParentId } : s)
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
  }

  const handleMoveAppToSubcategory = async (appId: string, subcategoryId: string | null) => {
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(a => a.id === appId ? { ...a, subcategoryId } : a)
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const [draggedSubId, setDraggedSubId] = useState<string | null>(null)
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null)

  const handleReorderSubcategory = async (sourceId: string, targetId: string) => {
    const sourceIndex = subcategories.findIndex(s => s.id === sourceId)
    const targetIndex = subcategories.findIndex(s => s.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    const updated = [...subcategories]
    const [moved] = updated.splice(sourceIndex, 1)
    updated.splice(targetIndex, 0, moved)
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
  }

  const visibleSubcategories = subcategories.filter(s => s.parentId === activeCategory)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedAppIdRef.current) return
    if (e.dataTransfer.types.includes('Files')) {
      isExternalDragRef.current = true
      dragCounterRef.current++
      if (dragCounterRef.current === 1) {
        setIsDragging(true)
      }
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isExternalDragRef.current) return
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
      isExternalDragRef.current = false
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isExternalDragRef.current) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    dragCounterRef.current = 0
    setIsDragging(false)
    isExternalDragRef.current = false
    setDraggedAppId(null)
    setDragOverCategory(null)
    setDragOverAppId(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    isExternalDragRef.current = false

    if (draggedAppIdRef.current) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    if (categoriesRef.current.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

    const targetCategory = activeCategoryRef.current || (categoriesRef.current.length > 0 ? categoriesRef.current[0].id : '')
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

  const handleReorderApp = async (sourceId: string, targetId: string) => {
    const currentApps = appsRef.current
    const sourceIndex = currentApps.findIndex(a => a.id === sourceId)
    const targetIndex = currentApps.findIndex(a => a.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return

    const updated = [...currentApps]
    const [moved] = updated.splice(sourceIndex, 1)
    updated.splice(targetIndex, 0, moved)
    setApps(updated)
    await window.electronAPI.saveApps({ apps: updated })
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
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setActiveSubcategoryId(null) }}
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

      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {visibleSubcategories.map(sub => (
          <button
            key={sub.id}
            draggable
            onClick={() => setActiveSubcategoryId(sub.id)}
            onDragStart={(e) => {
              setDraggedSubId(sub.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', sub.id)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (draggedSubId && draggedSubId !== sub.id) {
                e.dataTransfer.dropEffect = 'move'
                setDragOverSubId(sub.id)
              } else {
                const appId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
                if (appId) {
                  e.dataTransfer.dropEffect = 'move'
                }
              }
            }}
            onDragLeave={() => setDragOverSubId(null)}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOverSubId(null)
              if (draggedSubId && draggedSubId !== sub.id) {
                await handleReorderSubcategory(draggedSubId, sub.id)
                setDraggedSubId(null)
              } else {
                const appId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
                if (appId) {
                  await handleMoveAppToSubcategory(appId, sub.id)
                  draggedAppIdRef.current = null
                  setDraggedAppId(null)
                }
              }
            }}
            onDragEnd={() => {
              setDraggedSubId(null)
              setDragOverSubId(null)
            }}
            className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
              activeSubcategoryId === sub.id
                ? 'bg-purple-500 text-white'
                : dragOverSubId === sub.id
                  ? 'bg-green-500 text-white scale-110 shadow-lg ring-2 ring-green-300'
                  : draggedSubId === sub.id
                    ? 'opacity-50 scale-95'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {sub.icon} {sub.name}
          </button>
        ))}
        <button
          onClick={() => setShowCategoryManager(true)}
          className="px-2.5 py-1 rounded-full text-xs whitespace-nowrap bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all"
        >
          + 分类
        </button>
        <button
          onClick={() => setShowSubcategoryManager(true)}
          className="px-2.5 py-1 rounded-full text-xs whitespace-nowrap bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all"
        >
          + 子分类
        </button>
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

        {!isDragging && (() => {
          const appsToShow = activeCategory && !activeSubcategoryId
            ? filteredApps
            : filteredApps

          const groups: { sub: Subcategory | null; apps: typeof filteredApps }[] = []
          if (activeCategory && !activeSubcategoryId) {
            const noSub = appsToShow.filter(a => !a.subcategoryId)
            if (noSub.length > 0) groups.push({ sub: null, apps: noSub })
            for (const s of visibleSubcategories) {
              const sApps = appsToShow.filter(a => a.subcategoryId === s.id)
              if (sApps.length > 0) groups.push({ sub: s, apps: sApps })
            }
          } else {
            groups.push({ sub: null, apps: appsToShow })
          }

          return (
            <div>
              {groups.map((group, gi) => (
                <div key={group.sub?.id || '__none__'} className={gi > 0 ? 'mt-6' : ''}>
                  {group.sub && (
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className="text-sm">{group.sub.icon}</span>
                      <span className="text-sm font-medium text-gray-600">{group.sub.name}</span>
                      <div className="flex-1 border-t border-gray-200"></div>
                    </div>
                  )}
                  <div className={`grid gap-4 ${
                    config?.ui?.gridColumns === 4 ? 'grid-cols-4' :
                    config?.ui?.gridColumns === 5 ? 'grid-cols-5' :
                    config?.ui?.gridColumns === 7 ? 'grid-cols-7' :
                    config?.ui?.gridColumns === 8 ? 'grid-cols-8' :
                    'grid-cols-6'
                  }`}>
                    {group.apps.map(app => {
                      const ui = config?.ui
                      const pSize = ui?.cardSize === 'small' ? 'p-2' : ui?.cardSize === 'large' ? 'p-5' : 'p-4'
                      const iconSize = ui?.cardSize === 'small' ? 'w-10 h-10' : ui?.cardSize === 'large' ? 'w-14 h-14' : 'w-12 h-12'
                      const iconInner = ui?.cardSize === 'small' ? 'w-8 h-8' : ui?.cardSize === 'large' ? 'w-12 h-12' : 'w-10 h-10'
                      const textSize = ui?.cardSize === 'small' ? 'text-xs' : ui?.cardSize === 'large' ? 'text-base' : 'text-sm'
                      const br = ui?.borderRadius ?? 8
                      const brClass = br <= 2 ? 'rounded-none' : br <= 4 ? 'rounded-sm' : br <= 8 ? 'rounded-lg' : br <= 14 ? 'rounded-xl' : 'rounded-2xl'
                      return (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={(e) => {
                          draggedAppIdRef.current = app.id
                          setDraggedAppId(app.id)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', app.id)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (draggedAppIdRef.current && draggedAppIdRef.current !== app.id) {
                            e.dataTransfer.dropEffect = 'move'
                            setDragOverAppId(app.id)
                          }
                        }}
                        onDragLeave={() => setDragOverAppId(null)}
                        onDrop={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDragOverAppId(null)
                          setDragOverCategory(null)
                          const sourceId = draggedAppIdRef.current || e.dataTransfer.getData('text/plain')
                          if (sourceId && sourceId !== app.id) {
                            await handleReorderApp(sourceId, app.id)
                          }
                          draggedAppIdRef.current = null
                          setDraggedAppId(null)
                        }}
                        onDragEnd={() => {
                          setTimeout(() => {
                            draggedAppIdRef.current = null
                            setDraggedAppId(null)
                            setDragOverCategory(null)
                            setDragOverAppId(null)
                          }, 100)
                        }}
                        style={{ borderRadius: br }}
                        className={`bg-white ${pSize} hover:shadow-md transition-all cursor-pointer group relative ${
                          draggedAppId === app.id ? 'opacity-50 scale-95' : ''
                        } ${dragOverAppId === app.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
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
                        {ui?.showIcon !== false && (
                          <div style={{ borderRadius: Math.min(br, 12) }} className={`${iconSize} flex items-center justify-center mb-3 mx-auto ${
                            app.type === 'folder' ? 'bg-orange-100' : 'bg-blue-100'
                          }`}>
                            {app.icon ? (
                              <img src={app.icon} alt={app.name} className={iconInner} />
                            ) : (
                              <span className={ui?.cardSize === 'small' ? 'text-xl' : ui?.cardSize === 'large' ? 'text-3xl' : 'text-2xl'}>{app.type === 'folder' ? '📁' : '📦'}</span>
                            )}
                          </div>
                        )}
                        {ui?.showName !== false && (
                          <p className={`${textSize} text-center text-gray-700 truncate`}>{app.name}</p>
                        )}
                      </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

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
          defaultCategory={activeCategory || ''}
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

      {showSubcategoryManager && (
        <SubcategoryManagerModal
          categories={categories}
          subcategories={subcategories}
          activeCategory={activeCategory}
          onClose={() => setShowSubcategoryManager(false)}
          onAdd={handleAddSubcategory}
          onDelete={handleDeleteSubcategory}
          onUpdate={handleUpdateSubcategory}
          onMove={handleMoveSubcategory}
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
  const [autoStart, setAutoStart] = useState(false)
  const [defaultEngine, setDefaultEngine] = useState(config.defaultEngine || 'b')
  const [ui, setUi] = useState<UISettings>(config.ui || {
    gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8
  })
  const [recording, setRecording] = useState<'main' | 'search' | null>(null)
  const engines = config.searchEngines

  useEffect(() => {
    window.electronAPI.getAutoStart().then(setAutoStart)
  }, [])

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        parts.push(key)
        const combo = parts.join('+')
        if (recording === 'main') setHotkey(combo)
        else setSearchHotkey(combo)
        setRecording(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording])

  const handleSave = async () => {
    await window.electronAPI.setAutoStart(autoStart)
    onSave({
      ...config,
      hotkey,
      searchHotkey,
      searchEngines: engines,
      autoStart,
      ui,
      defaultEngine
    })
    onClose()
  }

  const cardSizeLabels: Record<string, string> = { small: '小', medium: '中', large: '大' }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[480px] max-h-[85vh] overflow-auto">
        <h2 className="text-lg font-semibold mb-5">设置</h2>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>🚀</span> 常规
          </h3>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-700">开机自启动</div>
              <div className="text-xs text-gray-500">系统启动时自动运行</div>
            </div>
            <button
              onClick={() => setAutoStart(!autoStart)}
              className={`relative w-11 h-6 rounded-full transition-colors ${autoStart ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoStart ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>⌨️</span> 快捷键
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-700">显示/隐藏主窗口</div>
                <div className="text-xs text-gray-500">全局快捷键</div>
              </div>
              <button
                onClick={() => setRecording(recording === 'main' ? null : 'main')}
                className={`px-3 py-1.5 rounded text-sm font-mono min-w-[120px] text-center transition-colors ${
                  recording === 'main'
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-400'
                }`}
              >
                {recording === 'main' ? '请按下快捷键...' : hotkey}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-700">快速搜索框</div>
                <div className="text-xs text-gray-500">仅弹出搜索框</div>
              </div>
              <button
                onClick={() => setRecording(recording === 'search' ? null : 'search')}
                className={`px-3 py-1.5 rounded text-sm font-mono min-w-[120px] text-center transition-colors ${
                  recording === 'search'
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-400'
                }`}
              >
                {recording === 'search' ? '请按下快捷键...' : searchHotkey}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>🔍</span> 搜索引擎
          </h3>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">默认搜索引擎</label>
            <select
              value={defaultEngine}
              onChange={(e) => setDefaultEngine(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(engines).map(([key, engine]) => (
                <option key={key} value={key}>{engine.name} ({key} + 空格)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(engines).map(([key, engine]) => (
              <div key={key} className="flex items-center gap-1.5 p-2 bg-gray-50 rounded text-xs">
                <span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">{key}</span>
                <span className="text-gray-600 truncate">{engine.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">输入 关键词 + 空格 调用搜索引擎</p>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>🎨</span> 界面
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">每行显示数量</span>
              <div className="flex gap-1">
                {[4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setUi({ ...ui, gridColumns: n })}
                    className={`w-8 h-8 rounded text-sm ${ui.gridColumns === n ? 'bg-blue-500 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-blue-400'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">卡片大小</span>
              <div className="flex gap-1">
                {(['small', 'medium', 'large'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setUi({ ...ui, cardSize: s })}
                    className={`px-3 py-1 rounded text-sm ${ui.cardSize === s ? 'bg-blue-500 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-blue-400'}`}
                  >
                    {cardSizeLabels[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">圆角大小</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={ui.borderRadius}
                  onChange={(e) => setUi({ ...ui, borderRadius: Number(e.target.value) })}
                  className="w-32"
                />
                <span className="text-sm text-gray-500 w-8">{ui.borderRadius}px</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">显示图标</span>
              <button
                onClick={() => setUi({ ...ui, showIcon: !ui.showIcon })}
                className={`relative w-11 h-6 rounded-full transition-colors ${ui.showIcon ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ui.showIcon ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">显示名称</span>
              <button
                onClick={() => setUi({ ...ui, showName: !ui.showName })}
                className={`relative w-11 h-6 rounded-full transition-colors ${ui.showName ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ui.showName ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            取消
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
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
              <option value="">无分类</option>
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

function SubcategoryManagerModal({ categories, subcategories, activeCategory, onClose, onAdd, onDelete, onUpdate, onMove }: {
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

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '全局'
    return categories.find(c => c.id === parentId)?.name || '未知'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[520px] max-h-[80vh] overflow-auto">
        <h2 className="text-lg font-semibold mb-4">管理子分类</h2>
        
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">添加子分类</h3>
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
              placeholder="子分类名称"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <select
              value={newParentId || ''}
              onChange={(e) => setNewParentId(e.target.value || null)}
              className="px-2 py-2 border border-gray-300 rounded text-sm"
            >
              <option value="">全局</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              添加
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {subcategories.map(sub => (
            <div key={sub.id} className="flex items-center gap-2 p-2 bg-white border rounded-lg">
              {editingId === sub.id ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowEmojiPicker(showEmojiPicker === sub.id ? null : sub.id)}
                      className="w-10 h-10 border border-gray-300 rounded flex items-center justify-center text-xl hover:bg-gray-100"
                    >
                      {editIcon}
                    </button>
                    {showEmojiPicker === sub.id && (
                      <div className="absolute top-12 left-0 z-20 bg-white border rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1 w-64"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {EMOJI_LIST.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleEmojiSelect(emoji, sub.id)}
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
                  <button onClick={handleSaveEdit} className="px-2 py-1 bg-green-500 text-white rounded text-sm">保存</button>
                  <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm">取消</button>
                </>
              ) : (
                <>
                  <span className="text-xl w-10 h-10 flex items-center justify-center">{sub.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">{sub.name}</span>
                    <span className="text-xs text-gray-400">{getParentName(sub.parentId)}</span>
                  </div>
                  <select
                    value={sub.parentId || ''}
                    onChange={(e) => onMove(sub.id, e.target.value || null)}
                    className="px-2 py-1 border border-gray-300 rounded text-xs max-w-[120px]"
                  >
                    <option value="">全局</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <button
                    onClick={() => { setEditingId(sub.id); setEditName(sub.name); setEditIcon(sub.icon) }}
                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
                  >编辑</button>
                  <button
                    onClick={async () => {
                      const confirmed = await window.electronAPI.confirm(`确定要删除子分类"${sub.name}"吗？`)
                      if (confirmed) onDelete(sub.id)
                    }}
                    className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                  >删除</button>
                </>
              )}
            </div>
          ))}
        </div>

        {subcategories.length === 0 && (
          <div className="text-center text-gray-400 py-6 text-sm">暂无子分类</div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">关闭</button>
        </div>
      </div>
    </div>
  )
}

export default App
