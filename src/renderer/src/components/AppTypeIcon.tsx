import {
  AppWindow,
  FolderSimple,
  GameController,
  Globe,
  NotePencil,
  Stack
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { AppItemType } from '../../../shared/types'

/**
 * 项目类型 → 图标。
 *
 * 单独抽出来是因为「类型图标」现在有四处消费：AddAppModal 的分段控件、
 * EditAppModal 的分段控件、AppCard 的图标兜底、以及组合成员列表。
 * 类型一多，散落的 `type === 'url' ? ... : type === 'note' ? ...` 三元链
 * 是最容易漏改的写法。
 *
 * 类型用 Phosphor 自己的 `Icon`：它内部是 ForwardRefExoticComponent，
 * 自己手写 `ComponentType<{size?: number; ...}>` 会因 `size` 允许 string 而报不兼容。
 */
export const APP_TYPE_ICONS: Record<AppItemType, Icon> = {
  app: AppWindow,
  folder: FolderSimple,
  url: Globe,
  steam: GameController,
  note: NotePencil,
  group: Stack
}

export function AppTypeIcon({ type, size = 16, weight = 'duotone', className }: {
  type: AppItemType
  size?: number
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  className?: string
}) {
  const Icon = APP_TYPE_ICONS[type] ?? AppWindow
  return <Icon size={size} weight={weight} className={className} aria-hidden="true" />
}
