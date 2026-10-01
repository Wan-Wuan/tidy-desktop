import { ipcMain, type BrowserWindow } from 'electron'
import path from 'path'
import { CATEGORIES_FILE, CONFIG_DIR, readJsonFile } from '../config'
import { assertPath, assertSender } from '../ipcGuard'
import { sanitizeCategoriesData } from '../validation'
import {
  applyFolderOverrides,
  applyFolderSync,
  readFolderCache,
  scanFolder,
  writeFolderCache
} from '../folderSync'
import type { FolderSyncCacheFile } from '../folderSync'
import type { CategoriesData, FolderSyncSnapshot, FolderSyncUpdate } from '../../shared/types'

/**
 * 关联文件夹同步的 IPC 与三段式触发。
 *
 * 触发方式（对应计划 §5.1，刻意不用 `fs.watch`）：
 *  1. **定时轮询** —— 5 分钟一次，兜住"用户没动窗口但文件夹变了"；
 *  2. **窗口获得焦点** —— `index.ts` 在 main window 的 `focus` 事件里调 `notifyMainWindowFocused()`，
 *     带最小间隔防抖（alt-tab 很频繁，不能每次聚焦都扫盘），且**再延后一拍**（见该函数）；
 *  3. **手动刷新** —— 渲染层调 `sync-link-folder`。
 */

const FOLDER_CACHE_FILE = path.join(CONFIG_DIR, 'folderCache.json')
const FOLDER_SYNC_INTERVAL_MS = 5 * 60_000
/** 距上次成功同步不足这个时间就跳过——聚焦触发太频繁，别每次 alt-tab 都扫盘 */
const FOLDER_SYNC_MIN_GAP_MS = 30_000
/**
 * 「窗口获得焦点」到「真正开始扫盘」之间的延迟。
 *
 * 焦点事件是在 `win.show()` / `win.focus()` 之后立刻发出的，那一刻用户正盯着刚出来的
 * 窗口等它可用。哪怕扫盘已经是异步 IO，紧接着发起也会和渲染层启动时的
 * `get-config` / `get-apps` / `get-categories` 抢同一段主线程与磁盘带宽。
 * 推迟一拍再开始，让首帧和首批数据先落地。
 */
const FOCUS_RESYNC_DELAY_MS = 1_200

let cache: FolderSyncCacheFile | null = null
let mainWindowRef: { current: BrowserWindow | null } = { current: null }
let watcherHandle: NodeJS.Timeout | null = null
let focusResyncTimer: NodeJS.Timeout | null = null
let resyncInFlight = false

function loadCache(): FolderSyncCacheFile {
  if (!cache) cache = readFolderCache(FOLDER_CACHE_FILE)
  return cache
}

function persistCache(): void {
  if (cache) writeFolderCache(FOLDER_CACHE_FILE, cache)
}

interface SyncRequest {
  categoryId: string
  path: string
  includeSubdirs: boolean
  hiddenPaths: string[]
  order: string[]
  /** false 表示只重算"用户意图"（隐藏 / 排序），不碰磁盘 */
  rescan: boolean
}

function asPathList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const output: string[] = []
  for (const item of value.slice(0, limit)) {
    if (typeof item !== 'string') continue
    const entry = item.trim().slice(0, 4096)
    if (entry) output.push(entry)
  }
  return output
}

function sanitizeSyncRequest(input: unknown): SyncRequest | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const categoryId = typeof record.categoryId === 'string' ? record.categoryId.trim().slice(0, 160) : ''
  if (!categoryId) return null
  // mustExist: false —— 目录被删掉/改名时要能如实报告 missing，而不是静默拒绝
  const folderPath = assertPath(record.path, { mustExist: false })
  if (!folderPath) return null
  return {
    categoryId,
    path: folderPath,
    includeSubdirs: record.includeSubdirs !== false,
    hiddenPaths: asPathList(record.hiddenPaths, 500),
    order: asPathList(record.order, 500),
    rescan: record.rescan !== false
  }
}

/**
 * 同步单个文件夹。
 * 返回 `changed` 表示"内容相对上次真的变了"——只有变了才推事件，避免无谓地打扰渲染层。
 */
