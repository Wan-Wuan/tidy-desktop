import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { AppItem, Config, Category } from '../../shared/types'
import { getFolderSuggestion, checkSearchEngine } from '../../shared/utils'

interface SearchEngineInfo {
  key: string
  name: string
  url: string
}

type SearchResult = Omit<AppItem, 'type'> & {
  type?: AppItem['type'] | 'action'
  actionCommand?: string
}

const MAX_DISPLAY = 6
const INPUT_HEIGHT = 56
const RESULT_ITEM_HEIGHT = 51
const RESULT_ITEM_GAP = 4
const RESULTS_PADDING_Y = 8
const NO_RESULTS_HEIGHT = 44
const EMPTY_HINT_HEIGHT = 44
const RESIZE_DEBOUNCE_MS = 80

function SearchApp() {
  const [query, setQuery] = useState('')
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [activeEngine, setActiveEngine] = useState<SearchEngineInfo | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef('')
  const resultsRef = useRef<SearchResult[]>([])
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const isActiveRef = useRef(false)
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const currentHeightRef = useRef(INPUT_HEIGHT + EMPTY_HINT_HEIGHT)

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
      currentHeightRef.current = INPUT_HEIGHT + EMPTY_HINT_HEIGHT
      loadData()
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT + EMPTY_HINT_HEIGHT)
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
  useLayoutEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return

    const item = container.querySelector<HTMLElement>('.search-result-item.active')
    if (!item) return

    const style = window.getComputedStyle(container)
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    const itemTop = item.offsetTop - paddingTop
    const itemBottom = itemTop + item.offsetHeight
    const visibleTop = container.scrollTop
    const visibleBottom = visibleTop + container.clientHeight

    if (itemTop < visibleTop) {
      container.scrollTop = itemTop
    } else if (itemBottom > visibleBottom) {
      container.scrollTop = itemBottom - container.clientHeight + paddingBottom
    }
  }, [activeIndex, results])

  const resizeWindow = useCallback((resultCount: number, hasQuery: boolean = false) => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(() => {
      let targetHeight: number
      if (resultCount > 0) {
        const count = Math.min(resultCount, MAX_DISPLAY)
        const resultsHeight =
          RESULTS_PADDING_Y * 2 +
          count * RESULT_ITEM_HEIGHT +
          Math.max(0, count - 1) * RESULT_ITEM_GAP
        targetHeight = INPUT_HEIGHT + resultsHeight
      } else if (hasQuery) {
        targetHeight = INPUT_HEIGHT + NO_RESULTS_HEIGHT
      } else {
        targetHeight = INPUT_HEIGHT + EMPTY_HINT_HEIGHT
      }
      if (targetHeight !== currentHeightRef.current) {
        currentHeightRef.current = targetHeight
        window.electronAPI.resizeSearchWindow(targetHeight)
      }
    }, RESIZE_DEBOUNCE_MS)
  }, [])

  const loadData = async () => {
    try {
      const [configData, appsData, categoriesData] = await Promise.all([
        window.electronAPI.getConfig(),
        window.electronAPI.getApps(),
        window.electronAPI.getCategories()
      ])
      setConfig(configData)
      setApps(appsData?.apps || [])
      setCategories(categoriesData?.categories || [])
    } catch (err) {
      console.error('SearchApp: loadData failed:', err)
    }
  }

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return ''
    const cat = categories.find(c => c.id === categoryId)
    return cat ? cat.name : ''
  }

  const splitSearchWords = (value: string): string[] => {
    return value
      .toLowerCase()
      .split(/[\s\-_.,/\\|()[\]{}]+/)
      .map(word => word.trim())
      .filter(Boolean)
  }

  const compactSearchText = (value: string): string => {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
  }

  const getSearchFields = (app: AppItem) => {
    const name = app.name.toLowerCase()
    const pinyin = (app.pinyin || '').toLowerCase()
    const firstLetter = (app.firstLetter || '').toLowerCase()
    const aliases = (app.aliases || []).map(alias => alias.toLowerCase())
    const nameWords = splitSearchWords(name)
    const pinyinWords = splitSearchWords(pinyin)
    const wordInitials = nameWords.map(word => word[0]).join('')
    const pinyinInitials = pinyinWords.map(word => word[0]).join('')
    const compactName = compactSearchText(name)
    const compactPinyin = compactSearchText(pinyin)

    return {
      name,
      pinyin,
      firstLetter,
      aliases,
      nameWords,
      pinyinWords,
      wordInitials,
      pinyinInitials,
      compactName,
      compactPinyin
    }
  }

  const matchesTerm = (app: AppItem, term: string): boolean => {
    const fields = getSearchFields(app)
    const compactTerm = compactSearchText(term)

    if (!compactTerm) return true
    if (fields.aliases.some(alias => alias.includes(term))) return true
    if (fields.name.includes(term)) return true
    if (fields.pinyin.includes(term)) return true
    if (fields.firstLetter.startsWith(compactTerm)) return true
    if (fields.wordInitials.startsWith(compactTerm)) return true
    if (fields.pinyinInitials.startsWith(compactTerm)) return true
    if (fields.nameWords.some(word => word.startsWith(term))) return true
    if (fields.pinyinWords.some(word => word.startsWith(term))) return true

    return compactTerm.length >= 2 && (
      fields.compactName.startsWith(compactTerm) ||
      fields.compactPinyin.startsWith(compactTerm)
    )
  }

  const getSearchScore = (app: AppItem, terms: string[]): number => {
    const fields = getSearchFields(app)

    let score = (app.launchCount || 0) * 8 + Math.min(20, Math.floor((app.lastOpenedAt || 0) / 86400000))
    for (const term of terms) {
      const compactTerm = compactSearchText(term)
      if (fields.aliases.some(alias => alias === term)) score += 120
      if (fields.name === term) score += 100
      if (fields.name.startsWith(term)) score += 80
      if (fields.compactName.startsWith(compactTerm)) score += 70
      if (fields.nameWords.some(word => word.startsWith(term))) score += 65
      if (fields.firstLetter.startsWith(compactTerm)) score += 60
      if (fields.wordInitials.startsWith(compactTerm)) score += 55
      if (fields.pinyin.startsWith(term)) score += 50
      if (fields.compactPinyin.startsWith(compactTerm)) score += 45
      if (fields.pinyinWords.some(word => word.startsWith(term))) score += 40
      if (fields.aliases.some(alias => alias.includes(term))) score += 35
      if (fields.name.includes(term)) score += 30
      if (fields.pinyin.includes(term)) score += 25
    }
    return score
  }

  const getQuickActionResults = useCallback((searchQuery: string): SearchResult[] => {
    const normalized = searchQuery.trim().toLowerCase()
    if (!normalized.startsWith('>')) return []
    return (config?.quickActions || [])
      .filter(action => action.enabled && (
        action.key.toLowerCase().includes(normalized) ||
        action.name.toLowerCase().includes(normalized.slice(1))
      ))
      .map(action => ({
        id: `__action_${action.command}`,
        name: action.name,
        path: action.key,
        icon: '',
        categoryId: null,
        subcategoryId: null,
        pinyin: '',
        firstLetter: '',
        type: 'action',
        actionCommand: action.command
      }))
  }, [config])

  const filterApps = useCallback((searchQuery: string): SearchResult[] => {
    const actionResults = getQuickActionResults(searchQuery)
    if (actionResults.length > 0) return actionResults

    const terms = searchQuery.toLowerCase().trim().split(/\s+/).filter(term => compactSearchText(term))
    if (terms.length === 0) return []
    const matched = apps.filter(app => {
      if (app.hidden) return false
      return terms.every(term => matchesTerm(app, term))
    }).sort((a, b) => getSearchScore(b, terms) - getSearchScore(a, terms))

    const suggestion = getFolderSuggestion(searchQuery)
    if (suggestion && matched.length === 0) {
      return [suggestion]
    }
    if (suggestion) {
      return [suggestion, ...matched]
    }

    return matched
  }, [apps, getQuickActionResults])

  const getDefaultSearchEngine = useCallback((): SearchEngineInfo | null => {
    const key = config?.defaultEngine || 'b'
    const engine = config?.searchEngines?.[key] || config?.searchEngines?.b
    return engine ? { key, name: engine.name, url: engine.url } : null
  }, [config])

  const resetAll = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    setQuery('')
    queryRef.current = ''
    setResults([])
    resultsRef.current = []
    setActiveEngine(null)
    setActiveIndex(0)
    currentHeightRef.current = INPUT_HEIGHT + EMPTY_HINT_HEIGHT
    window.electronAPI.resizeSearchWindow(INPUT_HEIGHT + EMPTY_HINT_HEIGHT)
  }, [])

  const persistApps = async (nextApps: AppItem[]) => {
    setApps(nextApps)
    await window.electronAPI.saveApps({ apps: nextApps })
  }

  const recordLaunch = async (app: SearchResult) => {
    if (app.id.startsWith('__')) return
    const nextApps = apps.map(item => item.id === app.id
      ? { ...item, launchCount: (item.launchCount || 0) + 1, lastOpenedAt: Date.now() }
      : item
    )
    await persistApps(nextApps)
  }

  const handleOpenItem = async (app: SearchResult) => {
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    if (app.type === 'action' && app.actionCommand) {
      await window.electronAPI.runQuickAction(app.actionCommand)
    } else if (app.type === 'folder') {
      await window.electronAPI.openFolder(app.path)
    } else if (app.type === 'steam') {
      await window.electronAPI.openSteam(app.path)
    } else {
      await window.electronAPI.openApp(app.path)
    }
    await recordLaunch(app)
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  const getCurrentResult = (): SearchResult | null => {
    return resultsRef.current[activeIndex] || resultsRef.current[0] || null
  }

  const hideCurrentResult = async () => {
    const app = getCurrentResult()
    if (!app || app.id.startsWith('__')) return
    const nextApps = apps.map(item => item.id === app.id ? { ...item, hidden: true } : item)
    await persistApps(nextApps)
    const nextResults = resultsRef.current.filter(item => item.id !== app.id)
    resultsRef.current = nextResults
    setResults(nextResults)
    setActiveIndex(index => Math.max(0, Math.min(index, nextResults.length - 1)))
    resizeWindow(nextResults.length, !!queryRef.current.trim())
  }

  const openCurrentContainingFolder = async () => {
    const app = getCurrentResult()
    if (!app || app.type === 'action') return
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    await window.electronAPI.openContainingFolder(app.path)
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  const openCurrentAsAdmin = async () => {
    const app = getCurrentResult()
    if (!app || app.type !== 'app') return
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    resetAll()
    await window.electronAPI.openAppAsAdmin(app.path)
    await recordLaunch(app)
    setTimeout(() => { isActiveRef.current = false }, 200)
  }

  const tryOpenPrefixedSearch = async (): Promise<boolean> => {
    const value = queryRef.current.trim()
    const [prefix, ...rest] = value.split(/\s+/)
    const term = rest.join(' ')
    if (!prefix || !term || !config?.searchEngines) return false
    const engineCheck = checkSearchEngine(`${prefix} `, config.searchEngines)
    if (!engineCheck.isEngine || !engineCheck.engine) return false
    isActiveRef.current = true
    window.electronAPI.hideSearchWindow()
    const url = engineCheck.engine.url + encodeURIComponent(term)
    resetAll()
    await window.electronAPI.openUrl(url)
    setTimeout(() => { isActiveRef.current = false }, 200)
    return true
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
      await handleOpenItem(app)
    } else if (queryRef.current.trim()) {
      if (await tryOpenPrefixedSearch()) return
      const engine = getDefaultSearchEngine()
      if (!engine) return
      isActiveRef.current = true
      window.electronAPI.hideSearchWindow()
      const url = engine.url + encodeURIComponent(queryRef.current.trim())
      resetAll()
      await window.electronAPI.openUrl(url)
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
        currentHeightRef.current = INPUT_HEIGHT + EMPTY_HINT_HEIGHT
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT + EMPTY_HINT_HEIGHT)
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
      currentHeightRef.current = INPUT_HEIGHT + EMPTY_HINT_HEIGHT
      window.electronAPI.resizeSearchWindow(INPUT_HEIGHT + EMPTY_HINT_HEIGHT)
      return
    }

    const filtered = filterApps(value)
    setResults(filtered)
    resultsRef.current = filtered
    const newIndex = 0
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
        currentHeightRef.current = INPUT_HEIGHT + EMPTY_HINT_HEIGHT
        window.electronAPI.resizeSearchWindow(INPUT_HEIGHT + EMPTY_HINT_HEIGHT)
      } else {
        window.electronAPI.hideSearchWindow()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.ctrlKey) {
        openCurrentContainingFolder()
      } else if (e.shiftKey) {
        openCurrentAsAdmin()
      } else {
        handleSearch()
      }
    } else if (e.key === 'Delete') {
      e.preventDefault()
      hideCurrentResult()
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
    <div className={`search-container theme-${config?.ui?.theme || 'aurora'}`}>
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
          onFocus={() => { /* isActiveRef intentionally NOT set here — only set on mousedown/open to allow blur-refocus */ }}
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
        <div className="search-results" ref={resultsContainerRef}>
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
      {!hasResults && !query.trim() && !activeEngine && (
        <div className="search-command-hints">
          <span>输入 <kbd>&gt;</kbd> 查看快捷命令</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 打开所在文件夹</span>
          <span><kbd>Delete</kbd> 隐藏结果</span>
        </div>
      )}
    </div>
  )
}

export default SearchApp
