import React from 'react'
import { parseCategoryIcon } from '../utils/categoryIcon'

interface CategoryIconProps {
  icon?: string | null
  size?: number
  className?: string
}

/**
 * 分类图标渲染：根据编码自动分派到 Emoji / 本地图片 / 网络图片 / 内联 SVG。
 * `image:` 段存的是 icons/ 下的文件名，需经主进程 get-icon-file-url 换成 file://。
 */
export function CategoryIcon({ icon, size = 20, className }: CategoryIconProps) {
  const parsed = parseCategoryIcon(icon)
  const [imageUrl, setImageUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    if (parsed.kind === 'image' && parsed.value) {
      window.electronAPI
        .getIconFileUrl(parsed.value)
        .then(url => { if (alive) setImageUrl(url) })
        .catch(() => { if (alive) setImageUrl(null) })
    } else {
      setImageUrl(null)
    }
    return () => { alive = false }
  }, [parsed.kind, parsed.value])

  if (parsed.kind === 'emoji') {
    if (!parsed.value) return null
    return (
      <span
        className={className}
        style={{ fontSize: Math.round(size * 0.92), lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        aria-hidden="true"
      >
        {parsed.value}
      </span>
    )
  }

  if (parsed.kind === 'image') {
    if (!imageUrl) {
      // 加载中 / 加载失败：占位方块，避免布局跳动
      return (
        <span
          className={className}
          style={{ width: size, height: size, display: 'inline-block', borderRadius: 4, background: 'rgba(120,120,140,0.18)' }}
          aria-hidden="true"
        />
      )
    }
    return (
      <img
        className={className}
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', borderRadius: 4 }}
      />
    )
  }

  // url / svg：值本身就是可直接用于 <img src> 的地址
  if (!parsed.value) return null
  return (
    <img
      className={className}
      src={parsed.value}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', borderRadius: 4 }}
    />
  )
}
