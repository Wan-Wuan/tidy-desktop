type DroppedFileLike = { path?: string }

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
