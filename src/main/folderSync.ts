import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { ALL_FILE_EXTS_SET } from '../shared/utils'
import type { CategoryLinkFolder, FolderSyncEntry, FolderSyncError, FolderSyncSnapshot } from '../shared/types'

/**
 * 关联文件夹同步。
 *
 * 设计要点（对应计划 §5.1）：
 *  - **不用 `fs.watch`**：Windows 上不可靠、网络盘不支持、批量解压时会连发上百个事件。
 *    改为「定时轮询 + 窗口获得焦点时同步 + 手动刷新」三段式，由 handler 层驱动。
 *  - **扫描结果不进 `apps.json`**：它是可再生的缓存，混进用户数据会让"手动整理过的列表"
 *    和"跟着文件夹变的内容"互相覆盖。结果只驻留内存 + 一个 `folderCache.json`。
 *  - **用户意图（隐藏 / 排序）跟分类走**（`CategoryLinkFolder.hiddenPaths` / `order`），
 *    那是不可再生的，丢了就是丢了。
 *
 * 本文件不 import electron（config.ts 顶层读 `app`，会连带把测试拖下水），
 * 缓存文件路径由调用方传进来。
 */

/** 递归深度上限：根目录的直属子项算第 1 层 */
export const MAX_FOLDER_DEPTH = 3
/** 单次扫描的条目上限 */
export const MAX_FOLDER_ENTRIES = 500

/** 扫描阶段的条目：还没有合并出 firstSeenAt / hidden / order */
export interface FolderScanEntry {
  name: string
  path: string
  type: 'app' | 'folder'
  depth: number
}

export interface FolderScanResult {
  ok: boolean
  error: FolderSyncError | null
  entries: FolderScanEntry[]
  /** 触到深度或数量上限——界面要如实提示"只显示了一部分" */
  truncated: boolean
}

export interface FolderSyncDiff {
  added: string[]
  removed: string[]
  kept: number
}

/** 系统自己生成的噪音文件，同步进来毫无意义 */
const IGNORED_NAMES = new Set(['desktop.ini', 'thumbs.db', '.ds_store', 'iconcache.db'])

function shouldSkipName(name: string): boolean {
  const lower = name.toLowerCase()
  return name.startsWith('.') || IGNORED_NAMES.has(lower)
}

/**
 * 扫描一个目录。
 *
 * 只收「目录」和「扩展名在白名单里的文件」——白名单就是 `shared/utils.ts` 里
 * 拖入添加用的那一份，规则一致才符合直觉：**能在文件夹同步里出现的，就是你拖得进来的那些**。
 * 否则一个放着 README.txt、license.dat 的目录会同步出一堆点不开的条目。
 *
 * ⚠️ **必须异步**：本函数跑在主进程里，而它的触发点之一是「主窗口获得焦点」。
 * 早先用的是 `fs.statSync` / `fs.readdirSync`，于是整个函数体是**一段不可中断的同步代码**
 * ——主进程事件循环被按死，渲染层此刻发的任何 IPC（`get-apps`、`get-config`…）
 * 都得排队等它跑完。本机 NTFS 上一两个目录只要几十毫秒，但关联到离线网络盘 /
 * 休眠外置盘时能拖到秒级，用户看到的就是「按热键唤出，界面出来但一片空白、点不动」。
 *
 * 改成 `fs.promises.*` 之后每个目录读盘都会让出事件循环，IPC 正常响应；
 * 递归仍然是**串行 await**（不用 `Promise.all`）——条目顺序是 diff 的输入，
 * 并行会让 `entries` 的排列变得不确定，把「顺序没变」误判成「内容变了」。
 */