async function syncOneFolder(
  request: SyncRequest,
  now: number
): Promise<{ snapshot: FolderSyncSnapshot; changed: boolean }> {
  const store = loadCache()
  const existing = store.folders[request.categoryId]
  const overrides = { hiddenPaths: request.hiddenPaths, order: request.order }
  const meta = { path: request.path, includeSubdirs: request.includeSubdirs }

  // 只重算用户意图（隐藏 / 排序）时不扫盘，也不推进 lastSyncAt
  if (!request.rescan && existing) {
    const snapshot: FolderSyncSnapshot = {
      ...existing,
      ...meta,
      entries: applyFolderOverrides(existing.entries, overrides)
    }
    store.folders[request.categoryId] = snapshot
    return { snapshot, changed: false }
  }

  const scan = await scanFolder(request.path, { includeSubdirs: request.includeSubdirs })
  const result = applyFolderSync(existing, scan, overrides, now, meta)
  store.folders[request.categoryId] = result.snapshot
  return result
}

function notifyFolderSyncUpdated(categoryId: string, snapshot: FolderSyncSnapshot): void {
  const win = mainWindowRef.current
  if (!win || win.isDestroyed()) return
  const payload: FolderSyncUpdate = { categoryId, snapshot }
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('folder-sync-updated', payload)
  }
  // 启动阶段页面还没加载完，直接 send 会丢；用 did-finish-load 兜住
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/**
 * 重扫所有已绑定目录。
 * 分类的绑定信息从 categories.json 读——后台轮询时渲染层可能还没打开，
 * 不能依赖它把参数传过来。
 */
async function resyncAllFolders(): Promise<void> {
  if (resyncInFlight) return
  resyncInFlight = true
  try {
    const stored = readJsonFile<CategoriesData>(CATEGORIES_FILE, { categories: [], subcategories: [] })
    const safe = sanitizeCategoriesData(stored)
    if (!safe) return
    const now = Date.now()
    let dirty = false

    for (const category of safe.categories) {
      const link = category.linkFolder
      if (!link?.path) continue
      const lastSyncAt = loadCache().folders[category.id]?.lastSyncAt ?? 0
      if (now - lastSyncAt < FOLDER_SYNC_MIN_GAP_MS) continue

      const { snapshot, changed } = await syncOneFolder({
        categoryId: category.id,
        path: link.path,
        includeSubdirs: link.includeSubdirs !== false,
        hiddenPaths: link.hiddenPaths ?? [],
        order: link.order ?? [],
        rescan: true
      }, now)

      dirty = true
      if (changed) notifyFolderSyncUpdated(category.id, snapshot)
      // 分类多、目录又挂在慢盘上时，逐条 await 之间让出事件循环，
      // 别让连续几个目录的 IO 把这一轮拼成一次长阻塞
      await new Promise<void>(resolve => setImmediate(resolve))
    }

    if (dirty) persistCache()
  } catch {
    // 后台同步失败不该影响任何用户操作，下次轮询会重试
  } finally {
    resyncInFlight = false
  }
}

export function registerFolderSyncHandlers(mainRef: { current: BrowserWindow | null }): void {
  mainWindowRef = mainRef

  ipcMain.handle('sync-link-folder', async (event, payload: unknown): Promise<FolderSyncSnapshot | null> => {
    if (!assertSender(event)) return null
    const request = sanitizeSyncRequest(payload)
    if (!request) return null
    const { snapshot, changed } = await syncOneFolder(request, Date.now())
    persistCache()
    if (changed) notifyFolderSyncUpdated(request.categoryId, snapshot)
    return snapshot
  })

  /** 读缓存（不扫盘）。渲染层启动时用它把上次的同步结果先画出来，避免闪一下空白。 */
  ipcMain.handle('get-folder-sync-cache', (event) => {
    if (!assertSender(event)) return {}
    return loadCache().folders
  })
}

/** 定时轮询。由 `index.ts` 在 `app.on('ready')` 里启动一次。 */
export function startFolderSyncWatcher(): void {
  if (watcherHandle) return
  watcherHandle = setInterval(() => { void resyncAllFolders() }, FOLDER_SYNC_INTERVAL_MS)
  // 不因为这个定时器把进程钉住（关窗口=最小化到托盘，进程本来就不退，这里是双保险）
  watcherHandle.unref?.()
}

/**
 * 主窗口获得焦点时调用。
 *
 * 内部两道闸：先按 `FOCUS_RESYNC_DELAY_MS` 延后一拍（把扫盘挪出"窗口刚出现、用户正等它可用"
 * 的那一瞬间），再交给 `resyncAllFolders` 里的 30s 最小间隔防抖。
 * 反复 alt-tab 只会不断重置这个定时器，不会堆积扫盘任务。
 */
export function notifyMainWindowFocused(): void {
  if (focusResyncTimer) clearTimeout(focusResyncTimer)
  focusResyncTimer = setTimeout(() => {
    focusResyncTimer = null
    void resyncAllFolders()
  }, FOCUS_RESYNC_DELAY_MS)
  focusResyncTimer.unref?.()
}
