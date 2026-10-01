import React, { useRef, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { EMOJI_LIST } from './modals/constants'
import { parseCategoryIcon, encodeCategoryIcon, svgToDataUrl, isHttpImageUrl } from '../utils/categoryIcon'
import type { CategoryIconKind } from '../../../shared/types'

/**
 * 分类图标编辑器：支持四种来源（Emoji / 本地图片 / 网络图片 / 内联 SVG）。
 * 受控组件，父级只需持有 `icon`（编码串）并通过 onChange 接收新的编码串。
 *
 *  - emoji：直接存字符（不加前缀，保持历史兼容）
 *  - image：选本地文件 → 经 save-image-to-icon-cache 复制进 icons/ → 存 `image:<文件名>`
 *  - url：校验 http(s) 后存 `url:<地址>`
 *  - svg：把 SVG 文本转成 data url 后存 `svg:<data url>`（避免注入）
 */
export function CategoryIconPicker({ icon, onChange }: { icon: string; onChange: (icon: string) => void }) {
  const parsed = parseCategoryIcon(icon)
  const [mode, setMode] = useState<CategoryIconKind>(parsed.kind)
  const [urlDraft, setUrlDraft] = useState(parsed.kind === 'url' ? parsed.value : '')
  const [svgDraft, setSvgDraft] = useState(parsed.kind === 'svg' ? parsed.value : '')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [svgError, setSvgError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const commitEmoji = (emoji: string) => {
    setMode('emoji')
    onChange(encodeCategoryIcon('emoji', emoji))
  }

  const commitImage = async (filePath: string) => {
    setUploading(true)
    try {
      const fileName = await window.electronAPI.saveImageToIconCache(filePath)
      if (!fileName) {
        setUrlError('图片保存失败，请换一张（支持 PNG/JPG/WebP/SVG 等，≤5MB）')
        return
      }
      setMode('image')
      onChange(encodeCategoryIcon('image', fileName))
    } catch {
      setUrlError('图片保存失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  const commitUrl = () => {
    const v = urlDraft.trim()
    if (!v) {
      setUrlError(null)
      setMode('emoji')
      onChange('')
      return
    }
    if (!isHttpImageUrl(v)) {
      setUrlError('请输入以 http:// 或 https:// 开头的图片地址')
      return
    }
    setUrlError(null)
    setMode('url')
    onChange(encodeCategoryIcon('url', v))
  }

  const commitSvg = () => {
    const v = svgDraft.trim()
    if (!v) {
      setSvgError(null)
      setMode('emoji')
      onChange('')
      return
    }
    if (!/<svg[\s>]/i.test(v)) {
      setSvgError('内容需要是一个以 <svg> 开头的 SVG 片段')
      return
    }
    if (v.length > 3000) {
      setSvgError('SVG 内容过长（≤3000 字符）')
      return
    }
    setSvgError(null)
    setMode('svg')
    onChange(encodeCategoryIcon('svg', svgToDataUrl(v)))
  }

  const clear = () => {
    setUrlDraft('')
    setSvgDraft('')
    setUrlError(null)
    setSvgError(null)
    setMode('emoji')
    onChange('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {([
          { id: 'emoji', label: 'Emoji' },
          { id: 'image', label: '图片' },
          { id: 'url', label: '网络' },
          { id: 'svg', label: 'SVG' }
        ] as { id: CategoryIconKind; label: string }[]).map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            className={`focus-ring px-2.5 py-1 rounded-lg text-xs ${
              mode === opt.id ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'emoji' && (
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_LIST.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => commitEmoji(emoji)}
              className="focus-ring w-8 h-8 flex items-center justify-center hover:bg-brand-50 rounded-lg text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {mode === 'image' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="focus-ring px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 hover:border-brand-400 disabled:opacity-50"
          >
            {uploading ? '保存中…' : '选择本地图片'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void commitImage((window.electronAPI.getPathForFile as (f: File) => string)(file))
              e.target.value = ''
            }}
          />
          <span className="text-xs text-slate-400">复制进图标缓存（≤5MB）</span>
        </div>
      )}

      {mode === 'url' && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={commitUrl}
              placeholder="https://example.com/icon.png"
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 text-sm"
            />
            <button type="button" onClick={commitUrl} className="px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-sm">确定</button>
          </div>
          {urlError && <div className="text-xs text-red-500">{urlError}</div>}
        </div>
      )}

      {mode === 'svg' && (
        <div className="space-y-1">
          <textarea
            value={svgDraft}
            onChange={(e) => setSvgDraft(e.target.value)}
            placeholder='<svg viewBox="0 0 24 24">…</svg>'
            rows={3}
            className="focus-ring w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-mono"
          />
          <div className="flex items-center justify-between">
            <button type="button" onClick={commitSvg} className="px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-sm">确定</button>
            {svgError && <span className="text-xs text-red-500">{svgError}</span>}
          </div>
        </div>
      )}

      {(icon && mode !== 'emoji') && (
        <button
          type="button"
          onClick={clear}
          className="focus-ring inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-500"
        >
          <Trash size={12} /> 清除图标
        </button>
      )}
    </div>
  )
}
