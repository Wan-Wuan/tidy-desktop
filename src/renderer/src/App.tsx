import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AppItem, Category, Subcategory, Config, ShortcutImportItem, UiCommand } from '../../shared/types'
import { isFolderPath, DOC_FILE_EXTS, isImageFile } from '../../shared/utils'
import { getPinyin, getFirstLetter } from './utils/pinyin'
import { hasDisplayableIcon, needsIconUpdate } from './utils/iconUtils'
import { deduplicateAppsByPath, filterStillEmptyCategories, findEmptyCategories } from './utils/maintenance'
import { useUpdate } from './hooks/useUpdate'
import { UpdateButton, UpdateDialog } from './components/UpdateButton'
import {
  CategoryContextMenuOverlay,
  CategoryEditDialogOverlay,
  UndoToast
} from './components/CategoryOverlays'
import type { CategoryContextMenu, CategoryContextMenuTarget, CategoryEditDialog } from './components/CategoryOverlays'
import {
  AddAppModal,
  EditAppModal,
  OnboardingModal,
  SettingsModal,
  SmartOrganizeModal,
} from './components/modals'
import type { HealthReport, IconRefreshProgress } from './components/modals'


type DroppedFile = File & { path?: string }
type MaintenanceSummary = { title: string; items: string[] }
type UndoSnapshot = {
  label: string
  apps: AppItem[]
  categories: Category[]
  subcategories: Subcategory[]
  activeCategory: string | null
}

function appNeedsIconUpdate(app: AppItem): boolean {
  return app.type !== 'folder' && needsIconUpdate(app.icon)
}

