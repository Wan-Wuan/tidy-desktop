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

  useEffect(() => {
    loadData()
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)

    const removeBlur = window.electronAPI.onBlur(() => {
      // 搜索框永不因失焦而隐藏，只通过 Escape 或打开应用关闭
    })

    const removeReset = window.electronAPI.onResetSearch(() => {
      setQuery('')
      queryRef.current = ''
      setResults([])
      resultsRef.current = []
      setActiveEngine(null)
      setActiveIndex(0)
      loadData()
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      setTimeout(() => inputRef.current?.focus(), 50)
    })

    return () => {
      clearTimeout(focusTimer)
      removeBlur()
      removeReset()
    }
  }, [])

  const resizeWindow = (resultCount: number) => {
    if (resultCount > 0) {
      const count = Math.min(resultCount, MAX_DISPLAY)
      const height = INPUT_HEIGHT + count * ROW_HEIGHT
      window.electronAPI.resizeSearchWindow(height)
    } else {
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
    }
  }

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
    setQuery('')
    queryRef.current = ''
    setResults([])
    resultsRef.current = []
    setActiveEngine(null)
    setActiveIndex(0)
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

  const handleSearch = useCallback(async () => {
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
  }, [activeEngine, activeIndex, resetAll])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    queryRef.current = value

    if (value.endsWith(' ') && config?.searchEngines) {
      const engineCheck = checkSearchEngine(value, config.searchEngines)
      if (engineCheck.isEngine && engineCheck.engine) {
        setActiveEngine(engineCheck.engine)
        setQuery('')
        queryRef.current = ''
        setResults([])
        resultsRef.current = []
        setActiveIndex(0)
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
        return
      }
    }

    if (activeEngine) {
      return
    }

    if (!value.trim()) {
      setResults([])
      resultsRef.current = []
      setActiveIndex(0)
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      return
    }

    const filtered = filterApps(value)
    setResults(filtered)
    resultsRef.current = filtered
    setActiveIndex(0)
    resizeWindow(filtered.length)
  }, [activeEngine, config, filterApps])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (resultsRef.current.length > 0) {
        setResults([])
        resultsRef.current = []
        setActiveIndex(0)
        setQuery('')
        queryRef.current = ''
        if (activeEngine) setActiveEngine(null)
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      } else if (activeEngine) {
        setActiveEngine(null)
        setQuery('')
        queryRef.current = ''
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      } else {
        window.electronAPI.hideSearchWindow()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (resultsRef.current.length > 0) {
        setActiveIndex(prev => (prev + 1) % resultsRef.current.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (resultsRef.current.length > 0) {
        setActiveIndex(prev => (prev - 1 + resultsRef.current.length) % resultsRef.current.length)
      }
    } else if (e.key === 'Backspace' && queryRef.current === '' && activeEngine) {
      setActiveEngine(null)
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
              ref={index === activeIndex ? (el) => {
                if (el) el.scrollIntoView({ block: 'nearest' })
              } : undefined}
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