export async function scanFolder(
  root: string,
  options: { includeSubdirs?: boolean; maxDepth?: number; maxEntries?: number } = {}
): Promise<FolderScanResult> {
  const includeSubdirs = options.includeSubdirs !== false
  const maxDepth = options.maxDepth ?? MAX_FOLDER_DEPTH
  const maxEntries = options.maxEntries ?? MAX_FOLDER_ENTRIES

  let rootStat: fs.Stats
  try {
    rootStat = await fsp.stat(root)
  } catch {
    return { ok: false, error: 'missing', entries: [], truncated: false }
  }
  if (!rootStat.isDirectory()) {
    return { ok: false, error: 'not-a-directory', entries: [], truncated: false }
  }

  const entries: FolderScanEntry[] = []
  let truncated = false

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (truncated || entries.length >= maxEntries) {
      truncated = true
      return
    }
    let dirents: fs.Dirent[]
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true })
    } catch (error) {
      // 只有根目录读不到才算整个同步失败；子目录读不到就跳过它，不牵连其它内容
      if (depth === 1) {
        const code = (error as NodeJS.ErrnoException)?.code
        throw Object.assign(new Error('read-failed'), {
          folderSyncError: code === 'EPERM' || code === 'EACCES' ? 'permission-denied' : 'read-failed'
        })
      }
      return
    }

    // 目录在前、同类按名字排，保证两次扫描顺序稳定（否则 diff 全是"变化"）
    const sorted = [...dirents].sort((a, b) => {
      const aDir = a.isDirectory() ? 0 : 1
      const bDir = b.isDirectory() ? 0 : 1
      if (aDir !== bDir) return aDir - bDir
      return a.name.localeCompare(b.name, 'zh-CN')
    })

    for (const dirent of sorted) {
      if (entries.length >= maxEntries) {
        truncated = true
        return
      }
      const name = dirent.name
      if (shouldSkipName(name)) continue
      const fullPath = path.join(dir, name)

      if (dirent.isDirectory()) {
        entries.push({ name, path: fullPath, type: 'folder', depth })
        if (includeSubdirs) {
          if (depth < maxDepth) await walk(fullPath, depth + 1)
          // 到深度上限了：里面还有没有内容我们没看，保守地标记为"已截断"
          else truncated = true
        }
        continue
      }
      if (!dirent.isFile()) continue
      if (!ALL_FILE_EXTS_SET.has(path.extname(name).toLowerCase())) continue
      entries.push({ name, path: fullPath, type: 'app', depth })
    }
  }

  try {
    await walk(root, 1)
  } catch (error) {
    const code = (error as { folderSyncError?: FolderSyncError })?.folderSyncError
    return { ok: false, error: code ?? 'read-failed', entries: [], truncated: false }
  }

  return { ok: true, error: null, entries, truncated }
}

/**
 * 把扫描结果与上一次的结果合并。
 *
 * 需要保住两样东西：
 *  1. `firstSeenAt` —— 上一次就存在的条目沿用旧时间戳，只有真正新增的才用 `now`；
 *  2. 用户意图 —— `hidden` / `order` 按路径从 `linkFolder` 里取回。
 * 排序规则：有自定义顺序的按顺序排，其余按扫描顺序（目录在前、名字升序）排在其后。
 */
export function mergeFolderEntries(
  scan: FolderScanEntry[],
  previous: FolderSyncEntry[],
  linkFolder: Pick<CategoryLinkFolder, 'hiddenPaths' | 'order'> | null | undefined,
  now: number
): FolderSyncEntry[] {
  const previousByPath = new Map(previous.map(entry => [entry.path, entry]))
  const merged: FolderSyncEntry[] = scan.map(entry => ({
    ...entry,
    // 上一次就存在的条目沿用旧时间戳，只有真正新增的才用 now
    firstSeenAt: previousByPath.get(entry.path)?.firstSeenAt ?? now,
    hidden: false,
    order: Number.MAX_SAFE_INTEGER
  }))
  // 隐藏与排序的规则只写在 applyFolderOverrides 里一处，这里直接复用
  return applyFolderOverrides(merged, linkFolder ?? {})
}

/** 对比两次结果，给出新增/移除/保留。用来决定要不要发"文件夹内容有变化"的提示。 */
export function diffFolderEntries(previous: FolderSyncEntry[], next: FolderSyncEntry[]): FolderSyncDiff {
  const previousPaths = new Set(previous.map(entry => entry.path))
  const nextPaths = new Set(next.map(entry => entry.path))
  const added = next.filter(entry => !previousPaths.has(entry.path)).map(entry => entry.path)
  const removed = previous.filter(entry => !nextPaths.has(entry.path)).map(entry => entry.path)
  return { added, removed, kept: next.length - added.length }
}

type FolderOverrides = Pick<CategoryLinkFolder, 'hiddenPaths' | 'order'>

