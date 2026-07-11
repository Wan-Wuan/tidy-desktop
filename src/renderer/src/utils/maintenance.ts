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
