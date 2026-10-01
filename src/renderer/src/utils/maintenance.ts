import type { AppItem, Category } from '../../../shared/types'

export function findEmptyCategories(apps: AppItem[], categories: Category[]): Category[] {
  const referencedCategoryIds = new Set(
    apps.map(app => app.categoryId).filter((id): id is string => !!id)
  )
  return categories.filter(category => !referencedCategoryIds.has(category.id))
}

export function filterStillEmptyCategories(candidates: Category[], apps: AppItem[]): Category[] {
  const referencedCategoryIds = new Set(
    apps.map(app => app.categoryId).filter((id): id is string => !!id)
  )
  return candidates.filter(category => !referencedCategoryIds.has(category.id))
}

export function deduplicateAppsByPath(apps: AppItem[]): { apps: AppItem[]; removedCount: number } {
  const seen = new Set<string>()
  const uniqueApps = apps.filter(app => {
    const key = app.path.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { apps: uniqueApps, removedCount: apps.length - uniqueApps.length }
}

export interface RelocationCandidate {
  id: string
  from: string
  to: string
}

function splitPathSegments(filePath: string): string[] {
  return filePath
    .replace(/[\\/]+/g, '\\')
    .split('\\')
    /* 每段各自 trim 再丢掉空段：`C:\Tools\\\a.exe` 与 `"  "` 都不该产出
       一个"名字是空格"的路径段，否则会拼出 `E:\Tools\   ` 这种鬼东西。 */
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)
}

function joinWindowsPath(parent: string, tail: string): string {
  return `${parent.replace(/[\\/]+$/, '')}\\${tail}`
}

/**
 * 失效路径批量重定位：为一批"路径已失效"的项目算出候选新路径。
 *
 * 场景：用户把 `D:\Tools` 整个搬到了 `E:\Backup\Tools`，里面所有项目的 path
 * 一起失效。逐个手改不现实，所以让用户**只选一次新父目录**，其余由这里换算。
 *
 * 换算规则：取这批失效路径的**公共目录前缀**（按 `\` 分段比较、忽略大小写），
 * 把它之后的部分当成相对尾部，拼到新父目录后面。
 *   · `D:\Tools\A\a.exe` + `D:\Tools\B\b.exe`，公共目录前缀 = `D:\Tools`
 *     → 选 `E:\Backup\Tools` 得到 `E:\Backup\Tools\A\a.exe`、`…\B\b.exe`
 *   · 只有一条失效项时，公共目录前缀就是它自己的目录，相对尾部 = 文件名
 *   · 这批路径**没有**公共目录（跨盘 / 跨根）时退化成"只按文件名找"——
 *     此时任何"相对结构"都是编出来的，不如给一个可预期的结果
 *
 * ⚠️ 这里**不判断新路径是否存在**：那必须回主进程 `validate-apps` 实测，
 * 渲染层拿不到文件系统。返回的是候选，不是结果。
 */
export function buildRelocationCandidates(
  apps: Array<{ id: string; path: string }>,
  newParent: string
): RelocationCandidate[] {
  const parent = newParent.trim()
  if (!parent) return []

  /* 空路径的项目拼不出相对尾部（拼出来会变成"新父目录本身"），直接排除；
     调用方会把它们归进"仍未找到"。 */
  const entries = apps
    .map(app => ({ id: app.id, from: app.path, segments: splitPathSegments(app.path) }))
    .filter(entry => entry.segments.length > 0)
  if (entries.length === 0) return []

  const firstDirs = entries[0].segments.slice(0, -1)
  let commonLength = firstDirs.length
  for (const entry of entries) {
    const dirs = entry.segments.slice(0, -1)
    let index = 0
    while (
      index < commonLength &&
      index < dirs.length &&
      dirs[index].toLowerCase() === firstDirs[index].toLowerCase()
    ) index++
    commonLength = index
  }

  return entries.map(entry => {
    const tail = commonLength > 0
      ? entry.segments.slice(commonLength).join('\\')
      : entry.segments[entry.segments.length - 1]
    return { id: entry.id, from: entry.from, to: joinWindowsPath(parent, tail) }
  })
}
