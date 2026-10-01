import path from 'path'
import type { FileSearchResult } from '../shared/types'

/**
 * 本机文件搜索的 Everything 客户端。
 *
 * 本模块只做两件事：**解析 Everything 的 JSON** 与 **访问 Everything 的 HTTP 接口**。
 * 一律是纯函数或单次网络请求，便于单测（见 fileSearch.test.ts / fileSearch.everything.test.ts）。
 *
 * ⚠️ 这里**没有内置索引**：以前那套「递归扫用户配置的搜索目录 + 落盘 fileIndex.json」
 * 已整体移除（Everything 覆盖全盘、更快，维护两套检索源只会互相打架）。
 * 端口来源见 `everythingDetect.ts`。
 */

/** 按「完整路径」去重（Windows 大小写不敏感）。
 *  同名文件位于不同磁盘 / 不同目录时必须全部保留——它们路径不同，是彼此独立的命中项；
 *  只有路径完全相同才算重复。绝不能按文件名去重，否则多磁盘场景会丢结果。 */
export function dedupeByPath(items: FileSearchResult[]): FileSearchResult[] {
  const seen = new Set<string>()
  const out: FileSearchResult[] = []
  for (const item of items) {
    const key = item.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

const FILE_ATTRIBUTE_DIRECTORY = 0x10

/**
 * 归一化 Everything 的单条结果。
 *
 * ⚠️ Everything 的 JSON 语义（官方 HTTP 文档 + 实测）：
 *   · `name` = 文件名；`path` = **所在目录**，不是完整路径。完整路径 = `path` + `name`。
 *     把 `path` 当完整路径会连带两个问题：
 *       ① 界面显示的是目录、`open-path` 打开的是目录而不是文件；
 *       ② 渲染层用 `__file_${path}` 当 React key，于是**同一目录下的多个命中项 key 完全相同**，
 *          React 按 key 复用节点 → 整批结果互相覆盖（"同名文件 / 同名文件夹漏显、冲突"的根源）。
 *   · 目录判定：`type === 'folder'`，或 `attributes` 含 0x10 位。
 *     ⚠️ `attributes` 只有在请求里显式带 `attributes_column=1` 时才会返回（见 searchEverything）。
 *   · 兼容个别把完整路径放进 `path` 的情况：`basename(path)` 与 `name` 相同则直接采用 `path`。
 */
function normalizeEverythingRow(r: Record<string, unknown>): FileSearchResult | null {
  const rawPath = typeof r.path === 'string' ? r.path.trim() : ''
  const rawName = typeof r.name === 'string' ? r.name : ''
  // 没有 path 就无法定位 / 打开文件，直接丢弃（只有 name 的结果无法用）
  if (!rawPath) return null
  const name = rawName || path.basename(rawPath)
  const fullPath =
    name && path.basename(rawPath).toLowerCase() === name.toLowerCase()
      ? rawPath
      : path.join(rawPath, name)

  const type = typeof r.type === 'string' ? r.type.toLowerCase() : ''
  const attributes = typeof r.attributes === 'number' ? r.attributes : undefined
  const isDir =
    type === 'folder' || type === 'dir' ||
    (attributes !== undefined ? (attributes & FILE_ATTRIBUTE_DIRECTORY) !== 0 : false)

  return {
    name: name || path.basename(fullPath),
    path: fullPath,
    isDir,
    size: typeof r.size === 'number' ? r.size : undefined
  }
}

/**
 * 解析 Everything HTTP 接口返回的 JSON。
 *
 * Everything 两种形态都兼容：直接数组，或 `{ results: [...] }`。
 * 结果按完整路径去重，保证"同名文件 / 同名文件夹"只要路径不同就都保留。
 * 抽成纯函数便于单测，不下网。
 */
export function parseEverythingJson(data: unknown): FileSearchResult[] {
  const rows: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { results?: unknown[] })?.results)
      ? (data as { results: unknown[] }).results
      : []
  const out: FileSearchResult[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const parsed = normalizeEverythingRow(row as Record<string, unknown>)
    if (parsed) out.push(parsed)
  }
  return dedupeByPath(out)
}

/** Everything HTTP 的可选 Basic Auth 凭据（Everything 里设了用户名/密码时才需要）。 */
export interface EverythingAuth {
  username?: string
  password?: string
}

function authHeaders(auth?: EverythingAuth): Record<string, string> {
  if (!auth?.username) return {}
  const token = Buffer.from(`${auth.username}:${auth.password ?? ''}`, 'utf-8').toString('base64')
  return { Authorization: `Basic ${token}` }
}

/** 探测 Everything 的 HTTP 接口是否可达（短超时，探测不到一律算不可用）。 */
export async function isEverythingReachable(
  port: number,
  timeoutMs = 400,
  auth?: EverythingAuth
): Promise<boolean> {
  if (!port || port <= 0 || port > 65535) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/?search=&json=1&count=1`, {
      signal: controller.signal,
      headers: authHeaders(auth)
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 探测某端口上跑的**是不是 Everything**：真发一次 json 查询并校验返回结构。
 *
 * 与 `isEverythingReachable`（只看 res.ok）的区别：这里会检查响应是不是
 * 数组 / `{ results: [...] }`，避免把恰好占用该端口的其它 HTTP 服务误判成 Everything
 * ——候选端口兜底探测（见 everythingDetect 的 candidatePorts）需要这层身份校验。
 */
export async function probeEverything(
  port: number,
  timeoutMs = 400,
  auth?: EverythingAuth
): Promise<boolean> {
  if (!port || port <= 0 || port > 65535) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/?search=&json=1&count=1`, {
      signal: controller.signal,
      headers: authHeaders(auth)
    })
    if (!res.ok) return false
    const data: unknown = await res.json()
    return Array.isArray(data) || Array.isArray((data as { results?: unknown[] })?.results)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Everything JSON 接口的固定列开关。
 *
 * ⚠️ 官方文档：`path_column` / `size_column` / `attributes_column` 默认都是 0，
 * **不显式请求就完全不返回这些字段**。只发 `json=1` 时响应里没有 `path`，
 * `parseEverythingJson` 会把每一条结果都当"无路径"丢掉 → 搜索永远返回空。
 * `sort=name` + `ascending=1` 让多磁盘的同名文件按名称稳定排列。
 */
const EVERYTHING_JSON_COLUMNS: Record<string, string> = {
  json: '1',
  path_column: '1',
  size_column: '1',
  attributes_column: '1',
  sort: 'name',
  ascending: '1',
  offset: '0'
}

/** Everything HTTP 检索的可选项。 */
export interface SearchEverythingOptions {
  timeoutMs?: number
  auth?: EverythingAuth
}

/**
 * 通过 Everything HTTP 接口检索。
 * 请求失败 / 返回非 2xx（如未带对凭据的 401）时抛错，由调用方决定如何呈现。
 * `count` 用调用方给的 limit（Everything 默认近乎不限量，这里限幅以避免超大响应）。
 */
export async function searchEverything(
  port: number,
  query: string,
  limit: number,
  options: SearchEverythingOptions = {}
): Promise<FileSearchResult[]> {
  const timeoutMs = options.timeoutMs ?? 3000
  const count = Math.max(1, limit)
  const params = new URLSearchParams({
    search: query,
    ...EVERYTHING_JSON_COLUMNS,
    count: String(count)
  })
  const url = `http://127.0.0.1:${port}/?${params.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: authHeaders(options.auth) })
    if (!res.ok) throw new Error(`Everything HTTP ${res.status}`)
    const data = await res.json()
    return parseEverythingJson(data).slice(0, count)
  } finally {
    clearTimeout(timer)
  }
}
