// @vitest-environment jsdom
/* 「关联文件夹同步出来的条目能不能在搜索框里搜到」。
   这条链路此前**一个测试都没穿过**：主窗口的 useFolderSync 与搜索窗是两个文档，
   搜索窗自己 loadData 时只拿 apps.json，同步项根本不在里面——
   表现就是"主界面看得到、搜索框搜不到"，而两边的单测都过。
   所以这里必须走真实渲染（SearchApp），不能只测 flattenSyncedApps 这个纯函数。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import SearchApp from './SearchApp'
import type { AppItem, Category, Config, FolderSyncSnapshot } from '../../shared/types'

const categories: Category[] = [
  {
    id: 'cat-doc',
    name: '资料',
    icon: '📁',
    order: 0,
    linkFolder: { path: 'C:\\Docs', includeSubdirs: false, lastSyncAt: 1, hiddenPaths: [], order: [] }
  },
  {
    id: 'cat-hidden',
    name: '已隐藏',
    icon: '📁',
    order: 1,
    linkFolder: { path: 'C:\\Hidden', includeSubdirs: false, lastSyncAt: 1, hiddenPaths: ['C:\\Hidden\\secret.txt'], order: [] }
  },
  {
    id: 'cat-error',
    name: '掉线的目录',
    icon: '📁',
    order: 2,
    linkFolder: { path: 'Z:\\Gone', includeSubdirs: false, lastSyncAt: 1, hiddenPaths: [], order: [] }
  }
]

const snapshots: Record<string, FolderSyncSnapshot> = {
  'cat-doc': {
    path: 'C:\\Docs',
    includeSubdirs: false,
    lastSyncAt: 1,
    error: null,
    truncated: false,
    entries: [
      { name: '季度报告.docx', path: 'C:\\Docs\\季度报告.docx', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 },
      { name: '素材', path: 'C:\\Docs\\素材', type: 'folder', depth: 1, firstSeenAt: 1, hidden: false, order: 1 }
    ]
  },
  'cat-hidden': {
    path: 'C:\\Hidden',
    includeSubdirs: false,
    lastSyncAt: 1,
    error: null,
    truncated: false,
    entries: [
      { name: 'secret.txt', path: 'C:\\Hidden\\secret.txt', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 }
    ]
  },
  'cat-error': {
    path: 'Z:\\Gone',
    includeSubdirs: false,
    lastSyncAt: 1,
    error: 'missing',
    truncated: false,
    entries: [
      { name: '幽灵文件.txt', path: 'Z:\\Gone\\幽灵文件.txt', type: 'app', depth: 1, firstSeenAt: 1, hidden: false, order: 0 }
    ]
  }
}

const manualApps: AppItem[] = [
  {
    id: 'app-manual',
    name: '手工项目',
    path: 'C:\\Apps\\manual.exe',
    icon: '',
    categoryId: null,
    subcategoryId: null,
    pinyin: '',
    firstLetter: '',
    type: 'app'
  }
]

const config = {
  ui: {},
  quickActions: [],
  searchEngines: {}
} as unknown as Config

function installApi() {
  const openFolder = vi.fn(async () => true)
  const openApp = vi.fn(async () => true)
  const hideSearchWindow = vi.fn(async () => {})
  /* loadData 里**最后**一个 await 就是它，等它被调用过就说明数据已就位 */
  const getFolderSyncCache = vi.fn(async () => snapshots)
  const overrides: Record<string, unknown> = {
    getConfig: async () => config,
    getApps: async () => ({ apps: manualApps }),
    getCategories: async () => ({ categories, subcategories: [] }),
    getFolderSyncCache,
    searchFiles: async () => ({ results: [], source: 'none' as const, port: 0 }),
    resizeSearchWindow: () => {},
    openFolder,
    openApp,
    hideSearchWindow,
    onBlur: () => () => {},
    onResetSearch: () => () => {},
    onAppsUpdated: () => () => {}
  }
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: new Proxy(overrides, {
      get(target, prop: string) {
        if (prop in target) return target[prop as keyof typeof target]
        return () => Promise.resolve(undefined)
      },
      has: () => true
    })
  })
  return { openFolder, openApp, hideSearchWindow, getFolderSyncCache }
}

beforeEach(() => {
  cleanup()
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterEach(() => cleanup())

/** 输入框本身没有可访问名，靠占位符定位 */
const input = () => screen.getByPlaceholderText('搜索应用或文件夹…')

/**
 * 挂载并等数据到位。
 * ⚠️ 不能渲染完立刻 fireEvent.change：loadData 是异步的，那一刻 `apps` 还是空数组，
 * 过滤必然返回空——测试会以"搜不到"的形式假失败，看着像功能没做。
 */
async function renderReady(api: ReturnType<typeof installApi>) {
  render(<SearchApp />)
  await waitFor(() => expect(api.getFolderSyncCache).toHaveBeenCalled())
}

/** 输入并等结果渲染出来 */
async function searchFor(value: string) {
  fireEvent.change(input(), { target: { value } })
}

describe('搜索窗能搜到关联文件夹里的条目', () => {
  it('手工项目与同步条目一起出现在结果里', async () => {
    const api = installApi()
    await renderReady(api)
    await searchFor('报告')
    await waitFor(() => expect(screen.getByText('季度报告.docx')).toBeInTheDocument())
    await searchFor('手工')
    await waitFor(() => expect(screen.getByText('手工项目')).toBeInTheDocument())
  })

  it('同步条目按真实类型走启动分派：目录走 openFolder，文件走 openApp', async () => {
    const api = installApi()
    await renderReady(api)

    await searchFor('素材')
    await waitFor(() => expect(screen.getByText('素材')).toBeInTheDocument())
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() => expect(api.openFolder).toHaveBeenCalledWith('C:\\Docs\\素材'))

    await searchFor('季度报告')
    await waitFor(() => expect(screen.getByText('季度报告.docx')).toBeInTheDocument())
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() => expect(api.openApp).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:\\Docs\\季度报告.docx' })
    ))
  })

  it('写进 hiddenPaths 的条目搜不到（用户意图必须生效）', async () => {
    const api = installApi()
    await renderReady(api)
    await searchFor('secret')
    // 给文件搜索的防抖留出时间，确认不是"还没算完"造成的假阴性
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(screen.queryByText('secret.txt')).toBeNull()
  })

  it('扫描失败的分类不参与搜索——不能把读不到的旧内容当成现状', async () => {
    const api = installApi()
    await renderReady(api)
    await searchFor('幽灵')
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(screen.queryByText('幽灵文件.txt')).toBeNull()
  })

  it('主进程读不到同步缓存（旧版 preload）时，手工项目照常能搜', async () => {
    const api = installApi()
    ;(window.electronAPI as unknown as Record<string, unknown>).getFolderSyncCache = async () => {
      throw new Error('no such channel')
    }
    render(<SearchApp />)
    await waitFor(() => expect(input()).toBeInTheDocument())
    await new Promise(resolve => setTimeout(resolve, 30))
    await searchFor('手工')
    await waitFor(() => expect(screen.getByText('手工项目')).toBeInTheDocument())
    expect(api.openFolder).not.toHaveBeenCalled()
  })
})
