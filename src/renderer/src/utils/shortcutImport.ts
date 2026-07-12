import type { AppItem, ShortcutImportItem } from '../../../shared/types'

function normalizePath(value: string): string {
  return value.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

export function filterNewShortcutItems(
  items: ShortcutImportItem[],
  apps: AppItem[]
): ShortcutImportItem[] {
  const knownPaths = new Set(apps.map(app => normalizePath(app.path)).filter(Boolean))
  const importable: ShortcutImportItem[] = []

  for (const item of items) {
    if (!item.targetPath) continue
    const identities = [item.path, item.targetPath].map(normalizePath).filter(Boolean)
    if (identities.some(identity => knownPaths.has(identity))) continue

    importable.push(item)
    for (const identity of identities) knownPaths.add(identity)
  }

  return importable
}
