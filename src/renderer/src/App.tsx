import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AppItem, Category, Subcategory, Config, UISettings } from '../../shared/types'
import { isFolderPath, DOC_FILE_EXTS, isImageFile } from '../../shared/utils'
import { getPinyin, getFirstLetter } from './utils/pinyin'
import type { UpdateInfo, UpdateProgress } from '../../shared/electron.d'


const EMOJI_LIST = ['🌐', '💻', '🎬', '📄', '🎮', '📦', '🎨', '📱', '🔧', '🎵', '📷', '🛒', '💼', '📚', '🗂️', '⚙️']

function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [showSubcategoryManager, setShowSubcategoryManager] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)
  const [updateFilePath, setUpdateFilePath] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [showEditApp, setShowEditApp] = useState(false)
  const [editingApp, setEditingApp] = useState<AppItem | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [dragOverAppId, setDragOverAppId] = useState<string | null>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const categoryBarRef = useRef<HTMLDivElement>(null)
  const dragCounterRef = useRef(0)
  const draggedAppIdRef = useRef<string | null>(null)
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const appsRef = useRef<AppItem[]>([])
  const categoriesRef = useRef<Category[]>([])
  const activeCategoryRef = useRef<string | null>(null)
  const isExternalDragRef = useRef(false)
  const nativeDragPathRef = useRef<string | null>(null)
  const rightDragRef = useRef<{ appId: string; active: boolean; startX: number; startY: number } | null>(null)
  const dragGhostRef = useRef<HTMLDivElement | null>(null)

  // 创建跟随鼠标的幽灵卡片（HTML5拖拽和右键拖拽共用）
  const dragGhostRafRef = useRef(0)
  const dragGhostPosRef = useRef({ x: 0, y: 0 })

  const createDragGhost = (appId: string, x: number, y: number) => {
    removeDragGhost()
    const app = appsRef.current.find(a => a.id === appId)
    if (!app) return
    const div = document.createElement('div')
    // 小型标签：圆角胶囊，跟随鼠标右下方
    div.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:10px;background:rgba(79,70,229,0.92);backdrop-filter:blur(8px);color:white;font-family:Inter,sans-serif;font-size:12px;font-weight:500;white-space:nowrap;box-shadow:0 8px 24px rgba(79,70,229,0.35),0 2px 6px rgba(0,0,0,0.1);will-change:transform;transition:transform 120ms cubic-bezier(0.34,1.56,0.64,1),opacity 150ms ease-out;opacity:0;transform:translate(' + (x + 14) + 'px,' + (y + 18) + 'px) scale(0.5);'
    // 入场：淡入 + 弹性放大
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (div.parentNode) {
          div.style.opacity = '1'
          div.style.transform = `translate(${x + 14}px, ${y + 18}px) scale(1)`
        }
      })
    })
    // 小图标
    if (app.icon && app.icon.startsWith('data:')) {
      const img = document.createElement('img')
      img.src = app.icon
      img.style.cssText = 'width:18px;height:18px;border-radius:4px;'
      div.appendChild(img)
    }
    const span = document.createElement('span')
    span.textContent = app.name
    div.appendChild(span)
    document.body.appendChild(div)
    dragGhostRef.current = div
    dragGhostPosRef.current = { x: x - 60, y: y - 20 }
  }

  const moveDragGhost = (x: number, y: number) => {
    if (!dragGhostRef.current) return
    dragGhostPosRef.current = { x: x + 14, y: y + 18 }
    if (!dragGhostRafRef.current) {
      dragGhostRafRef.current = requestAnimationFrame(() => {
        dragGhostRafRef.current = 0
        if (dragGhostRef.current) {
          dragGhostRef.current.style.transform = `translate(${dragGhostPosRef.current.x}px, ${dragGhostPosRef.current.y}px) scale(1)`
        }
      })
    }
  }

  const removeDragGhost = () => {
    if (dragGhostRafRef.current) {
      cancelAnimationFrame(dragGhostRafRef.current)
      dragGhostRafRef.current = 0
    }
    if (dragGhostRef.current) {
      dragGhostRef.current.remove()
      dragGhostRef.current = null
    }
  }

  useEffect(() => {
    loadData()
    // Load current version
    window.electronAPI.getVersion().then(setCurrentVersion).catch(() => { /* ignore */ })
    // Check for updates on startup
    window.electronAPI.checkForUpdate().then(info => {
      if (info.available) setUpdateInfo(info)
    }).catch(() => { /* ignore */ })
  }, [])

  // Update progress listener
  useEffect(() => {
    const unsub = window.electronAPI.onUpdateProgress((data) => {
      setUpdateProgress(data)
    })
    return unsub
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
    const handleGlobalDragEnd = () => {
      removeDragGhost()
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
        dragTimeoutRef.current = null
      }
      dragCounterRef.current = 0
      setIsDragging(false)
      isExternalDragRef.current = false
      setDraggedAppId(null)
      setDragOverCategory(null)
      setDragOverAppId(null)
      draggedAppIdRef.current = null
    }
    document.addEventListener('dragleave', resetExternalDrag)
    document.addEventListener('dragend', handleGlobalDragEnd)
    return () => {
      document.removeEventListener('dragleave', resetExternalDrag)
      document.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSettings && !showAddApp && !showEditApp && !showCategoryManager && !showSubcategoryManager) {
        window.electronAPI.hideMainWindow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showAddApp, showEditApp, showCategoryManager, showSubcategoryManager])

  useEffect(() => {
    // 左键拖拽图片/文档文件：第一次 mousemove 时启动 Electron 原生拖拽（用于复制/发送到外部应用）
    let moveFired = false
    const handleMouseMove = (e: MouseEvent) => {
      if (moveFired) return
      const filePath = nativeDragPathRef.current
      if (!filePath) return
      moveFired = true
      window.electronAPI.startDragFile(filePath)
    }
    const handleMouseUp = () => {
      moveFired = false
      nativeDragPathRef.current = null
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const [draggedSubId, setDraggedSubId] = useState<string | null>(null)
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null)

  useEffect(() => {
    // 右键自定义拖拽：图片/文档文件的右键拖拽排序分类（HTML5 draggable 不支持右键）
    const findDropTarget = (el: Element | null): { type: 'app' | 'category' | 'subcategory'; id: string } | null => {
      if (!el) return null
      let node: Element | null = el
      for (let i = 0; i < 5 && node; i++) {
        if (node.hasAttribute?.('data-app-id')) return { type: 'app', id: node.getAttribute('data-app-id')! }
        if (node.hasAttribute?.('data-category-id')) return { type: 'category', id: node.getAttribute('data-category-id')! }
        if (node.hasAttribute?.('data-subcategory-id')) return { type: 'subcategory', id: node.getAttribute('data-subcategory-id')! }
        node = node.parentElement
      }
      return null
    }

    const handleRightDragMove = (e: MouseEvent) => {
      if (!rightDragRef.current) return
      if (!rightDragRef.current.active) {
        const dx = e.clientX - rightDragRef.current.startX
        const dy = e.clientY - rightDragRef.current.startY
        if (Math.abs(dx) + Math.abs(dy) < 3) return
        rightDragRef.current.active = true
        setDraggedAppId(rightDragRef.current.appId)
        draggedAppIdRef.current = rightDragRef.current.appId
        document.body.style.cursor = 'grabbing'
        createDragGhost(rightDragRef.current.appId, e.clientX, e.clientY)
      }
      moveDragGhost(e.clientX, e.clientY)
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = findDropTarget(el)
      if (!target) {
        setDragOverAppId(null)
        setDragOverCategory(null)
        setDragOverSubId(null)
        return
      }
      if (target.type === 'app' && target.id !== rightDragRef.current!.appId) {
        setDragOverAppId(target.id)
        setDragOverCategory(null)
        setDragOverSubId(null)
      } else if (target.type === 'category') {
        setDragOverCategory(target.id)
        setDragOverAppId(null)
        setDragOverSubId(null)
      } else if (target.type === 'subcategory') {
        setDragOverSubId(target.id)
        setDragOverAppId(null)
        setDragOverCategory(null)
      }
    }

    const handleRightDragUp = async (e: MouseEvent) => {
      document.body.style.cursor = ''
      removeDragGhost()
      if (!rightDragRef.current) return
      const { appId, active } = rightDragRef.current
      rightDragRef.current = null
      if (!active) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = findDropTarget(el)
      if (target) {
        if (target.type === 'app' && target.id !== appId) {
          await handleReorderApp(appId, target.id)
        } else if (target.type === 'category') {
          await handleMoveAppToCategory(appId, target.id)
        } else if (target.type === 'subcategory') {
          await handleMoveAppToSubcategory(appId, target.id)
        }
      }
      setDraggedAppId(null)
      setDragOverAppId(null)
      setDragOverCategory(null)
      setDragOverSubId(null)
      draggedAppIdRef.current = null
    }

    document.addEventListener('mousemove', handleRightDragMove)
    document.addEventListener('mouseup', handleRightDragUp)
    return () => {
      document.removeEventListener('mousemove', handleRightDragMove)
      document.removeEventListener('mouseup', handleRightDragUp)
      removeDragGhost()
    }
  }, [])

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
      // Batch all extractions first, update state once
      const BATCH_SIZE = 5
      const allIcons: { id: string; icon: string }[] = []
      for (let i = 0; i < needsIconUpdate.length; i += BATCH_SIZE) {
        const batch = needsIconUpdate.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(async app => {
            const icon = await window.electronAPI.extractIcon(app.path)
            return { id: app.id, icon: icon || '' }
          })
        )
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.icon) {
            allIcons.push(r.value)
          }
        }
      }
      if (allIcons.length > 0) {
        const updated = loadedApps.map(a => {
          const found = allIcons.find(r => r.id === a.id)
          return found ? { ...a, icon: found.icon } : a
        })
        setApps(updated)
        await window.electronAPI.saveApps({ apps: updated })
      }
    }
  }

  const getFileNameFromPath = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, '/').split('/')
    const fileName = parts[parts.length - 1] || ''
    return fileName.replace(/\.exe$/i, '').replace(/\.lnk$/i, '')
  }

  const filteredApps = useMemo(() => {
    if (activeCategory) {
      return apps.filter(app => app.categoryId === activeCategory)
    }
    return apps
  }, [apps, activeCategory])

  const handleOpenApp = async (app: AppItem) => {
    if (app.id === '__folder_path__') {
      await window.electronAPI.openFolder(app.path)
      return
    }
    if (app.type === 'steam') {
      await window.electronAPI.openSteam(app.path)
    } else if (app.type === 'folder') {
      await window.electronAPI.openFolder(app.path)
    } else {
      await window.electronAPI.openApp(app.path)
    }
  }

  const isDocFile = (app: AppItem): boolean => {
    if (app.type !== 'app') return false
    const ext = app.path.toLowerCase().substring(app.path.lastIndexOf('.'))
    return DOC_FILE_EXTS.includes(ext)
  }

  const canNativeDrag = (app: AppItem): boolean => {
    return isDocFile(app) || isImageFile(app)
  }

  const handleCopyFile = async (app: AppItem) => {
    const success = await window.electronAPI.copyFileToClipboard(app.path)
    if (success) {
      alert('文件已复制到剪贴板，可以在微信等应用中粘贴发送。')
    } else {
      alert('复制文件失败，请重试。')
    }
  }

  const handleCopyImage = async (app: AppItem) => {
    const success = await window.electronAPI.copyImageToClipboard(app.path)
    if (success) {
      alert('图片已复制到剪贴板，可以在微信等应用中粘贴发送。')
    } else {
      alert('复制图片失败，请重试。')
    }
  }


  const handleAddApp = async (name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam' = 'app') => {
    if (categories.length === 0) {
      alert('请先创建一个分类，然后再添加应用。')
      return
    }

    const currentApps = appsRef.current
    const duplicate = currentApps.find(app => app.name === name)
    if (duplicate) {
      alert(`已存在同名应用"${name}"，请使用其他名称。`)
      return
    }

    const newApp: AppItem = {
      id: crypto.randomUUID(),
      name,
      path,
      icon: '',
      categoryId,
      subcategoryId: null,
      pinyin: getPinyin(name),
      firstLetter: getFirstLetter(name),
      type
    }

    const updatedApps = [...currentApps, newApp]
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setShowAddApp(false)

    // Extract icon: for Steam, try Steam cache first; for others, extract from file
    let iconPath: string | null = null
    try {
      if (type === 'steam') {
        iconPath = await window.electronAPI.extractSteamIcon(path)
      }
      if (!iconPath) {
        iconPath = await window.electronAPI.extractIcon(path)
      }
    } catch { /* icon extraction failed, app still usable */ }
    if (iconPath) {
      const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
      setApps(withIcon)
      await window.electronAPI.saveApps({ apps: withIcon })
    }
  }

  const handleUpdateApp = async (id: string, name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam') => {
    const currentApps = appsRef.current
    const existing = currentApps.find(a => a.id === id)
    if (!existing) return

    const duplicate = currentApps.find(a => a.name === name && a.id !== id)
    if (duplicate) {
      alert(`已存在同名应用"${name}"，请使用其他名称。`)
      return
    }

    const updatedApp: AppItem = {
      ...existing,
      name,
      path,
      categoryId,
      type,
      pinyin: getPinyin(name),
      firstLetter: getFirstLetter(name),
      // Clear old icon if path/type changed
      icon: (existing.path !== path || existing.type !== type) ? '' : existing.icon
    }

    const updatedApps = currentApps.map(a => a.id === id ? updatedApp : a)
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setShowEditApp(false)
    setEditingApp(null)

    // Re-extract icon if path or type changed
    if (existing.path !== path || existing.type !== type) {
      let iconPath: string | null = null
      try {
        if (type === 'steam') {
          iconPath = await window.electronAPI.extractSteamIcon(path)
        }
        if (!iconPath) {
          iconPath = await window.electronAPI.extractIcon(path)
        }
      } catch { /* icon extraction failed, app still usable */ }
      if (iconPath) {
        const withIcon = updatedApps.map(a => a.id === id ? { ...a, icon: iconPath } : a)
        setApps(withIcon)
        await window.electronAPI.saveApps({ apps: withIcon })
      }
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

    const currentApps = appsRef.current
    const duplicate = currentApps.find(app => app.name === folderName)
    if (duplicate) {
      alert(`已存在同名文件夹"${folderName}"，请使用其他名称。`)
      return
    }

    const newApp: AppItem = {
      id: crypto.randomUUID(),
      name: folderName,
      path: folderPath,
      icon: '',
      categoryId: activeCategoryRef.current || '',
      subcategoryId: null,
      pinyin: getPinyin(folderName),
      firstLetter: getFirstLetter(folderName),
      type: 'folder'
    }

    const updatedApps = [...currentApps, newApp]
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })

    let iconPath: string | null = null
    try {
      iconPath = await window.electronAPI.extractIcon(folderPath)
    } catch { /* icon extraction failed, folder still usable */ }
    if (iconPath) {
      const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
      setApps(withIcon)
      await window.electronAPI.saveApps({ apps: withIcon })
    }
  }

  const handleDeleteApp = async (id: string) => {
    const currentApps = appsRef.current
    const app = currentApps.find(a => a.id === id)
    if (app) {
      const confirmed = await window.electronAPI.confirm(`确定要删除"${app.name}"吗？`)
      if (!confirmed) return
    }
    const updatedApps = currentApps.filter(app => app.id !== id)
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

  const parseSteamUrlFromText = (text: string): { steamUrl: string; appId: string } | null => {
    const launchMatch = text.match(/steam:\/\/launch\/(\d+)/)
    if (launchMatch) {
      return { steamUrl: `steam://launch/${launchMatch[1]}/0`, appId: launchMatch[1] }
    }
    const storeMatch = text.match(/steampowered\.com\/app\/(\d+)/)
    if (storeMatch) {
      return { steamUrl: `steam://launch/${storeMatch[1]}/0`, appId: storeMatch[1] }
    }
    const runGameMatch = text.match(/steam:\/\/rungameid\/(\d+)/)
    if (runGameMatch) {
      return { steamUrl: `steam://rungameid/${runGameMatch[1]}`, appId: runGameMatch[1] }
    }
    return null
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
            id: crypto.randomUUID(),
            name,
            path: filePath,
            icon: '',
            categoryId,
            subcategoryId: null,
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
            id: crypto.randomUUID(),
            name: folderName,
            path: filePath,
            icon: '',
            categoryId,
            subcategoryId: null,
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
      let iconPath: string | null = null
      if (app.type === 'steam') {
        iconPath = await window.electronAPI.extractSteamIcon(app.path)
      }
      if (!iconPath) {
        iconPath = await window.electronAPI.extractIcon(app.path)
      }
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
      id: crypto.randomUUID(),
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
    const newSub: Subcategory = { id: crypto.randomUUID(), name, icon, parentId }
    const updated = [...subcategories, newSub]
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
  }

  const handleDeleteSubcategory = async (id: string) => {
    const updated = subcategories.filter(s => s.id !== id)
    setSubcategories(updated)
    await window.electronAPI.saveCategories({ categories, subcategories: updated })
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
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) {
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
    if (draggedAppIdRef.current) return
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
    // 更新自定义幽灵位置
    moveDragGhost(e.clientX, e.clientY)
    if (isExternalDragRef.current) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    removeDragGhost()
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

    // Check for Steam URL in dragged text (e.g. dragging from browser)
    const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list')
    const steamMatch = textData ? parseSteamUrlFromText(textData) : null

    if (steamMatch) {
      if (categoriesRef.current.length === 0) {
        alert('请先创建一个分类，然后再添加应用。')
        return
      }

      // Get real game name from Steam API
      let gameName = `Steam Game ${steamMatch.appId}`
      try {
        const realName = await window.electronAPI.getSteamGameName(steamMatch.steamUrl)
        if (realName) gameName = realName
      } catch {}

      const newApp: AppItem = {
        id: crypto.randomUUID(),
        name: gameName,
        path: steamMatch.steamUrl,
        icon: '',
        categoryId: activeCategoryRef.current || categoriesRef.current[0].id,
        subcategoryId: null,
        pinyin: getPinyin(gameName),
        firstLetter: getFirstLetter(gameName),
        type: 'steam'
      }
      const updatedApps = [...appsRef.current, newApp]
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })

      // Extract Steam icon (from local cache or Steam CDN)
      const iconPath = await window.electronAPI.extractSteamIcon(steamMatch.steamUrl)
      if (iconPath) {
        const withIcon = updatedApps.map(a => a.id === newApp.id ? { ...a, icon: iconPath } : a)
        setApps(withIcon)
        await window.electronAPI.saveApps({ apps: withIcon })
      }
      return
    }

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

  return (
    <div className="flex flex-col h-screen relative">
      {/* Aurora background orbs */}
      <div className="aurora-bg">
        <div className="aurora-orb aurora-orb--indigo" />
        <div className="aurora-orb aurora-orb--frost" />
        <div className="aurora-orb aurora-orb--violet" />
      </div>

      <header className="glass px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-md shadow-brand-500/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <h1 className="text-lg font-display font-bold text-brand-700 tracking-tight">Tidy Desktop</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddApp(true)}
            className="px-3.5 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition-colors duration-200 shadow-sm shadow-brand-500/20 hover:shadow-md hover:shadow-brand-500/30"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              添加应用
            </span>
          </button>
          <button
            onClick={handleAddFolder}
            className="px-3.5 py-1.5 bg-frost-400 text-brand-800 rounded-lg hover:bg-frost-500 text-sm font-medium transition-colors duration-200 shadow-sm shadow-frost-400/20"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              添加文件夹
            </span>
          </button>
          <button
            onClick={() => setShowCategoryManager(true)}
            className="px-3.5 py-1.5 bg-white/60 text-brand-600 rounded-lg hover:bg-white/80 text-sm font-medium transition-colors duration-200 border border-brand-200/50"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              管理分类
            </span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="px-3.5 py-1.5 bg-white/60 text-slate-600 rounded-lg hover:bg-white/80 text-sm font-medium transition-colors duration-200 border border-slate-200/50"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              设置
            </span>
          </button>
          {updateInfo?.available && (
            <button
              disabled={updateDownloading}
              onClick={async () => {
                if (updateFilePath) {
                  // Already downloaded — install
                  const ok = await window.electronAPI.installUpdate(updateFilePath)
                  if (!ok) {
                    setUpdateFilePath(null)
                    setUpdateDownloading(false)
                  }
                  return
                }
                setUpdateDownloading(true)
                setUpdateProgress(null)
                try {
                  const result = await window.electronAPI.downloadUpdate(updateInfo?.downloadUrl)
                  if (result.success && result.filePath) {
                    setUpdateFilePath(result.filePath)
                    const ok = await window.electronAPI.installUpdate(result.filePath)
                    if (!ok) {
                      setUpdateFilePath(null)
                    }
                  }
                } catch {
                  // download promise rejected unexpectedly
                } finally {
                  setUpdateDownloading(false)
                  setUpdateProgress(null)
                }
              }}
              className="px-3.5 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-sm font-medium transition-colors duration-200 shadow-sm shadow-brand-500/20 hover:shadow-md hover:shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-1.5">
                {updateDownloading && !updateFilePath ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset={50 - (updateProgress?.percent || 0) / 2} /></svg>
                    {updateProgress ? `${updateProgress.percent}%` : '下载中...'}
                  </>
                ) : updateFilePath ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    安装 v{updateInfo.version}
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    更新 v{updateInfo.version}
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      </header>

      <div ref={categoryBarRef} className="px-5 pt-3 pb-2 flex gap-2 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat.id}
            data-category-id={cat.id}
            onClick={() => { setActiveCategory(cat.id) }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              moveDragGhost(e.clientX, e.clientY)
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

              // 优先处理内部拖拽（包括原生拖拽放回应用内的情况）
              if (draggedAppIdRef.current) {
                await handleMoveAppToCategory(draggedAppIdRef.current, cat.id)
                draggedAppIdRef.current = null
                setDraggedAppId(null)
                return
              }

              const files = Array.from(e.dataTransfer.files)
              if (files.length > 0) {
                const newApps = parseFilesToApps(files, cat.id)
                if (newApps.length > 0) {
                  const updatedApps = [...appsRef.current, ...newApps]
                  setApps(updatedApps)
                  await window.electronAPI.saveApps({ apps: updatedApps })
                  await extractIconsForApps(newApps)
                }
              } else {
                const appId = e.dataTransfer.getData('text/plain')
                if (appId) {
                  await handleMoveAppToCategory(appId, cat.id)
                }
              }
            }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
              activeCategory === cat.id
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
                : dragOverCategory === cat.id
                  ? 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-400/30 ring-2 ring-emerald-300'
                  : 'bg-white/60 text-slate-600 hover:bg-white/80 hover:text-brand-600 border border-brand-100/50'
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
        {visibleSubcategories.map(sub => (
          <button
            key={sub.id}
            data-subcategory-id={sub.id}
            draggable
            onClick={() => {
              const el = document.getElementById(`subcat-${sub.id}`)
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            onDragStart={(e) => {
              setDraggedSubId(sub.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', sub.id)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              moveDragGhost(e.clientX, e.clientY)
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
              removeDragGhost()
              setDraggedSubId(null)
              setDragOverSubId(null)
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
              dragOverSubId === sub.id
                ? 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-400/30 ring-2 ring-emerald-300'
                : draggedSubId === sub.id
                  ? 'opacity-40 scale-95'
                  : 'bg-white/50 text-slate-500 hover:bg-white/70 hover:text-brand-600 border border-brand-100/40'
            }`}
          >
            {sub.icon} {sub.name}
          </button>
        ))}
        <button
          onClick={() => setShowCategoryManager(true)}
          className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/40 text-slate-400 hover:bg-white/60 hover:text-brand-600 transition-colors duration-200 border border-dashed border-brand-200/60"
        >
          + 分类
        </button>
        <button
          onClick={() => setShowSubcategoryManager(true)}
          className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/40 text-slate-400 hover:bg-white/60 hover:text-brand-600 transition-colors duration-200 border border-dashed border-brand-200/60"
        >
          + 子分类
        </button>
      </div>

      <main
        ref={dropZoneRef}
        className="flex-1 overflow-y-scroll px-5 py-4"
        style={{ scrollbarGutter: 'stable', willChange: 'scroll-position', backdropFilter: 'blur(40px) saturate(1.2)', WebkitBackdropFilter: 'blur(40px) saturate(1.2)' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
      >
        <div key={activeCategory} className="tab-fade-enter" style={{ contain: 'content' }}>
        {(() => {
          const groups: { sub: Subcategory | null; apps: typeof filteredApps }[] = []
          const noSub = filteredApps.filter(a => !a.subcategoryId)
          if (noSub.length > 0) groups.push({ sub: null, apps: noSub })
          for (const s of visibleSubcategories) {
            const sApps = filteredApps.filter(a => a.subcategoryId === s.id)
            if (sApps.length > 0) groups.push({ sub: s, apps: sApps })
          }

          return (
            <div>
              {groups.map((group, gi) => (
                <div key={group.sub?.id || '__none__'} id={group.sub ? `subcat-${group.sub.id}` : undefined} className={gi > 0 ? 'mt-6' : ''}>
                  {group.sub && (
                    <div className="flex items-center gap-2.5 mb-3 px-1">
                      <span className="text-sm">{group.sub.icon}</span>
                      <span className="text-sm font-semibold font-display text-brand-700">{group.sub.name}</span>
                      <div className="flex-1 h-px bg-gradient-to-r from-brand-200/60 to-transparent"></div>
                    </div>
                  )}
                  <div className={`grid gap-3 stagger-enter ${
                    config?.ui?.gridColumns === 4 ? 'grid-cols-4' :
                    config?.ui?.gridColumns === 5 ? 'grid-cols-5' :
                    config?.ui?.gridColumns === 7 ? 'grid-cols-7' :
                    config?.ui?.gridColumns === 8 ? 'grid-cols-8' :
                    'grid-cols-6'
                  }`} style={{ gridAutoRows: 'min-content', contain: 'layout style' }}>
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
                        data-app-id={app.id}
                        draggable
                        onMouseDown={(e) => {
                          // 右键图片/文档：准备原生拖拽（复制发送到外部应用）
                          if (e.button === 2 && canNativeDrag(app)) {
                            e.preventDefault()
                            nativeDragPathRef.current = app.path
                          }
                        }}
                        onContextMenu={(e) => {
                          // 图片/文档文件：阻止右键菜单（右键用于原生拖拽复制发送）
                          if (canNativeDrag(app)) e.preventDefault()
                        }}
                        onDragStart={(e) => {
                          // 清理上一次拖拽可能残留的状态
                          if (draggedAppIdRef.current) {
                            draggedAppIdRef.current = null
                          }
                          draggedAppIdRef.current = app.id
                          setDraggedAppId(app.id)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', app.id)
                          // 隐藏默认拖拽幽灵，使用自定义幽灵
                          const emptyImg = new Image()
                          emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
                          e.dataTransfer.setDragImage(emptyImg, 0, 0)
                          createDragGhost(app.id, e.clientX, e.clientY)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          moveDragGhost(e.clientX, e.clientY)
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
                          removeDragGhost()
                          if (dragTimeoutRef.current) {
                            clearTimeout(dragTimeoutRef.current)
                          }
                          dragTimeoutRef.current = setTimeout(() => {
                            draggedAppIdRef.current = null
                            setDraggedAppId(null)
                            setDragOverCategory(null)
                            setDragOverAppId(null)
                            dragTimeoutRef.current = null
                          }, 100)
                        }}
                        style={{ borderRadius: br }}
                        className={`glass-card ${pSize} card-hover cursor-pointer group relative select-none ${
                          draggedAppId === app.id ? 'opacity-30 scale-95 blur-[2px]' : ''
                        } ${dragOverAppId === app.id ? 'scale-[1.03] ring-2 ring-brand-500 ring-offset-2 shadow-xl shadow-brand-500/20 bg-brand-50/50' : ''}`}
                        onClick={() => handleOpenApp(app)}
                      >
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingApp(app)
                              setShowEditApp(true)
                            }}
                            className="text-slate-400 hover:text-brand-500 p-0.5 transition-colors"
                            title="编辑"
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteApp(app.id)
                            }}
                            className="text-slate-400 hover:text-red-500 p-0.5 transition-colors"
                            title="删除"
                          >
                            ×
                          </button>
                          {isDocFile(app) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyFile(app)
                              }}
                              className="text-slate-400 hover:text-emerald-500 p-0.5 transition-colors"
                              title="发送文件（复制到剪贴板）"
                            >
                              📤
                            </button>
                          )}
                          {isImageFile(app) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyImage(app)
                              }}
                              className="text-slate-400 hover:text-emerald-500 p-0.5 transition-colors"
                              title="复制图片（可粘贴到微信等应用）"
                            >
                              📤
                            </button>
                          )}
                        </div>
                        {ui?.showIcon !== false && (
                          <div style={{ borderRadius: Math.min(br, 12) }} className={`${iconSize} flex items-center justify-center mb-3 mx-auto ${
                            app.type === 'folder' ? 'bg-gradient-to-br from-orange-50 to-orange-100' : app.type === 'steam' ? 'bg-gradient-to-br from-aurora-50 to-aurora-100' : 'bg-gradient-to-br from-brand-50 to-brand-100'
                          }`}>
                            {app.icon ? (
                              <img src={app.icon} alt={app.name} className={iconInner} draggable={false} />
                            ) : (
<span className={ui?.cardSize === 'small' ? 'text-xl' : ui?.cardSize === 'large' ? 'text-3xl' : 'text-2xl'}>{app.type === 'folder' ? '📁' : app.type === 'steam' ? '🎮' : '📦'}</span>
                            )}
                          </div>
                        )}
                        {ui?.showName !== false && (
                          <p className={`${textSize} text-center text-slate-700 font-medium truncate`}>{app.name}</p>
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

        {filteredApps.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
            </div>
            <p className="text-slate-400 text-sm">暂无应用</p>
            <p className="text-slate-300 text-xs mt-1">点击「添加应用」或「添加文件夹」开始使用</p>
          </div>
        )}
        </div>
      </main>

      <footer className="glass px-6 py-2 text-xs text-slate-400 flex justify-between border-t border-brand-100/30">
        <span>Esc 关闭窗口</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-white/60 text-slate-500 font-mono text-[10px] border border-brand-100/40">{config?.hotkey || 'Alt+Space'}</kbd>
            显示/隐藏
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-white/60 text-slate-500 font-mono text-[10px] border border-brand-100/40">{config?.searchHotkey || 'Ctrl+K'}</kbd>
            搜索
          </span>
        </span>
      </footer>

      {showSettings && config && (
        <SettingsModal
          config={config}
          currentVersion={currentVersion}
          onClose={() => setShowSettings(false)}
          onSave={handleUpdateConfig}
          updateInfo={updateInfo}
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

      {showEditApp && editingApp && (
        <EditAppModal
          app={editingApp}
          categories={categories}
          onClose={() => { setShowEditApp(false); setEditingApp(null) }}
          onUpdate={handleUpdateApp}
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

const SettingsModal = React.memo(function SettingsModal({ config, currentVersion, onClose, onSave, updateInfo }: {
  config: Config
  currentVersion: string
  onClose: () => void
  onSave: (config: Config) => void
  updateInfo?: UpdateInfo | null
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
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass rounded-2xl p-6 w-[480px] max-h-[85vh] overflow-auto shadow-xl shadow-brand-500/5 modal-enter">
        <h2 className="text-lg font-display font-bold text-slate-800 mb-5">设置</h2>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>🚀</span> 常规
          </h3>
          <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
            <div>
              <div className="text-sm font-medium text-slate-700">开机自启动</div>
              <div className="text-xs text-slate-500">系统启动时自动运行</div>
            </div>
            <button
              onClick={() => setAutoStart(!autoStart)}
              className={`relative w-11 h-6 rounded-full transition-colors ${autoStart ? 'bg-brand-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoStart ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>⌨️</span> 快捷键
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <div>
                <div className="text-sm font-medium text-slate-700">显示/隐藏主窗口</div>
                <div className="text-xs text-slate-500">全局快捷键</div>
              </div>
              <button
                onClick={() => setRecording(recording === 'main' ? null : 'main')}
                className={`px-3 py-1.5 rounded-lg text-sm font-mono min-w-[120px] text-center transition-colors ${
                  recording === 'main'
                    ? 'bg-brand-500 text-white animate-pulse'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-400'
                }`}
              >
                {recording === 'main' ? '请按下快捷键...' : hotkey}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <div>
                <div className="text-sm font-medium text-slate-700">快速搜索框</div>
                <div className="text-xs text-slate-500">仅弹出搜索框</div>
              </div>
              <button
                onClick={() => setRecording(recording === 'search' ? null : 'search')}
                className={`px-3 py-1.5 rounded-lg text-sm font-mono min-w-[120px] text-center transition-colors ${
                  recording === 'search'
                    ? 'bg-brand-500 text-white animate-pulse'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-400'
                }`}
              >
                {recording === 'search' ? '请按下快捷键...' : searchHotkey}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>🔍</span> 搜索引擎
          </h3>
          <div className="mb-3">
            <label className="text-xs text-slate-500 mb-1 block">默认搜索引擎</label>
            <select
              value={defaultEngine}
              onChange={(e) => setDefaultEngine(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            >
              {Object.entries(engines).map(([key, engine]) => (
                <option key={key} value={key}>{engine.name} ({key} + 空格)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(engines).map(([key, engine]) => (
              <div key={key} className="flex items-center gap-1.5 p-2 bg-brand-50/50 rounded-lg text-xs">
                <span className="font-mono bg-brand-100 px-1.5 py-0.5 rounded">{key}</span>
                <span className="text-slate-600 truncate">{engine.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">输入 关键词 + 空格 调用搜索引擎</p>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>🎨</span> 界面
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">每行显示数量</span>
              <div className="flex gap-1">
                {[4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setUi({ ...ui, gridColumns: n })}
                    className={`w-8 h-8 rounded-lg text-sm ${ui.gridColumns === n ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">卡片大小</span>
              <div className="flex gap-1">
                {(['small', 'medium', 'large'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setUi({ ...ui, cardSize: s })}
                    className={`px-3 py-1 rounded-lg text-sm ${ui.cardSize === s ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'}`}
                  >
                    {cardSizeLabels[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">圆角大小</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={ui.borderRadius}
                  onChange={(e) => setUi({ ...ui, borderRadius: Number(e.target.value) })}
                  className="w-32"
                />
                <span className="text-sm text-slate-500 w-8">{ui.borderRadius}px</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">显示图标</span>
              <button
                onClick={() => setUi({ ...ui, showIcon: !ui.showIcon })}
                className={`relative w-11 h-6 rounded-full transition-colors ${ui.showIcon ? 'bg-brand-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ui.showIcon ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">显示名称</span>
              <button
                onClick={() => setUi({ ...ui, showName: !ui.showName })}
                className={`relative w-11 h-6 rounded-full transition-colors ${ui.showName ? 'bg-brand-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ui.showName ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>ℹ️</span> 关于
          </h3>
          <div className="p-3 bg-brand-50/50 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">当前版本</span>
              <span className="text-sm font-mono text-slate-500">{currentVersion ? `v${currentVersion}` : '...'}</span>
            </div>
            {updateInfo?.available && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-100/50">
                <span className="text-sm text-brand-600 font-medium">新版本可用</span>
                <span className="text-sm font-mono text-brand-600">v{updateInfo.version}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-brand-100/50">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
            取消
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20">
            保存
          </button>
        </div>
      </div>
    </div>
  )
})

const AddAppModal = React.memo(function AddAppModal({ categories, onClose, onAdd, defaultCategory }: {
  categories: Category[]
  onClose: () => void
  onAdd: (name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam') => void
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

  useEffect(() => {
    const valid = getInitialCategory()
    if (valid !== categoryId) {
      setCategoryId(valid)
    }
  }, [categories, defaultCategory])

  const parseSteamUrl = (url: string): { name: string; steamUrl: string } | null => {
    // Support steam://launch/XXXXX or store.steampowered.com/app/XXXXX
    const launchMatch = url.match(/steam:\/\/launch\/(\d+)/)
    if (launchMatch) {
      return { name: '', steamUrl: `steam://launch/${launchMatch[1]}/0` }
    }
    const storeMatch = url.match(/steampowered\.com\/app\/(\d+)/)
    if (storeMatch) {
      return { name: '', steamUrl: `steam://launch/${storeMatch[1]}/0` }
    }
    // steam://rungameid/XXXXX
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
        // Try to extract a readable name from the URL
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
        onAdd(name.trim() || 'Steam Game', parsed.steamUrl, categoryId, 'steam')
        return
      }
    }
    if (name.trim() && path.trim()) {
      onAdd(name.trim(), path.trim(), categoryId, type)
    }
  }

  const typeLabels: Record<string, string> = {
    app: '应用程序',
    folder: '文件夹',
    steam: 'Steam 链接'
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              类型
            </label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center text-sm text-slate-600">
                <input
                  type="radio"
                  value="app"
                  checked={type === 'app'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                  className="mr-2 accent-brand-500"
                />
                应用程序
              </label>
              <label className="flex items-center text-sm text-slate-600">
                <input
                  type="radio"
                  value="folder"
                  checked={type === 'folder'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                  className="mr-2 accent-brand-500"
                />
                文件夹
              </label>
              <label className="flex items-center text-sm text-slate-600">
                <input
                  type="radio"
                  value="steam"
                  checked={type === 'steam'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                  className="mr-2 accent-brand-500"
                />
                Steam 链接
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              名称
            </label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {type === 'steam' ? 'Steam 链接' : '路径'}
            </label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              分类
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
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
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20"
            >
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})

const EditAppModal = React.memo(function EditAppModal({ app, categories, onClose, onUpdate }: {
  app: AppItem
  categories: Category[]
  onClose: () => void
  onUpdate: (id: string, name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam') => void
}) {
  const [name, setName] = useState(app.name)
  const [path, setPath] = useState(app.path)
  const [categoryId, setCategoryId] = useState(app.categoryId || (categories.length > 0 ? categories[0].id : ''))
  const [type, setType] = useState<'app' | 'folder' | 'steam'>(app.type || 'app')

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (type === 'steam') {
      const parsed = parseSteamUrl(path.trim())
      if (parsed) {
        onUpdate(app.id, name.trim() || 'Steam Game', parsed.steamUrl, categoryId, 'steam')
        return
      }
    }
    if (name.trim() && path.trim()) {
      onUpdate(app.id, name.trim(), path.trim(), categoryId, type)
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              类型
            </label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center text-sm text-slate-600">
                <input
                  type="radio"
                  value="app"
                  checked={type === 'app'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                  className="mr-2 accent-brand-500"
                />
                应用程序
              </label>
              <label className="flex items-center text-sm text-slate-600">
                <input
                  type="radio"
                  value="folder"
                  checked={type === 'folder'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                  className="mr-2 accent-brand-500"
                />
                文件夹
              </label>
              <label className="flex items-center text-sm text-slate-600">
                <input
                  type="radio"
                  value="steam"
                  checked={type === 'steam'}
                  onChange={(e) => setType(e.target.value as 'app' | 'folder' | 'steam')}
                  className="mr-2 accent-brand-500"
                />
                Steam 链接
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              名称
            </label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {type === 'steam' ? 'Steam 链接' : '路径'}
            </label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              分类
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
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
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/20"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})

const CategoryManagerModal = React.memo(function CategoryManagerModal({ categories, onClose, onAdd, onDelete, onUpdate }: {
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
                <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64"
                  onClick={(e) => e.stopPropagation()}
                >
                  {EMOJI_LIST.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleEmojiSelect(emoji, 'new')}
                      className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg"
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
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
              placeholder="分类名称"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/20"
            >
              添加
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 p-2 bg-white/60 border border-brand-100/40 rounded-xl">
              {editingId === cat.id ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowEmojiPicker(showEmojiPicker === cat.id ? null : cat.id)}
                      className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50"
                    >
                      {editIcon}
                    </button>
                    {showEmojiPicker === cat.id && (
                      <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {EMOJI_LIST.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleEmojiSelect(emoji, cat.id)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg"
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
                    className="flex-1 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm transition-colors"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xl w-10 h-10 flex items-center justify-center">{cat.icon}</span>
                  <span className="flex-1 text-sm font-medium text-slate-700">{cat.name}</span>
                  <span className="text-xs text-slate-400">ID: {cat.id.slice(0, 8)}...</span>
                  <button
                    onClick={() => handleStartEdit(cat)}
                    className="px-2 py-1 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 text-sm transition-colors"
                  >
                    编辑
                  </button>
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

        {categories.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            暂无分类，请添加新分类
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
})

const SubcategoryManagerModal = React.memo(function SubcategoryManagerModal({ categories, subcategories, activeCategory, onClose, onAdd, onDelete, onUpdate, onMove }: {
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
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowEmojiPicker(showEmojiPicker === 'new' ? null : 'new')}
                className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50"
              >
                {newIcon}
              </button>
              {showEmojiPicker === 'new' && (
                <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64"
                  onClick={(e) => e.stopPropagation()}
                >
                  {EMOJI_LIST.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleEmojiSelect(emoji, 'new')}
                      className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg"
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
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
              placeholder="子分类名称"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <select
              value={newParentId || ''}
              onChange={(e) => setNewParentId(e.target.value || null)}
              className="px-2 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">全局</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-aurora-500 text-white rounded-lg hover:bg-aurora-600 transition-colors shadow-sm shadow-aurora-500/20"
            >
              添加
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {subcategories.map(sub => (
            <div key={sub.id} className="flex items-center gap-2 p-2 bg-white/60 border border-brand-100/40 rounded-xl">
              {editingId === sub.id ? (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowEmojiPicker(showEmojiPicker === sub.id ? null : sub.id)}
                      className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center text-xl hover:bg-brand-50"
                    >
                      {editIcon}
                    </button>
                    {showEmojiPicker === sub.id && (
                      <div className="absolute top-12 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-8 gap-1 w-64"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {EMOJI_LIST.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleEmojiSelect(emoji, sub.id)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg"
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
                    className="flex-1 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                    autoFocus
                  />
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
                  <select
                    value={sub.parentId || ''}
                    onChange={(e) => onMove(sub.id, e.target.value || null)}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs max-w-[120px]"
                  >
                    <option value="">全局</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <button
                    onClick={() => { setEditingId(sub.id); setEditName(sub.name); setEditIcon(sub.icon) }}
                    className="px-2 py-1 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 text-sm transition-colors"
                  >编辑</button>
                  <button
                    onClick={async () => {
                      const confirmed = await window.electronAPI.confirm(`确定要删除子分类"${sub.name}"吗？`)
                      if (confirmed) onDelete(sub.id)
                    }}
                    className="px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm transition-colors"
                  >删除</button>
                </>
              )}
            </div>
          ))}
        </div>

        {subcategories.length === 0 && (
          <div className="text-center text-slate-400 py-6 text-sm">暂无子分类</div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">关闭</button>
        </div>
      </div>
    </div>
  )
})

export default App