function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const {
    state: updateState,
    version: updateVersion,
    progress: updateProgress,
    releaseNotes: updateReleaseNotes,
    error: updateError,
    currentVersion,
    checkForUpdate: manualCheckForUpdate,
    startDownload,
    confirmInstall,
    dismissUpdate
  } = useUpdate()
  const [showSettings, setShowSettings] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [showEditApp, setShowEditApp] = useState(false)
  const [editingApp, setEditingApp] = useState<AppItem | null>(null)
  const [showSmartOrganize, setShowSmartOrganize] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [dragOverAppId, setDragOverAppId] = useState<string | null>(null)
  const [iconRefreshProgress, setIconRefreshProgress] = useState<IconRefreshProgress | null>(null)
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const [maintenanceSummary, setMaintenanceSummary] = useState<MaintenanceSummary | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const categoryBarRef = useRef<HTMLDivElement>(null)
  const subcategoryBarRef = useRef<HTMLDivElement>(null)
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
  const iconBackfillTimerRef = useRef<number | null>(null)
  const maintenanceSummaryTimerRef = useRef<number | null>(null)
  const shortcutImportInFlightRef = useRef(false)

  const showMaintenanceSummary = useCallback((summary: MaintenanceSummary, autoDismiss = true) => {
    if (maintenanceSummaryTimerRef.current) {
      window.clearTimeout(maintenanceSummaryTimerRef.current)
      maintenanceSummaryTimerRef.current = null
    }
    setMaintenanceSummary(summary)
    if (autoDismiss) {
      maintenanceSummaryTimerRef.current = window.setTimeout(() => {
        maintenanceSummaryTimerRef.current = null
        setMaintenanceSummary(null)
      }, 10_000)
    }
  }, [])

  const clearMaintenanceSummary = useCallback(() => {
    if (maintenanceSummaryTimerRef.current) {
      window.clearTimeout(maintenanceSummaryTimerRef.current)
      maintenanceSummaryTimerRef.current = null
    }
    setMaintenanceSummary(null)
  }, [])

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
    if (hasDisplayableIcon(app.icon)) {
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
  }, [])

  useEffect(() => {
    if (!currentVersion) return
    const key = 'tidy-desktop:last-version'
    const lastVersion = localStorage.getItem(key)
    if (lastVersion && lastVersion !== currentVersion) {
      setTimeout(() => alert(`已更新到 v${currentVersion}`), 400)
    }
    localStorage.setItem(key, currentVersion)
  }, [currentVersion])

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
      if (iconBackfillTimerRef.current) {
        window.clearTimeout(iconBackfillTimerRef.current)
        iconBackfillTimerRef.current = null
      }
      if (maintenanceSummaryTimerRef.current) {
        window.clearTimeout(maintenanceSummaryTimerRef.current)
        maintenanceSummaryTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSettings && !showAddApp && !showEditApp && !showSmartOrganize) {
        window.electronAPI.hideMainWindow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showAddApp, showEditApp, showSmartOrganize])

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
  const [categoryContextMenu, setCategoryContextMenu] = useState<CategoryContextMenu | null>(null)
  const [categoryEditDialog, setCategoryEditDialog] = useState<CategoryEditDialog | null>(null)

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

  useEffect(() => {
    if (!categoryContextMenu) return
    const closeMenu = () => setCategoryContextMenu(null)
    const closeOnKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('contextmenu', closeMenu)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('blur', closeMenu)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('contextmenu', closeMenu)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('blur', closeMenu)
    }
  }, [categoryContextMenu])

  const backfillMissingIcons = async (sourceApps: AppItem[]) => {
    const BATCH_SIZE = 3
    const allIcons: { id: string; icon: string }[] = []
    for (let i = 0; i < sourceApps.length; i += BATCH_SIZE) {
      const batch = sourceApps.slice(i, i + BATCH_SIZE)
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
      await new Promise(resolve => window.setTimeout(resolve, 80))
    }
    if (allIcons.length === 0) return

    setApps(prev => {
      let changed = false
      const updated = prev.map(app => {
        if (!appNeedsIconUpdate(app)) return app
        const found = allIcons.find(result => result.id === app.id)
        if (!found) return app
        changed = true
        return { ...app, icon: found.icon }
      })
      if (changed) {
        window.electronAPI.saveApps({ apps: updated })
      }
      return changed ? updated : prev
    })
  }

  const scheduleIconBackfill = (sourceApps: AppItem[]) => {
    if (iconBackfillTimerRef.current) {
      window.clearTimeout(iconBackfillTimerRef.current)
    }
    iconBackfillTimerRef.current = window.setTimeout(() => {
      iconBackfillTimerRef.current = null
      backfillMissingIcons(sourceApps)
    }, 3500)
  }

  const loadData = async () => {
    const [configData, appsData, categoriesData] = await Promise.all([
      window.electronAPI.getConfig(),
      window.electronAPI.getApps(),
      window.electronAPI.getCategories()
    ])
    setConfig(configData)
    if (!configData.onboardingCompleted) {
      setShowOnboarding(true)
    }

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

    const appsNeedingIconUpdate = loadedApps.filter(appNeedsIconUpdate)
    if (appsNeedingIconUpdate.length > 0) {
      scheduleIconBackfill(appsNeedingIconUpdate)
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

  const activeCategoryLabel = useMemo(() => {
    if (!activeCategory) return '全部项目'
    return categories.find(category => category.id === activeCategory)?.name || '当前分类'
  }, [activeCategory, categories])

  const overviewStats = useMemo(() => ({
    total: filteredApps.length,
    folders: filteredApps.filter(app => app.type === 'folder').length,
    missingIcons: filteredApps.filter(appNeedsIconUpdate).length,
    hidden: filteredApps.filter(app => app.hidden).length,
    visible: filteredApps.filter(app => !app.hidden).length
  }), [filteredApps])

  const overviewHealth = useMemo(() => {
    if (overviewStats.missingIcons > 0 || overviewStats.hidden > 0) return '需要维护'
    if (overviewStats.total === 0) return '等待导入'
    return '状态良好'
  }, [overviewStats.hidden, overviewStats.missingIcons, overviewStats.total])

  const smartLaunchApps = useMemo(() => {
    const now = Date.now()
    return filteredApps
      .filter(app => !app.hidden)
      .map(app => {
        const launchScore = (app.launchCount || 0) * 12
        const recentScore = app.lastOpenedAt ? Math.max(0, 30 - Math.floor((now - app.lastOpenedAt) / 86400000)) : 0
        return { app, score: launchScore + recentScore }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(item => item.app)
  }, [filteredApps])

  const recordAppLaunch = async (appId: string) => {
    const updatedApps = appsRef.current.map(item => item.id === appId
      ? { ...item, launchCount: (item.launchCount || 0) + 1, lastOpenedAt: Date.now() }
      : item
    )
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

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
    await recordAppLaunch(app.id)
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


  const handleAddApp = async (name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam' = 'app', aliases: string[] = []) => {
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
      type,
      aliases
    }

    const updatedApps = [...currentApps, newApp]
    appsRef.current = updatedApps
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

  const handleUpdateApp = async (id: string, name: string, path: string, categoryId: string, type: 'app' | 'folder' | 'steam', aliases: string[] = []) => {
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
      aliases,
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

  const parseFilesToApps = async (files: File[], categoryId: string): Promise<AppItem[]> => {
    const currentApps = appsRef.current
    const newApps: AppItem[] = []

    const execExts = ['.exe', '.lnk', '.msi', '.bat', '.cmd', '.vbs', '.ps1']
    const docExts = ['.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.txt', '.rtf', '.csv']
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']
    const mediaExts = ['.mp3', '.mp4', '.wav', '.avi', '.mkv', '.flv', '.wmv', '.mov', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg']
    const allFileExts = [...execExts, ...docExts, ...archiveExts, ...mediaExts]

    const filePaths = files
      .map(file => (file as DroppedFile).path)
      .filter((filePath): filePath is string => !!filePath)
    const pathInfoByPath = new Map(
      (await window.electronAPI.classifyPaths(filePaths)).map(info => [info.path, info])
    )

    for (const file of files) {
      const filePath = (file as DroppedFile).path
      if (!filePath) continue

      const info = pathInfoByPath.get(filePath)
      const ext = info?.extension || filePath.toLowerCase().substring(filePath.lastIndexOf('.'))
      const isKnownFile = allFileExts.includes(ext)
      const isDirectory = !!info?.isDirectory

      if (info?.isFile && isKnownFile) {
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
      appsWithIcons.push(iconPath ? { ...app, icon: iconPath } : app)
    }

    if (appsWithIcons.length > 0) {
      const currentApps = appsRef.current
      const updatedApps = currentApps.map(a => {
        const found = appsWithIcons.find(n => n.id === a.id)
        return found || a
      })
      appsRef.current = updatedApps
      setApps(updatedApps)
      await window.electronAPI.saveApps({ apps: updatedApps })
    }
  }

  const handleUpdateConfig = async (newConfig: Config) => {
    const success = await window.electronAPI.saveConfig(newConfig)
    if (!success) {
      alert('配置保存失败。若刚修改了快捷键，它可能已被其他程序占用；原配置已恢复。')
      return false
    }
    setConfig(newConfig)
    return true
  }

  const handleAddCategory = async (name: string, icon: string) => {
    const newCategory: Category = {
      id: crypto.randomUUID(),
      name,
      icon,
      order: categories.length + 1
    }
    const updatedCategories = [...categories, newCategory]
    categoriesRef.current = updatedCategories
    setCategories(updatedCategories)
    setActiveCategory(newCategory.id)
    activeCategoryRef.current = newCategory.id
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories })
  }

  const handleDeleteCategory = async (id: string) => {
    const updatedCategories = categories.filter(cat => cat.id !== id)
    const updatedSubcategories = subcategories.filter(sub => sub.parentId !== id)
    categoriesRef.current = updatedCategories
    setCategories(updatedCategories)
    setSubcategories(updatedSubcategories)
    await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories: updatedSubcategories })
    
    if (activeCategory === id) {
      setActiveCategory(null)
      activeCategoryRef.current = null
    }

    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app =>
      app.categoryId === id ? { ...app, categoryId: null, subcategoryId: null } : app
    )
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleUpdateCategory = async (id: string, name: string, icon: string) => {
    const updatedCategories = categories.map(cat => 
      cat.id === id ? { ...cat, name, icon } : cat
    )
    categoriesRef.current = updatedCategories
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
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
  }

  const handleUpdateSubcategory = async (id: string, name: string, icon: string) => {
    const updated = subcategories.map(s => s.id === id ? { ...s, name, icon } : s)
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

  const openCategoryContextMenu = (e: React.MouseEvent, menu: CategoryContextMenuTarget) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 180
    const menuHeight = 220
    setCategoryContextMenu({
      ...menu,
      x: Math.min(e.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(e.clientY, window.innerHeight - menuHeight - 8)
    } as CategoryContextMenu)
  }

  const createCategoryFromMenu = () => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'create-category', title: '新建分类', name: '', icon: '📁' })
  }

  const renameCategoryFromMenu = (category: Category) => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'rename-category', title: '重命名分类', id: category.id, name: category.name, icon: category.icon })
  }

  const addSubcategoryFromMenu = (category: Category) => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'add-subcategory', title: '添加子分类', parentId: category.id, name: '', icon: '•' })
  }

  const deleteCategoryFromMenu = async (category: Category) => {
    const confirmed = await window.electronAPI.confirm(`确定删除分类"${category.name}"吗？该分类下的项目将移到未分类。`)
    if (!confirmed) return
    await handleDeleteCategory(category.id)
    setCategoryContextMenu(null)
  }

  const renameSubcategoryFromMenu = (subcategory: Subcategory) => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'rename-subcategory', title: '重命名子分类', id: subcategory.id, name: subcategory.name, icon: subcategory.icon })
  }

  const deleteSubcategoryFromMenu = async (subcategory: Subcategory) => {
    const confirmed = await window.electronAPI.confirm(`确定删除子分类"${subcategory.name}"吗？该子分类下的项目将移到当前分类下。`)
    if (!confirmed) return
    await handleDeleteSubcategory(subcategory.id)
    setCategoryContextMenu(null)
  }

  const submitCategoryEditDialog = async () => {
    if (!categoryEditDialog) return
    const name = categoryEditDialog.name.trim()
    const icon = categoryEditDialog.icon.trim() || '•'
    if (!name) return

    if (categoryEditDialog.type === 'create-category') {
      await handleAddCategory(name, icon || '📁')
    } else if (categoryEditDialog.type === 'rename-category') {
      await handleUpdateCategory(categoryEditDialog.id, name, icon)
    } else if (categoryEditDialog.type === 'add-subcategory') {
      await handleAddSubcategory(name, icon, categoryEditDialog.parentId)
      setActiveCategory(categoryEditDialog.parentId)
      activeCategoryRef.current = categoryEditDialog.parentId
    } else {
      await handleUpdateSubcategory(categoryEditDialog.id, name, icon)
    }

    setCategoryEditDialog(null)
  }

  const visibleSubcategories = subcategories.filter(s => s.parentId === activeCategory)
  const displaySubcategories = activeCategory ? visibleSubcategories : subcategories

  const handleSubcategoryWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    if (maxScrollLeft <= 0) return

    const wheelDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (wheelDelta === 0) return

    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, el.scrollLeft + wheelDelta))
    if (nextScrollLeft === el.scrollLeft) return

    e.preventDefault()
    el.scrollLeft = nextScrollLeft
  }, [])

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
    const newApps = await parseFilesToApps(files, targetCategory)

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

  const handleRefreshAllIcons = async () => {
    const cleared = await window.electronAPI.clearIconCache()
    const sourceApps = [...appsRef.current]
    const refreshTargets = sourceApps.filter(app => app.type !== 'folder')
    const refreshed: AppItem[] = [...sourceApps]
    const indexById = new Map(sourceApps.map((app, index) => [app.id, index]))
    let successCount = 0
    let failedCount = 0
    let doneCount = 0
    const failures: string[] = []
    const CONCURRENCY = 4
    const isBetterIcon = (nextIcon: string, previousIcon: string) => {
      if (!hasDisplayableIcon(nextIcon)) return false
      if (!previousIcon) return true
      if (needsIconUpdate(previousIcon)) return true
      return nextIcon.length >= 1000 || nextIcon.length > previousIcon.length
    }
    const refreshOne = async (app: AppItem) => {
      let iconPath: string | null = null
      try {
        if (app.type === 'steam') {
          iconPath = await window.electronAPI.extractSteamIcon(app.path)
        }
        if (!iconPath) {
          iconPath = await window.electronAPI.extractIcon(app.path)
        }
      } catch { /* ignore */ }
      if (iconPath && isBetterIcon(iconPath, app.icon || '')) {
        const index = indexById.get(app.id)
        if (index !== undefined) refreshed[index] = { ...app, icon: iconPath }
        successCount++
      } else {
        failedCount++
        failures.push(app.name)
      }
      doneCount++
      setIconRefreshProgress({
        done: doneCount,
        total: refreshTargets.length,
        success: successCount,
        failed: failedCount,
        current: app.name,
        failures: failures.slice(-8)
      })
    }

    setIconRefreshProgress({ done: 0, total: refreshTargets.length, success: 0, failed: 0, failures: [] })
    for (let i = 0; i < refreshTargets.length; i += CONCURRENCY) {
      const batch = refreshTargets.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(refreshOne))
      appsRef.current = [...refreshed]
      setApps([...refreshed])
      await window.electronAPI.saveApps({ apps: refreshed })
    }
    appsRef.current = refreshed
    setApps(refreshed)
    await window.electronAPI.saveApps({ apps: refreshed })
    setIconRefreshProgress(null)
    showMaintenanceSummary({
      title: '图标刷新完成',
      items: [
        `已清理 ${cleared.count} 个图标缓存。`,
        `成功刷新 ${successCount} 个图标。`,
        `文件夹使用默认图标，不参与补全。`,
        ...(failedCount > 0 ? [`${failedCount} 个图标提取失败，已保留原图标。`] : [])
      ]
    })
    alert(`已清理 ${cleared.count} 个图标缓存，成功刷新 ${successCount} 个图标。文件夹使用默认图标，不参与补全。${failedCount > 0 ? `有 ${failedCount} 个图标提取失败，已保留原图标。` : ''}`)
  }

  const handleAutoCategorize = async () => {
    const rules = config?.autoCategoryRules || []
    const currentApps = appsRef.current
    const updatedApps = currentApps.map(app => {
      const haystack = `${app.name} ${app.path} ${(app.aliases || []).join(' ')}`.toLowerCase()
      const rule = rules.find(item => item.categoryId && haystack.includes(item.match.toLowerCase()))
      if (rule) return { ...app, categoryId: rule.categoryId, subcategoryId: null }

      const category = categories.find(cat => haystack.includes(cat.name.toLowerCase()))
      if (category) return { ...app, categoryId: category.id, subcategoryId: null }

      return app
    })
    const changedCount = updatedApps.filter((app, index) =>
      app.categoryId !== currentApps[index]?.categoryId ||
      app.subcategoryId !== currentApps[index]?.subcategoryId
    ).length
    if (changedCount > 0) captureUndoSnapshot('自动分类')
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '自动分类完成',
      items: [changedCount > 0 ? `${changedCount} 个项目已重新归类。` : '没有项目需要调整分类。']
    })
    alert('自动分类已完成。')
  }

  const handleCleanupInvalidApps = async () => {
    const checks = await window.electronAPI.validateApps(appsRef.current.map(app => ({
      id: app.id,
      path: app.path,
      type: app.type
    })))
    const invalidIds = new Set(checks.filter(item => !item.exists).map(item => item.id))
    if (invalidIds.size === 0) {
      alert('没有发现失效的应用路径。')
      return
    }
    const confirmed = await window.electronAPI.confirm(`确定移除 ${invalidIds.size} 个失效项目吗？`)
    if (!confirmed) return
    captureUndoSnapshot('清理失效项')
    const updatedApps = appsRef.current.filter(app => !invalidIds.has(app.id))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '失效项已清理',
      items: [`已移除 ${invalidIds.size} 个失效项目。`]
    })
  }

  const handleRestoreHiddenApps = async () => {
    const hiddenCount = appsRef.current.filter(app => app.hidden).length
    if (hiddenCount > 0) captureUndoSnapshot('恢复隐藏项')
    const updatedApps = appsRef.current.map(app => ({ ...app, hidden: false }))
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    showMaintenanceSummary({
      title: '隐藏项已恢复',
      items: [hiddenCount > 0 ? `已恢复 ${hiddenCount} 个隐藏项目。` : '没有需要恢复的隐藏项目。']
    })
    alert('已恢复搜索中隐藏的项目。')
  }

  const handleExportBackup = async () => {
    const result = await window.electronAPI.exportBackup()
    if (result.success) alert(`备份已导出：\n${result.filePath}`)
  }

  const handleImportBackup = async () => {
    const confirmed = await window.electronAPI.confirm('确定导入备份并替换当前配置、应用和分类吗？')
    if (!confirmed) return
    const result = await window.electronAPI.importBackup()
    if (result.success) {
      await loadData()
      alert('备份已导入。')
    }
  }

  const buildHealthReport = async (): Promise<HealthReport> => {
    const currentApps = appsRef.current
    const checks = await window.electronAPI.validateApps(currentApps.map(app => ({
      id: app.id,
      path: app.path,
      type: app.type
    })))
    const invalidIds = new Set(checks.filter(item => !item.exists).map(item => item.id))
    const pathCounts = new Map<string, number>()
    for (const app of currentApps) {
      const key = app.path.toLowerCase()
      pathCounts.set(key, (pathCounts.get(key) || 0) + 1)
    }
    return {
      total: currentApps.length,
      invalidPaths: currentApps.filter(app => invalidIds.has(app.id)),
      missingIcons: currentApps.filter(appNeedsIconUpdate),
      duplicatePaths: currentApps.filter(app => pathCounts.get(app.path.toLowerCase())! > 1),
      emptyCategories: findEmptyCategories(currentApps, categoriesRef.current),
      hiddenCount: currentApps.filter(app => app.hidden).length
    }
  }

  const captureUndoSnapshot = (label: string) => {
    setUndoSnapshot({
      label,
      apps: appsRef.current.map(app => ({ ...app })),
      categories: categoriesRef.current.map(category => ({ ...category })),
      subcategories: subcategories.map(subcategory => ({ ...subcategory })),
      activeCategory: activeCategoryRef.current
    })
  }

  const restoreUndoSnapshot = async () => {
    if (!undoSnapshot) return

    appsRef.current = undoSnapshot.apps
    categoriesRef.current = undoSnapshot.categories
    activeCategoryRef.current = undoSnapshot.activeCategory
    setApps(undoSnapshot.apps)
    setCategories(undoSnapshot.categories)
    setSubcategories(undoSnapshot.subcategories)
    setActiveCategory(undoSnapshot.activeCategory)
    await Promise.all([
      window.electronAPI.saveApps({ apps: undoSnapshot.apps }),
      window.electronAPI.saveCategories({ categories: undoSnapshot.categories, subcategories: undoSnapshot.subcategories })
    ])
    setUndoSnapshot(null)
    showMaintenanceSummary({
      title: `已撤销：${undoSnapshot.label}`,
      items: ['应用、分类和子分类已恢复到操作前状态。']
    })
    setHealthReport(await buildHealthReport())
  }

  const handleRunHealthCheck = async () => {
    setHealthReport(await buildHealthReport())
  }

  const handleFixHealthIssues = async () => {
    const report = healthReport || await buildHealthReport()
    let updatedApps = [...appsRef.current]
    let removedInvalidCount = 0
    let removedDuplicateCount = 0
    let removedEmptyCategoryCount = 0
    let undoCaptured = false
    const ensureUndoSnapshot = () => {
      if (undoCaptured) return
      captureUndoSnapshot('一键修复')
      undoCaptured = true
    }
    if (report.invalidPaths.length > 0) {
      const confirmed = await window.electronAPI.confirm(`检测到 ${report.invalidPaths.length} 个失效路径，是否移除这些项目？`)
      if (confirmed) {
        ensureUndoSnapshot()
        const invalidIds = new Set(report.invalidPaths.map(app => app.id))
        removedInvalidCount = updatedApps.filter(app => invalidIds.has(app.id)).length
        updatedApps = updatedApps.filter(app => !invalidIds.has(app.id))
      }
    }
    if (report.duplicatePaths.length > 0) {
      const confirmed = await window.electronAPI.confirm('检测到重复路径，是否只保留每个路径的第一个项目？')
      if (confirmed) {
        ensureUndoSnapshot()
        const deduplicated = deduplicateAppsByPath(updatedApps)
        updatedApps = deduplicated.apps
        removedDuplicateCount = deduplicated.removedCount
      }
    }
    if (report.emptyCategories.length > 0) {
      const emptyCategories = filterStillEmptyCategories(report.emptyCategories, updatedApps)
      const confirmed = emptyCategories.length > 0 && await window.electronAPI.confirm(`检测到 ${emptyCategories.length} 个空分类，是否删除这些分类？`)
      if (confirmed) {
        ensureUndoSnapshot()
        removedEmptyCategoryCount = emptyCategories.length
        const emptyIds = new Set(emptyCategories.map(category => category.id))
        const updatedCategories = categoriesRef.current.filter(category => !emptyIds.has(category.id))
        const updatedSubcategories = subcategories.filter(subcategory => !subcategory.parentId || !emptyIds.has(subcategory.parentId))
        categoriesRef.current = updatedCategories
        setCategories(updatedCategories)
        setSubcategories(updatedSubcategories)
        await window.electronAPI.saveCategories({ categories: updatedCategories, subcategories: updatedSubcategories })
        if (activeCategoryRef.current && emptyIds.has(activeCategoryRef.current)) {
          const nextCategoryId = updatedCategories[0]?.id || null
          activeCategoryRef.current = nextCategoryId
          setActiveCategory(nextCategoryId)
        }
      }
    }
    const changed = removedInvalidCount > 0 || removedDuplicateCount > 0 || removedEmptyCategoryCount > 0
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    setHealthReport(await buildHealthReport())
    showMaintenanceSummary({
      title: changed ? '一键修复完成' : '一键修复已检查',
      items: changed
        ? [
          ...(removedInvalidCount > 0 ? [`移除 ${removedInvalidCount} 个失效项目。`] : []),
          ...(removedDuplicateCount > 0 ? [`合并 ${removedDuplicateCount} 个重复项目。`] : []),
          ...(removedEmptyCategoryCount > 0 ? [`删除 ${removedEmptyCategoryCount} 个空分类。`] : [])
        ]
        : ['没有发现需要自动修复的项目。']
    })
  }

  const importShortcutItemsWithAutoCategories = async (items: ShortcutImportItem[]): Promise<boolean> => {
    if (items.length === 0) {
      alert('没有发现可导入的桌面或开始菜单快捷方式。')
      return false
    }

    const existingPaths = new Set(appsRef.current.map(app => app.path.toLowerCase()))
    const importableItems = items
      .filter(item => item.targetPath && !existingPaths.has(item.targetPath.toLowerCase()))
      .slice(0, 120)

    if (importableItems.length === 0) {
      alert('扫描到的快捷方式已经在列表中。')
      return false
    }

    const sourceMeta: Record<ShortcutImportItem['source'], { name: string; icon: string }> = {
      desktop: { name: '桌面快捷方式', icon: '⌘' },
      startMenu: { name: '开始菜单', icon: '⊞' },
      other: { name: '快捷方式', icon: '◇' }
    }
    const nextCategories = [...categoriesRef.current]
    const categoryBySource = new Map<ShortcutImportItem['source'], string>()

    for (const item of importableItems) {
      const source = item.source || 'other'
      const meta = sourceMeta[source]
      let category = nextCategories.find(cat => cat.name === meta.name)
      if (!category) {
        category = {
          id: crypto.randomUUID(),
          name: meta.name,
          icon: meta.icon,
          order: nextCategories.length + 1
        }
        nextCategories.push(category)
      }
      categoryBySource.set(source, category.id)
    }

    const createdCount = nextCategories.length - categoriesRef.current.length
    const confirmed = await window.electronAPI.confirm(
      `发现 ${items.length} 个快捷方式，可新增 ${importableItems.length} 个项目。` +
      `${createdCount > 0 ? `将自动创建 ${createdCount} 个分类。` : ''}是否继续导入？`
    )
    if (!confirmed) return false

    captureUndoSnapshot('导入快捷方式')
    if (createdCount > 0) {
      setCategories(nextCategories)
      categoriesRef.current = nextCategories
      await window.electronAPI.saveCategories({ categories: nextCategories, subcategories })
    }

    const newApps = importableItems.map(item => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: item.name,
      path: item.targetPath,
      icon: item.icon,
      categoryId: categoryBySource.get(item.source || 'other') || nextCategories[0]?.id || null,
      subcategoryId: null,
      pinyin: getPinyin(item.name),
      firstLetter: getFirstLetter(item.name),
      type: item.type,
      aliases: []
    } satisfies AppItem))

    const updatedApps = [...appsRef.current, ...newApps]
    appsRef.current = updatedApps
    setApps(updatedApps)
    await window.electronAPI.saveApps({ apps: updatedApps })
    if (!activeCategoryRef.current && nextCategories.length > 0) {
      setActiveCategory(nextCategories[0].id)
      activeCategoryRef.current = nextCategories[0].id
    }
    scheduleIconBackfill(newApps.filter(app => !app.icon))
    showMaintenanceSummary({
      title: '快捷方式导入完成',
      items: [
        `新增 ${newApps.length} 个项目。`,
        ...(createdCount > 0 ? [`自动创建 ${createdCount} 个分类。`] : [])
      ]
    })
    return true
  }

  const handleImportShortcuts = async () => {
    if (shortcutImportInFlightRef.current) return
    shortcutImportInFlightRef.current = true
    showMaintenanceSummary({
      title: '正在扫描快捷方式',
      items: ['首次扫描会读取桌面和开始菜单，请稍候。']
    }, false)
    try {
      const imported = await importShortcutItemsWithAutoCategories(await window.electronAPI.scanShortcuts())
      if (!imported) clearMaintenanceSummary()
    } catch (error) {
      showMaintenanceSummary({
        title: '快捷方式导入失败',
        items: [error instanceof Error ? error.message : '扫描快捷方式时发生未知错误。']
      })
    } finally {
      shortcutImportInFlightRef.current = false
    }
  }

  const handleExportDiagnostics = async () => {
    const result = await window.electronAPI.exportDiagnostics()
    if (result.success) {
      alert(`诊断日志已导出：\n${result.filePath}`)
    } else if (result.error) {
      alert(`导出诊断日志失败：${result.error}`)
    }
  }

  const completeOnboarding = async () => {
    if (!config) return
    const nextConfig = { ...config, onboardingCompleted: true }
    setConfig(nextConfig)
    await window.electronAPI.saveConfig(nextConfig)
    setShowOnboarding(false)
  }

  const runUiCommand = useCallback(async (command: UiCommand) => {
    switch (command) {
      case 'open-organizer':
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'health-check':
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'refresh-icons':
        setShowSmartOrganize(true)
        await handleRefreshAllIcons()
        break
      case 'auto-categorize':
        await handleAutoCategorize()
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'import-shortcuts':
        setShowSmartOrganize(true)
        await handleImportShortcuts()
        await handleRunHealthCheck()
        break
      case 'restore-hidden':
        await handleRestoreHiddenApps()
        setShowSmartOrganize(true)
        await handleRunHealthCheck()
        break
      case 'export-backup':
        await handleExportBackup()
        break
    }
  }, [
    handleAutoCategorize,
    handleExportBackup,
    handleImportShortcuts,
    handleRefreshAllIcons,
    handleRestoreHiddenApps,
    handleRunHealthCheck
  ])

  useEffect(() => {
    return window.electronAPI.onUiCommand((command) => {
      void runUiCommand(command)
    })
  }, [runUiCommand])

  return (
    <div className={`flex flex-col h-screen relative theme-${config?.ui?.theme || 'aurora'}`}>
      {/* Aurora background orbs */}
      <div className="aurora-bg">
        <div className="aurora-orb aurora-orb--indigo" />
        <div className="aurora-orb aurora-orb--frost" />
        <div className="aurora-orb aurora-orb--violet" />
      </div>

      <header className="glass mx-4 mt-3 px-5 py-3 sticky top-3 z-20 rounded-2xl">
        <div className="flex items-center justify-between gap-4">
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
            className="focus-ring cursor-pointer px-3.5 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium transition-colors duration-200 shadow-sm shadow-brand-500/20 hover:shadow-md hover:shadow-brand-500/30"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              添加应用
            </span>
          </button>
          <button
            onClick={handleAddFolder}
            className="focus-ring cursor-pointer px-3.5 py-2 bg-frost-500 text-white rounded-lg hover:bg-frost-600 text-sm font-medium transition-colors duration-200 shadow-sm shadow-frost-400/20"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              添加文件夹
            </span>
          </button>
          <button
            onClick={() => setShowSmartOrganize(true)}
            className="focus-ring cursor-pointer px-3.5 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium transition-colors duration-200 shadow-sm shadow-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/25"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.6 4.7L18 9.3l-4.4 1.6L12 15.6l-1.6-4.7L6 9.3l4.4-1.6L12 3z"/><path d="M19 14l.9 2.6 2.1.8-2.1.8L19 21l-.9-2.8-2.1-.8 2.1-.8L19 14z"/><path d="M5 13l.8 2.2 1.7.6-1.7.7L5 19l-.8-2.5-1.7-.7 1.7-.6L5 13z"/></svg>
              整理中心
            </span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="focus-ring cursor-pointer px-3.5 py-2 bg-white/80 text-slate-700 rounded-lg hover:bg-slate-900 hover:text-white text-sm font-medium transition-colors duration-200 border border-slate-200/80"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              设置
            </span>
          </button>
          <UpdateButton state={updateState} version={updateVersion} progress={updateProgress ?? undefined} />
        </div>
        </div>
        <div className="mt-3 border-t border-brand-100/70 pt-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-bold text-white shadow-sm shadow-slate-900/20">2.0</span>
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900 truncate">{activeCategoryLabel}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white border border-slate-900">{overviewHealth}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{overviewStats.visible}/{overviewStats.total} 可见</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{displaySubcategories.length} 个子分类</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{overviewStats.folders} 个文件夹</span>
                  {overviewStats.missingIcons > 0 && (
                    <button
                      onClick={handleRefreshAllIcons}
                      disabled={!!iconRefreshProgress}
                      className="focus-ring cursor-pointer rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200 hover:bg-amber-500 hover:text-white hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                    >
                      {iconRefreshProgress ? `刷新中 ${iconRefreshProgress.done}/${iconRefreshProgress.total}` : `${overviewStats.missingIcons} 个图标待补全`}
                    </button>
                  )}
                  {overviewStats.hidden > 0 && (
                    <button
                      onClick={handleRestoreHiddenApps}
                      className="focus-ring cursor-pointer rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors"
                    >
                      恢复 {overviewStats.hidden} 个隐藏项
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {smartLaunchApps.length > 0 && (
              <div className="hidden min-w-0 items-center gap-2 lg:flex">
                <span className="shrink-0 text-[11px] font-semibold text-slate-500">智能启动</span>
                {smartLaunchApps.map(app => (
                  <button
                    key={app.id}
                    onClick={() => handleOpenApp(app)}
                    className="group focus-ring cursor-pointer inline-flex max-w-[132px] items-center gap-1.5 rounded-lg border border-brand-100/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                    title={app.name}
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-brand-50 group-hover:bg-white/15">
                      {hasDisplayableIcon(app.icon) ? (
                        <img src={app.icon} alt="" className="h-4 w-4" draggable={false} />
                      ) : (
                        <span className="text-[10px]">{app.type === 'folder' ? '📁' : app.type === 'steam' ? '🎮' : '📦'}</span>
                      )}
                    </span>
                    <span className="truncate">{app.name}</span>
                  </button>
                ))}
              </div>
            )}
            {smartLaunchApps.length === 0 && overviewStats.total > 0 && (
              <div className="hidden text-[11px] font-medium text-slate-500 lg:block">
                打开几次项目后会生成智能启动
              </div>
            )}
          </div>
        </div>
      </header>

      <div ref={categoryBarRef} className="px-5 pt-3 pb-2 flex gap-2 overflow-x-auto">
        <button
          onClick={() => { setActiveCategory(null) }}
          onContextMenu={(e) => openCategoryContextMenu(e, { type: 'all' })}
          className={`focus-ring cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
            activeCategory === null
              ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
              : 'bg-white/60 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600 border border-brand-100/50'
          }`}
        >
          全部
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            data-category-id={cat.id}
            onClick={() => { setActiveCategory(cat.id) }}
            onContextMenu={(e) => openCategoryContextMenu(e, { type: 'category', id: cat.id })}
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
                const newApps = await parseFilesToApps(files, cat.id)
                if (newApps.length > 0) {
                  const updatedApps = [...appsRef.current, ...newApps]
                  appsRef.current = updatedApps
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
            className={`focus-ring cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
              activeCategory === cat.id
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
                : dragOverCategory === cat.id
                  ? 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-400/30 ring-2 ring-emerald-300'
                  : 'bg-white/60 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600 border border-brand-100/50'
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      <div
        ref={subcategoryBarRef}
        onWheel={handleSubcategoryWheel}
        className="subcategory-scroll px-5 pb-3 flex gap-2 overflow-x-auto"
      >
        {displaySubcategories.map(sub => (
          <button
            key={sub.id}
            data-subcategory-id={sub.id}
            draggable
            onContextMenu={(e) => openCategoryContextMenu(e, { type: 'subcategory', id: sub.id })}
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
            className={`focus-ring cursor-pointer px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
              dragOverSubId === sub.id
                ? 'bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-400/30 ring-2 ring-emerald-300'
                : draggedSubId === sub.id
                  ? 'opacity-40 scale-95'
                  : 'bg-white/50 text-slate-700 hover:bg-brand-500 hover:text-white hover:border-brand-500 border border-brand-100/40'
            }`}
          >
            {sub.icon} {sub.name}
          </button>
        ))}
        <button
          onClick={createCategoryFromMenu}
          className="focus-ring cursor-pointer px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/60 text-slate-700 hover:bg-brand-500 hover:text-white transition-colors duration-200 border border-dashed border-brand-200/80 hover:border-brand-500"
        >
          + 分类
        </button>
        <button
          onClick={() => {
            if (categories.length === 0) {
              alert('请先创建一个主分类，然后再添加子分类。')
              return
            }
            const parentCategory = categories.find(category => category.id === activeCategory) || categories[0]
            addSubcategoryFromMenu(parentCategory)
          }}
          className="focus-ring cursor-pointer px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/60 text-slate-700 hover:bg-brand-500 hover:text-white transition-colors duration-200 border border-dashed border-brand-200/80 hover:border-brand-500"
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
          <section className="hidden">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white shadow-sm shadow-slate-900/20">2.0</span>
                <div>
                  <h2 className="text-sm font-display font-bold text-slate-900 truncate">{activeCategoryLabel}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{overviewStats.total} 个项目</span>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{displaySubcategories.length} 个子分类</span>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 border border-slate-200/80">{overviewStats.folders} 个文件夹</span>
                    {overviewStats.missingIcons > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200">{overviewStats.missingIcons} 个图标待补全</span>}
                    {overviewStats.hidden > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 border border-slate-200">{overviewStats.hidden} 个搜索隐藏项</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {smartLaunchApps.length > 0 && (
                <div className="hidden min-w-0 items-center gap-2 lg:flex">
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">智能启动</span>
                  {smartLaunchApps.map(app => (
                    <button
                      key={app.id}
                      onClick={() => handleOpenApp(app)}
                      className="group focus-ring cursor-pointer inline-flex max-w-[132px] items-center gap-1.5 rounded-lg border border-brand-100/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                      title={app.name}
                    >
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-brand-50 group-hover:bg-white/15">
                        {hasDisplayableIcon(app.icon) ? (
                          <img src={app.icon} alt="" className="h-4 w-4" draggable={false} />
                        ) : (
                          <span className="text-[10px]">{app.type === 'folder' ? '📁' : app.type === 'steam' ? '🎮' : '📦'}</span>
                        )}
                      </span>
                      <span className="truncate">{app.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowSmartOrganize(true)}
                className="focus-ring cursor-pointer shrink-0 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-600"
              >
                整理中心
              </button>
            </div>
          </section>
        {(() => {
          const groups: { sub: Subcategory | null; apps: typeof filteredApps }[] = []
          const noSub = filteredApps.filter(a => !a.subcategoryId)
          if (noSub.length > 0) groups.push({ sub: null, apps: noSub })
          for (const s of displaySubcategories) {
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
                            {hasDisplayableIcon(app.icon) ? (
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

      {undoSnapshot && (
        <UndoToast
          label={undoSnapshot.label}
          onUndo={restoreUndoSnapshot}
          onClose={() => setUndoSnapshot(null)}
        />
      )}

      {categoryContextMenu && (
        <CategoryContextMenuOverlay
          menu={categoryContextMenu}
          categories={categories}
          subcategories={subcategories}
          onCreateCategory={createCategoryFromMenu}
          onSelectCategory={category => {
            setActiveCategory(category.id)
            activeCategoryRef.current = category.id
            setCategoryContextMenu(null)
          }}
          onRenameCategory={renameCategoryFromMenu}
          onAddSubcategory={addSubcategoryFromMenu}
          onDeleteCategory={deleteCategoryFromMenu}
          onLocateSubcategory={subcategory => {
            document.getElementById(`subcat-${subcategory.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            setCategoryContextMenu(null)
          }}
          onRenameSubcategory={renameSubcategoryFromMenu}
          onDeleteSubcategory={deleteSubcategoryFromMenu}
        />
      )}

      {categoryEditDialog && (
        <CategoryEditDialogOverlay
          dialog={categoryEditDialog}
          onChange={setCategoryEditDialog}
          onClose={() => setCategoryEditDialog(null)}
          onSubmit={submitCategoryEditDialog}
        />
      )}

      {showSmartOrganize && (
        <SmartOrganizeModal
          apps={apps}
          categories={categories}
          healthReport={healthReport}
          iconRefreshProgress={iconRefreshProgress}
          maintenanceSummary={maintenanceSummary}
          onClose={() => setShowSmartOrganize(false)}
          onRunHealthCheck={handleRunHealthCheck}
          onFixHealthIssues={handleFixHealthIssues}
          onRefreshIcons={handleRefreshAllIcons}
          onAutoCategorize={handleAutoCategorize}
          onImportShortcuts={handleImportShortcuts}
          onCleanupInvalid={handleCleanupInvalidApps}
          onRestoreHidden={handleRestoreHiddenApps}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
        />
      )}

      {showSettings && config && (
        <SettingsModal
          config={config}
          currentVersion={currentVersion}
          onClose={() => setShowSettings(false)}
          onSave={handleUpdateConfig}
          updateState={updateState}
          updateVersion={updateVersion}
          updateError={updateError}
          onCheckUpdate={manualCheckForUpdate}
          onRefreshIcons={handleRefreshAllIcons}
          iconRefreshProgress={iconRefreshProgress}
          onAutoCategorize={handleAutoCategorize}
          onCleanupInvalid={handleCleanupInvalidApps}
          onRestoreHidden={handleRestoreHiddenApps}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onImportShortcuts={handleImportShortcuts}
          onRunHealthCheck={handleRunHealthCheck}
          onFixHealthIssues={handleFixHealthIssues}
          onExportDiagnostics={handleExportDiagnostics}
          onOpenDataDirectory={() => window.electronAPI.openDataDirectory()}
          healthReport={healthReport}
          onOpenUpdateLog={() => window.electronAPI.openUpdateLog()}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          onClose={completeOnboarding}
          onImportShortcuts={async () => {
            await handleImportShortcuts()
            await completeOnboarding()
          }}
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

      {updateState === 'available' && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) dismissUpdate() }}
        >
          <div className="glass rounded-2xl p-6 w-[400px] shadow-xl shadow-brand-500/5 modal-enter">
            <h3 className="text-lg font-display font-bold text-slate-800 mb-2">
              🎉 发现新版本 v{updateVersion}
            </h3>
            {updateReleaseNotes && (
              <div className="text-sm text-slate-600 mb-4 max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">更新内容：</p>
                <div className="whitespace-pre-wrap">{updateReleaseNotes}</div>
              </div>
            )}
            <p className="text-sm text-slate-500 mb-4">是否下载更新？</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={dismissUpdate}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                稍后再说
              </button>
              <button
                onClick={startDownload}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
              >
                下载更新
              </button>
            </div>
          </div>
        </div>
      )}

      {updateState === 'downloaded' && (
        <UpdateDialog
          version={updateVersion}
          releaseNotes={updateReleaseNotes}
          error={updateError}
          onConfirm={confirmInstall}
          onDismiss={dismissUpdate}
          onOpenLog={() => window.electronAPI.openUpdateLog()}
        />
      )}
    </div>
  )
}


export default App

