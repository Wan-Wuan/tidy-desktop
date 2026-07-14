import type { AppItem } from '../../../shared/types'

function belongsToCategory(app: AppItem, categoryId: string, subcategoryIds: Set<string>): boolean {
  return app.categoryId === categoryId || Boolean(app.subcategoryId && subcategoryIds.has(app.subcategoryId))
}

export function countCategoryApps(
  apps: AppItem[],
  categoryId: string,
  subcategoryIds: string[]
): number {
  const childIds = new Set(subcategoryIds)
  return apps.filter(app => belongsToCategory(app, categoryId, childIds)).length
}

export function removeCategoryFromApps(
  apps: AppItem[],
  categoryId: string,
  subcategoryIds: string[],
  keepApps: boolean
): AppItem[] {
  const childIds = new Set(subcategoryIds)
  if (!keepApps) {
    return apps.filter(app => !belongsToCategory(app, categoryId, childIds))
  }

  return apps.map(app => belongsToCategory(app, categoryId, childIds)
    ? { ...app, categoryId: null, subcategoryId: null }
    : app
  )
}

export function countSubcategoryApps(apps: AppItem[], subcategoryId: string): number {
  return apps.filter(app => app.subcategoryId === subcategoryId).length
}

export function removeSubcategoryFromApps(
  apps: AppItem[],
  subcategoryId: string,
  keepApps: boolean
): AppItem[] {
  if (!keepApps) {
    return apps.filter(app => app.subcategoryId !== subcategoryId)
  }

  return apps.map(app => app.subcategoryId === subcategoryId
    ? { ...app, categoryId: null, subcategoryId: null }
    : app
  )
}
