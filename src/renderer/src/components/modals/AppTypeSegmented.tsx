import React from 'react'
import type { AppItemType } from '../../../../shared/types'
import { APP_TYPE_LABELS, APP_TYPE_ORDER } from '../../utils/appTypes'
import { AppTypeIcon } from '../AppTypeIcon'

/**
 * 项目类型选择器。
 *
 * 从「一行 radio」改成图标 + 文字的分段控件：类型涨到 6 种之后，
 * 6 个 radio 横排会挤成两行还对齐不齐，而且 radio 的原点与文字之间
 * 没有可点击的边界感。
 *
 * 颜色一律走 `.app-type-segment` 这套语义类，**不写 `bg-white/NN`**——
 * 那类透明度类在深色 / 跟随系统主题下是逐个列举的黑名单，
 * 漏一个就变成「深色界面里一块刺眼白底」。
 */
export const AppTypeSegmented = React.memo(function AppTypeSegmented({ value, onChange }: {
  value: AppItemType
  onChange: (next: AppItemType) => void
}) {
  return (
    <div role="group" aria-label="项目类型" className="app-type-segmented grid grid-cols-3 gap-1">
      {APP_TYPE_ORDER.map(itemType => {
        const active = itemType === value
        return (
          <button
            key={itemType}
            type="button"
            aria-pressed={active}
            data-active={active ? 'true' : undefined}
            onClick={() => onChange(itemType)}
            className="app-type-segment focus-ring flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
          >
            <AppTypeIcon type={itemType} size={14} weight={active ? 'fill' : 'duotone'} />
            <span className="truncate">{APP_TYPE_LABELS[itemType]}</span>
          </button>
        )
      })}
    </div>
  )
})
