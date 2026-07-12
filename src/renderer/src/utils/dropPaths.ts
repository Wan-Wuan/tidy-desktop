type DroppedFileLike = { path?: string }

export function normalizeDroppedPath(value: string): string {
  return value.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

export function buildShortcutTargetMap(
  resolved: Array<{ filePath: string; targetPath: string }>
): Map<string, string> {
  return new Map(resolved.map(item => [normalizeDroppedPath(item.filePath), normalizeDroppedPath(item.targetPath)]))
}

export function getDroppedPathIdentities(filePath: string, shortcutTargets: Map<string, string>): string[] {
  const pathKey = normalizeDroppedPath(filePath)
  const targetKey = shortcutTargets.get(pathKey)
  return targetKey && targetKey !== pathKey ? [pathKey, targetKey] : [pathKey]
}

function fromFileUri(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return null

    const filePath = decodeURIComponent(url.pathname)
    if (!filePath) return null
    return filePath.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
  } catch {
    return null
  }
}

export function getDroppedPaths(files: DroppedFileLike[], uriList: string, plainText: string): string[] {
  const paths = new Set(files.map(file => file.path).filter((filePath): filePath is string => Boolean(filePath)))

  for (const candidate of [uriList, plainText]) {
    for (const value of candidate.split(/\r?\n/).map(entry => entry.trim())) {
      if (!value || value.startsWith('#')) continue
      const fromUri = fromFileUri(value)
      if (fromUri) paths.add(fromUri)
      else if (/^[a-zA-Z]:\\/.test(value) || value.startsWith('\\\\')) paths.add(value)
    }
  }

  return [...paths]
}
