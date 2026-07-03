import type { AppItem, Category } from '../../../../shared/types'

export interface IconRefreshProgress {
  done: number
  total: number
  success: number
  failed: number
  current?: string
  failures: string[]
}

export interface HealthReport {
  total: number
  invalidPaths: AppItem[]
  missingIcons: AppItem[]
  duplicatePaths: AppItem[]
  emptyCategories: Category[]
  hiddenCount: number
}