/** 只重算用户意图（隐藏 / 排序），不动条目本身。用于「隐藏一项」这种不扫盘的即时反馈。 */
export function applyFolderOverrides(entries: FolderSyncEntry[], overrides: FolderOverrides): FolderSyncEntry[] {
  const hiddenPaths = new Set((overrides.hiddenPaths ?? []).map(item => item.toLowerCase()))
  const orderIndex = new Map((overrides.order ?? []).map((item, index) => [item.toLowerCase(), index]))
  const next = entries.map(entry => ({
    ...entry,
    hidden: hiddenPaths.has(entry.path.toLowerCase()),
    order: orderIndex.get(entry.path.toLowerCase()) ?? Number.MAX_SAFE_INTEGER
  }))
  return next.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    const aDir = a.type === 'folder' ? 0 : 1
    const bDir = b.type === 'folder' ? 0 : 1
    if (aDir !== bDir) return aDir - bDir
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

/**
 * 把一次扫描结果落地成快照。
 *
 * ⚠️ 关键不变量：**扫描失败时保留上一次的条目，且不推进 `lastSyncAt`**。
 *  - 保留条目：目录被临时改名 / 网络盘掉线时，用户看到的应该是"目录不见了"的提示
 *    加上原来的内容，而不是一片空白（那会让人以为条目被删了）。
 *  - 不推进时间：否则 30s 最小间隔会把"插回 U 盘后立刻重试"也一并挡掉。
 */
export function applyFolderSync(
  previous: FolderSyncSnapshot | undefined,
  scan: FolderScanResult,
  overrides: FolderOverrides,
  now: number,
  meta: { path: string; includeSubdirs: boolean }
): { snapshot: FolderSyncSnapshot; changed: boolean } {
  if (!scan.ok) {
    return {
      snapshot: {
        path: meta.path,
        includeSubdirs: meta.includeSubdirs,
        lastSyncAt: previous?.lastSyncAt ?? 0,
        error: scan.error,
        truncated: false,
        entries: previous?.entries ?? []
      },
      changed: false
    }
  }

  const previousEntries = previous?.entries ?? []
  const entries = mergeFolderEntries(scan.entries, previousEntries, overrides, now)
  const diff = diffFolderEntries(previousEntries, entries)
  return {
    snapshot: {
      path: meta.path,
      includeSubdirs: meta.includeSubdirs,
      lastSyncAt: now,
      error: null,
      truncated: scan.truncated,
      entries
    },
    changed: diff.added.length > 0 || diff.removed.length > 0
  }
}

/* ------------------------------------------------------------------ 缓存文件 */

export interface FolderSyncCacheFile {
  version: number
  /** key = 分类 id */
  folders: Record<string, FolderSyncSnapshot>
}

export const FOLDER_CACHE_VERSION = 1

export function emptyFolderCache(): FolderSyncCacheFile {
  return { version: FOLDER_CACHE_VERSION, folders: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeEntry(input: unknown): FolderSyncEntry | null {
  if (!isRecord(input)) return null
  const entryPath = typeof input.path === 'string' ? input.path.slice(0, 4096) : ''
  const name = typeof input.name === 'string' ? input.name.slice(0, 300) : ''
  if (!entryPath || !name) return null
  return {
    name,
    path: entryPath,
    type: input.type === 'folder' ? 'folder' : 'app',
    depth: Number.isFinite(input.depth) ? Math.min(MAX_FOLDER_DEPTH, Math.max(1, Math.trunc(input.depth as number))) : 1,
    firstSeenAt: Number.isFinite(input.firstSeenAt) ? Math.trunc(input.firstSeenAt as number) : 0,
    hidden: input.hidden === true,
    order: Number.isFinite(input.order) ? Math.trunc(input.order as number) : Number.MAX_SAFE_INTEGER
  }
}

/** 缓存文件是"可以随时丢"的，所以这里只做形状校验，坏数据一律丢弃而不是抛错。 */
export function sanitizeFolderCache(input: unknown): FolderSyncCacheFile {
  const cache = emptyFolderCache()
  if (!isRecord(input) || !isRecord(input.folders)) return cache

  for (const [categoryId, raw] of Object.entries(input.folders)) {
    if (!isRecord(raw)) continue
    const folderPath = typeof raw.path === 'string' ? raw.path.slice(0, 4096) : ''
    if (!folderPath) continue
    const entries = Array.isArray(raw.entries)
      ? raw.entries.slice(0, MAX_FOLDER_ENTRIES).map(sanitizeEntry).filter((item): item is FolderSyncEntry => !!item)
      : []
    cache.folders[categoryId.slice(0, 160)] = {
      path: folderPath,
      includeSubdirs: raw.includeSubdirs !== false,
      lastSyncAt: Number.isFinite(raw.lastSyncAt) ? Math.trunc(raw.lastSyncAt as number) : 0,
      error: typeof raw.error === 'string' ? raw.error as FolderSyncError : null,
      truncated: raw.truncated === true,
      entries
    }
  }
  return cache
}

export function readFolderCache(cachePath: string): FolderSyncCacheFile {
  try {
    if (!fs.existsSync(cachePath)) return emptyFolderCache()
    return sanitizeFolderCache(JSON.parse(fs.readFileSync(cachePath, 'utf-8')))
  } catch {
    // 缓存坏了不值得报错，直接当空的——反正下一次同步就会重建
    return emptyFolderCache()
  }
}

export function writeFolderCache(cachePath: string, cache: FolderSyncCacheFile): boolean {
  try {
    const dir = path.dirname(cachePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}
