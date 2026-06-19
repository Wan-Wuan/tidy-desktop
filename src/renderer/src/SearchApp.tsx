import React, { useState, useEffect, useRef, useCallback } from 'react'
import { AppItem, Config, Category } from '../../shared/types'
import { isFolderPath, getFolderSuggestion, checkSearchEngine } from '../../shared/utils'

interface SearchEngineInfo {
  key: string
  name: string
  url: string
}

const MAX_DISPLAY = 6
const INPUT_HEIGHT = 56
const ROW_HEIGHT = 57
const NO_RESULTS_HEIGHT = 40
const RESIZE_DEBOUNCE_MS = 80

function SearchApp() {
  const [query, setQuery] = useState('')
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [activeEngine, setActiveEngine] = useState<SearchEngineInfo | null>(null)
  const [results, setResults] = useState<AppItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef('')
  const resultsRef = useRef<AppItem[]>([])
  const isActiveRef = useRef(false)
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const currentHeightRef = useRef(INPUT_HEIGHT)

  useEffect(() => {
    loadData()
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)

    const removeBlur = window.electronAPI.onBlur(() => {
      // 搜索框永不因失焦而隐藏，只通过 Escape 或打开应用关闭
    })

    const removeReset = window.electronAPI.onResetSearch(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      setQuery('')
      queryRef.current = ''
      setResults([])
      resultsRef.current = []
      setActiveEngine(null)
      setActiveIndex(0)
      currentHeightRef.current = INPUT_HEIGHT
      loadData()
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      setTimeout(() => inputRef.current?.focus(), 50)
    })

    return () => {
      clearTimeout(focusTimer)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      removeBlur()
      removeReset()
    }
  }, [])

  // activeIndex 变化时滚动到可视区域
  useEffect(() => {
    const el = document.querySelector('.search-result-item.active')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const resizeWindow = useCallback((resultCount: number, hasQuery: boolean = false) => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(() => {
      let targetHeight: number
      if (resultCount > 0) {
        const count = Math.min(resultCount, MAX_DISPLAY)
        targetHeight = INPUT_HEIGHT + count * ROW_HEIGHT
      } else if (hasQuery) {
        targetHeight = INPUT_HEIGHT + NO_RESULTS_HEIGHT
      } else {
        targetHeight = INPUT_HEIGHT
      }
      if (targetHeight !== currentHeightRef.current) {
        currentHeightRef.current = targetHeight
        window.electronAPI.resizeSearchWindow(targetHeight)
      }
    }, RESIZE_DEBOUNCE_MS)
  }, [])

  const loadData = async () => {
    const [configData, appsData, categoriesData] = await Promise.all([
      window.electronAPI.getConfig(),
      window.electronAPI.getApps(),
      window.electronAPI.getCategories()
    ])
    setConfig(configData)
    setApps(appsData.apps)
    setCategories(categoriesData.categories)
  }

  const getCategoryName = (categoryId: string): string => {
    const cat = categories.find(c => c.id === categoryId)
    return cat ? cat.name : ''
  }

  const filterApps = useCallback((searchQuery: string): AppItem[] => {
    const terms = searchQuery.toLowerCase().trim().split(/\s+/)
    const matched = apps.filter(app => {
      const name = app.name.toLowerCase()
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
        const flMatch = (() => {
          let ti = 0
          for (let wi = 0; wi < nameWords.length && ti < term.length; wi++) {
            if (nameWords[wi][0] === term[ti]) ti++
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
          if (pinyinWords[wi][0] === term[pti]) pti++
        }
        return pti === term.length
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
  }, [apps])

  const resetAll = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    setQuery('')
    queryRef.current = ''
    setResults([])
    resultsRef.current = []
    setActiveEngine(null)
    setActiveIndex(0)
    currentHeightRef.current = INPUT_HEIGHT
    window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
  }, [])

  const handleOpenItem = async (app: AppItem) => {
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    if (app.type === 'folder') {
      await window.electronAPI.openFolder(app.path)
    } else if (app.type === 'steam') {
      await window.electronAPI.openSteam(app.path)
    } else {
      await window.electronAPI.openApp(app.path)
    }
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  const handleSearchRef = useRef<() => void>(() => {})
  handleSearchRef.current = async () => {
    if (activeEngine) {
      if (queryRef.current.trim()) {
        isActiveRef.current = true
        window.electronAPI.hideSearchWindow()
        const url = activeEngine.url + encodeURIComponent(queryRef.current.trim())
        resetAll()
        await window.electronAPI.openUrl(url)
        setTimeout(() => { isActiveRef.current = false }, 200)
      }
      return
    }
    if (resultsRef.current.length > 0) {
      const app = resultsRef.current[activeIndex] || resultsRef.current[0]
      isActiveRef.current = true
      window.electronAPI.hideSearchWindow()
      resetAll()
      if (app.type === 'folder') {
        await window.electronAPI.openFolder(app.path)
      } else if (app.type === 'steam') {
        await window.electronAPI.openSteam(app.path)
      } else {
        await window.electronAPI.openApp(app.path)
      }
      setTimeout(() => { isActiveRef.current = false }, 200)
    }
  }

  const handleSearch = useCallback(() => handleSearchRef.current(), [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    queryRef.current = value

    if (value.endsWith(' ') && config?.searchEngines) {
      const engineCheck = checkSearchEngine(value, config.searchEngines)
      if (engineCheck.isEngine && engineCheck.engine) {
        if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
        setActiveEngine(engineCheck.engine)
        setQuery('')
        queryRef.current = ''
        setResults([])
        resultsRef.current = []
        setActiveIndex(0)
        currentHeightRef.current = INPUT_HEIGHT
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
        return
      }
    }

    if (activeEngine) {
      return
    }

    if (!value.trim()) {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      setResults([])
      resultsRef.current = []
      setActiveIndex(0)
      currentHeightRef.current = INPUT_HEIGHT
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      return
    }

    const filtered = filterApps(value)
    setResults(filtered)
    resultsRef.current = filtered
    const newIndex = filtered.length > 0 ? Math.min(0, filtered.length - 1) : 0
    setActiveIndex(newIndex)
    resizeWindow(filtered.length, !!value.trim())
  }, [activeEngine, config, filterApps])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      // 有内容（结果或输入）时先清空，无内容时才隐藏
      if (resultsRef.current.length > 0 || queryRef.current || activeEngine) {
        setResults([])
        resultsRef.current = []
        setActiveIndex(0)
        setQuery('')
        queryRef.current = ''
        if (activeEngine) setActiveEngine(null)
        currentHeightRef.current = INPUT_HEIGHT
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      } else {
        window.electronAPI.hideSearchWindow()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const len = resultsRef.current.length
      if (len > 0) {
        setActiveIndex(prev => {
          const next = prev + 1
          return next >= len ? 0 : next
        })
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const len = resultsRef.current.length
      if (len > 0) {
        setActiveIndex(prev => {
          const next = prev - 1
          return next < 0 ? len - 1 : next
        })
      }
    } else if (e.key === 'Backspace' && queryRef.current === '' && activeEngine) {
      setActiveEngine(null)
      currentHeightRef.current = INPUT_HEIGHT
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
    }
  }, [activeEngine, handleSearch])

  const hasResults = results.length > 0

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        {activeEngine && (
          <div className="search-engine-badge">
            <span>{activeEngine.name}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { isActiveRef.current = true }}
          onBlur={() => {
            setTimeout(() => {
              if (!isActiveRef.current) {
                inputRef.current?.focus()
              }
            }, 150)
          }}
          placeholder={activeEngine ? `在 ${activeEngine.name} 中搜索...` : '搜索应用或文件夹...'}
          autoFocus
        />
      </div>

      {hasResults && (
        <div className="search-results">
          {results.map((app, index) => (
            <div
              key={app.id}
              className={`search-result-item ${index === activeIndex ? 'active' : ''}`}
              onClick={() => handleOpenItem(app)}
              onMouseDown={(e) => { e.preventDefault(); isActiveRef.current = true }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className={`search-result-icon ${app.type === 'folder' ? 'folder' : ''}`}>
                {app.icon ? (
                  <img src={app.icon} alt={app.name} width="28" height="28" />
                ) : (
                  <span className="app-icon">{app.type === 'folder' ? '📁' : '📦'}</span>
                )}
              </div>
              <div className="search-result-info">
                <div className="search-result-name">{app.name}</div>
                <div className="search-result-path">
                  {getCategoryName(app.categoryId) && (
                    <span className="search-result-category">{getCategoryName(app.categoryId)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasResults && query.trim() && (
        <div className="search-no-results">
          <span>没有找到匹配的应用或文件夹</span>
        </div>
      )}
    </div>
  )
}

export default SearchApp
