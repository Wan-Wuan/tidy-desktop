import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { AppItem, Config, Category, Subcategory } from '../../shared/types'
import { isFolderPath, getFolderSuggestion, checkSearchEngine } from '../../shared/utils'

interface SearchEngineInfo {
  key: string
  name: string
  url: string
}

const ENGINE_ICONS: { [key: string]: string } = {
  b: 'Bing',
  g: 'Google',
  baidu: 'Baidu',
  bd: 'Baidu'
}

const MAX_RESULTS = 10
const INPUT_HEIGHT = 64
const ROW_HEIGHT = 56

function SearchApp() {
  const [query, setQuery] = useState('')
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [activeEngine, setActiveEngine] = useState<SearchEngineInfo | null>(null)
  const [results, setResults] = useState<AppItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const isInteracting = useRef(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)

    const removeBlur = window.electronAPI.onBlur(() => {
      if (!isInteracting.current) {
        window.electronAPI.hideSearchWindow()
      }
    })

    const removeReset = window.electronAPI.onResetSearch(() => {
      setQuery('')
      setResults([])
      setActiveEngine(null)
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
      const height = INPUT_HEIGHT + Math.min(resultCount, MAX_RESULTS) * ROW_HEIGHT + 8
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

  const handleSearchEngineCheck = useCallback((input: string): { isEngine: boolean; engine?: SearchEngineInfo } => {
    if (!config?.searchEngines) return { isEngine: false }
    return checkSearchEngine(input, config.searchEngines) as { isEngine: boolean; engine?: SearchEngineInfo }
  }, [config])

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
      return [suggestion].slice(0, MAX_RESULTS)
    }
    if (suggestion) {
      return [suggestion, ...matched].slice(0, MAX_RESULTS)
    }

    return matched.slice(0, MAX_RESULTS)
  }, [apps])

  const resetAll = useCallback(() => {
    setQuery('')
    setResults([])
    setActiveEngine(null)
    window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
  }, [])

  const handleSearch = useCallback(async () => {
    if (activeEngine) {
      if (query.trim()) {
        window.electronAPI.hideSearchWindow()
        resetAll()
        await window.electronAPI.openUrl(activeEngine.url + encodeURIComponent(query.trim()))
      }
      return
    }
    if (results.length > 0) {
      const app = results[activeIndex] || results[0]
      window.electronAPI.hideSearchWindow()
      resetAll()
      if (app.type === 'folder') {
        await window.electronAPI.openFolder(app.path)
      } else if (app.type === 'steam') {
        await window.electronAPI.openSteam(app.path)
      } else {
        await window.electronAPI.openApp(app.path)
      }
    }
  }, [activeEngine, query, results, activeIndex, resetAll])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)

    if (value.endsWith(' ') && config?.searchEngines) {
      const engineCheck = checkSearchEngine(value, config.searchEngines)
      if (engineCheck.isEngine && engineCheck.engine) {
        setActiveEngine(engineCheck.engine)
        setQuery('')
        setResults([])
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
        return
      }
    }

    if (activeEngine) {
      setResults([])
      return
    }

    if (!value.trim()) {
      setResults([])
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT)
      return
    }

    const filtered = filterApps(value)
    setResults(filtered)
    setActiveIndex(0)
    resizeWindow(filtered.length)
  }, [activeEngine, config, filterApps])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (activeEngine) {
        resetAll()
      } else {
        window.electronAPI.hideSearchWindow()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length > 0) {
        setActiveIndex(prev => (prev + 1) % results.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length > 0) {
        setActiveIndex(prev => (prev - 1 + results.length) % results.length)
      }
    } else if (e.key === 'Backspace' && query === '' && activeEngine) {
      setActiveEngine(null)
    }
  }, [activeEngine, query, handleSearch, resetAll, results.length])

  const handleOpenItem = async (app: AppItem) => {
    isInteracting.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    if (app.type === 'folder') {
      await window.electronAPI.openFolder(app.path)
    } else if (app.type === 'steam') {
      await window.electronAPI.openSteam(app.path)
    } else {
      await window.electronAPI.openApp(app.path)
    }
  }

  const hasResults = results.length > 0

  return (
    <div 
      className="search-wrapper"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          window.electronAPI.hideSearchWindow()
        }
      }}
    >
      <div 
        className="search-container"
        onMouseEnter={() => { isInteracting.current = true }}
        onMouseLeave={() => { isInteracting.current = false }}
      >
      <div className="search-input-wrapper">
        <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        
        {activeEngine && (
          <div className="search-engine-badge">
            <span>{ENGINE_ICONS[activeEngine.key] || activeEngine.name}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { isInteracting.current = true }}
          onBlur={() => { setTimeout(() => { isInteracting.current = false }, 100) }}
          placeholder={activeEngine ? `在 ${activeEngine.name} 中搜索...` : '搜索应用或文件夹...'}
          autoFocus
        />
      </div>

      {hasResults && (
        <div className="search-results" ref={resultsRef}>
          {results.map((app, index) => (
            <div
              key={app.id}
              className={`search-result-item ${index === 0 ? 'first' : ''} ${index === activeIndex ? 'active' : ''}`}
              onClick={() => handleOpenItem(app)}
              onMouseDown={() => { isInteracting.current = true }}
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
    </div>
  )
}

export default SearchApp
