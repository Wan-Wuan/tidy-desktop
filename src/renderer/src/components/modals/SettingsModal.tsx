import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle,
  Info,
  Keyboard,
  Lightning,
  MagnifyingGlass,
  Palette,
  RocketLaunch
} from '@phosphor-icons/react'
import type { Config, QuickAction, UISettings } from '../../../../shared/types'

type SectionId = 'general' | 'hotkeys' | 'search' | 'appearance' | 'about'

const SECTIONS: { id: SectionId; label: string; icon: typeof RocketLaunch }[] = [
  { id: 'general', label: '常规', icon: RocketLaunch },
  { id: 'hotkeys', label: '快捷键', icon: Keyboard },
  { id: 'search', label: '搜索', icon: MagnifyingGlass },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'about', label: '关于', icon: Info }
]

export const SettingsModal = React.memo(function SettingsModal({
  config,
  currentVersion,
  onClose,
  onSave,
  updateState,
  updateVersion,
  updateSource,
  updateError,
  onCheckUpdate,
  onExportDiagnostics,
  onOpenDataDirectory,
  onOpenBackupsDirectory,
  onOpenUpdateLog
}: {
  config: Config
  currentVersion: string
  onClose: () => void
  onSave: (config: Config) => Promise<boolean>
  updateState?: string
  updateVersion?: string
  updateSource?: 'gitee' | 'github'
  updateError?: string
  onCheckUpdate?: () => Promise<void>
  onExportDiagnostics: () => Promise<void>
  onOpenDataDirectory: () => Promise<boolean>
  onOpenBackupsDirectory: () => Promise<boolean>
  onOpenUpdateLog: () => Promise<boolean>
}) {
  const [activeSection, setActiveSection] = useState<SectionId>('general')
  const [hotkey, setHotkey] = useState(config.hotkey)
  const [searchHotkey, setSearchHotkey] = useState(config.searchHotkey || 'Ctrl+K')
  const [autoStart, setAutoStart] = useState(false)
  const [closeAction, setCloseAction] = useState<'tray' | 'quit'>(config.closeAction || 'tray')
  const [searchAutoHideOnBlur, setSearchAutoHideOnBlur] = useState(config.searchAutoHideOnBlur === true)
  const [startMinimized, setStartMinimized] = useState(config.startMinimizedToTray === true)
  const [mainAutoHideOnBlur, setMainAutoHideOnBlur] = useState(config.mainAutoHideOnBlur === true)
  const [quickActions, setQuickActions] = useState<QuickAction[]>(config.quickActions || [])
  const [defaultEngine, setDefaultEngine] = useState(config.defaultEngine || 'b')
  const [ui, setUi] = useState<UISettings>(config.ui || {
    gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8, theme: 'aurora', layout: 'horizon-workspace', sidebarWidth: 240
  })
  const [recording, setRecording] = useState<'main' | 'search' | null>(null)
  const engines = config.searchEngines
  const DEFAULT_HOTKEY = 'Alt+Space'
  const DEFAULT_SEARCH_HOTKEY = 'Ctrl+K'
  const DEFAULT_SEARCH_WIDTH = 600
  const DEFAULT_SEARCH_VERTICAL_RATIO = 0.3

  useEffect(() => {
    window.electronAPI.getAutoStart().then(setAutoStart)
  }, [])

  const saveConfig = async (overrides: Partial<Config> = {}) => {
    const newConfig: Config = {
      ...config,
      hotkey: overrides.hotkey ?? hotkey,
      searchHotkey: overrides.searchHotkey ?? searchHotkey,
      searchEngines: engines,
      autoStart: overrides.autoStart ?? autoStart,
      closeAction: overrides.closeAction ?? closeAction,
      searchAutoHideOnBlur: overrides.searchAutoHideOnBlur ?? searchAutoHideOnBlur,
      startMinimizedToTray: overrides.startMinimizedToTray ?? startMinimized,
      mainAutoHideOnBlur: overrides.mainAutoHideOnBlur ?? mainAutoHideOnBlur,
      quickActions: overrides.quickActions ?? quickActions,
      ui: overrides.ui ?? ui,
      defaultEngine: overrides.defaultEngine ?? defaultEngine
    }
    const success = await onSave(newConfig)
    if (!success) {
      setHotkey(config.hotkey)
      setSearchHotkey(config.searchHotkey || 'Ctrl+K')
      setAutoStart(config.autoStart === true)
      setCloseAction(config.closeAction || 'tray')
      setSearchAutoHideOnBlur(config.searchAutoHideOnBlur === true)
      setStartMinimized(config.startMinimizedToTray === true)
      setMainAutoHideOnBlur(config.mainAutoHideOnBlur === true)
      setQuickActions(config.quickActions || [])
      setDefaultEngine(config.defaultEngine || 'b')
      setUi(config.ui || {
        gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8, theme: 'aurora', layout: 'horizon-workspace', sidebarWidth: 240
      })
      if (overrides.autoStart !== undefined) {
        await window.electronAPI.setAutoStart(config.autoStart === true)
      }
    }
    return success
  }

  const saveConfigRef = useRef(saveConfig)
  saveConfigRef.current = saveConfig

  useEffect(() => {
    if (!recording) return
    const handler = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        parts.push(key)
        const combo = parts.join('+')
        if (recording === 'main') {
          setHotkey(combo)
          await saveConfigRef.current({ hotkey: combo })
        } else {
          setSearchHotkey(combo)
          await saveConfigRef.current({ searchHotkey: combo })
        }
        setRecording(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording])

  const cardSizeLabels: Record<string, string> = { small: '小', medium: '中', large: '大' }
  const accentPresets = [
    { name: '靛蓝', value: '' },
    { name: '蓝', value: '#3B82F6' },
    { name: '翠绿', value: '#10B981' },
    { name: '紫罗兰', value: '#8B5CF6' },
    { name: '玫红', value: '#F43F5E' },
    { name: '琥珀', value: '#F59E0B' }
  ]
  const layoutTemplates = [
    {
      id: 'command-rail' as const,
      name: '指挥侧栏',
      description: '侧边分类常驻，主区域更专注，适合频繁切换分类。',
      image: './layout-previews/command-rail.png'
    },
    {
      id: 'horizon-workspace' as const,
      name: '横向工作区',
      description: '顶部分类配合最近使用，适合大屏快速浏览。',
      image: './layout-previews/horizon-workspace.png'
    },
    {
      id: 'studio-split' as const,
      name: '分栏工作室',
      description: '分类与子分类分层展开，适合内容较多的工作库。',
      image: './layout-previews/studio-split.png'
    }
  ]

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass rounded-2xl w-[860px] h-[640px] max-w-full max-h-[88vh] overflow-hidden shadow-xl shadow-brand-500/5 modal-enter flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100/50 shrink-0">
          <h2 className="text-lg font-display font-bold text-slate-800">设置</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="focus-ring cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <aside className="w-[180px] shrink-0 border-r border-brand-100/50 p-3 overflow-y-auto flex flex-col">
            <nav className="space-y-1">
              {SECTIONS.map(section => {
                const Icon = section.icon
                const active = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-brand-500 text-white font-medium'
                        : 'text-slate-600 hover:bg-brand-50/60'
                    }`}
                  >
                    <Icon size={16} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                    {section.label}
                  </button>
                )
              })}
            </nav>
            <p className="text-[11px] text-slate-400 mt-auto pt-4 px-3 leading-relaxed">
              数据整理、备份与健康检查等工具入口已统一在「整理中心」中提供。
            </p>
          </aside>

          <main className="flex-1 min-w-0 p-6 overflow-y-auto">
            {activeSection === 'general' && (
              <div className="space-y-5">
                <SubTitle>系统</SubTitle>
                <div className="space-y-2">
                  <Row label="开机自启动" desc="系统启动时自动运行">
                    <Toggle
                      on={autoStart}
                      onChange={() => {
                        const next = !autoStart
                        setAutoStart(next)
                        window.electronAPI.setAutoStart(next)
                        saveConfig({ autoStart: next })
                      }}
                    />
                  </Row>
                  <Row label="启动时最小化到托盘" desc="开机自启动或手动打开时不弹窗，仅驻留托盘">
                    <Toggle
                      on={startMinimized}
                      onChange={() => {
                        const next = !startMinimized
                        setStartMinimized(next)
                        saveConfig({ startMinimizedToTray: next })
                      }}
                    />
                  </Row>
                  <Row label="点击关闭按钮时" desc="最小化到托盘可保留快速启动和全局快捷键">
                    <div className="flex gap-1">
                      {(['tray', 'quit'] as const).map(action => (
                        <button
                          key={action}
                          onClick={() => {
                            setCloseAction(action)
                            saveConfig({ closeAction: action })
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs ${closeAction === action ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'}`}
                        >
                          {action === 'tray' ? '最小化到托盘' : '退出程序'}
                        </button>
                      ))}
                    </div>
                  </Row>
                  <Row label="主界面失焦自动隐藏" desc="点击其它应用时自动收起，可从托盘图标或快捷键唤起">
                    <Toggle
                      on={mainAutoHideOnBlur}
                      onChange={() => {
                        const next = !mainAutoHideOnBlur
                        setMainAutoHideOnBlur(next)
                        saveConfig({ mainAutoHideOnBlur: next })
                      }}
                    />
                  </Row>
                </div>
              </div>
            )}

            {activeSection === 'hotkeys' && (
              <div className="space-y-5">
                <SubTitle>全局快捷键</SubTitle>
                <div className="space-y-2">
                  <Row label="显示/隐藏主窗口" desc="全局快捷键">
                    <HotkeyButton
                      recording={recording === 'main'}
                      value={hotkey}
                      onClick={() => setRecording(recording === 'main' ? null : 'main')}
                      onReset={hotkey !== DEFAULT_HOTKEY ? () => {
                        setHotkey(DEFAULT_HOTKEY)
                        saveConfig({ hotkey: DEFAULT_HOTKEY })
                      } : null}
                    />
                  </Row>
                  <Row label="快速搜索框" desc="仅弹出搜索框">
                    <HotkeyButton
                      recording={recording === 'search'}
                      value={searchHotkey}
                      onClick={() => setRecording(recording === 'search' ? null : 'search')}
                      onReset={searchHotkey !== DEFAULT_SEARCH_HOTKEY ? () => {
                        setSearchHotkey(DEFAULT_SEARCH_HOTKEY)
                        saveConfig({ searchHotkey: DEFAULT_SEARCH_HOTKEY })
                      } : null}
                    />
                  </Row>
                </div>
                <p className="text-xs text-slate-400">点击输入框并按下想要使用的组合键，点击 ↺ 可恢复默认。</p>
              </div>
            )}

            {activeSection === 'search' && (
              <div className="space-y-5">
                <SubTitle>搜索引擎</SubTitle>
                <Row label="默认搜索引擎" desc="通过 关键词 + 空格 触发">
                  <select
                    value={defaultEngine}
                    onChange={(e) => {
                      setDefaultEngine(e.target.value)
                      saveConfig({ defaultEngine: e.target.value })
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 min-w-[180px]"
                  >
                    {Object.entries(engines).map(([key, engine]) => (
                      <option key={key} value={key}>{engine.name} ({key} + 空格)</option>
                    ))}
                  </select>
                </Row>

                <SubTitle>搜索框</SubTitle>
                <div className="space-y-2">
                  <Row label="失焦自动隐藏" desc="点击其它窗口时自动收起（类 Spotlight 行为）">
                    <Toggle
                      on={searchAutoHideOnBlur}
                      onChange={() => {
                        const next = !searchAutoHideOnBlur
                        setSearchAutoHideOnBlur(next)
                        saveConfig({ searchAutoHideOnBlur: next })
                      }}
                    />
                  </Row>
                  <Row label="玻璃主题">
                    <Segmented
                      options={[
                        { value: 'dark', label: '深色烟熏' },
                        { value: 'light', label: '浅色云瓷' }
                      ]}
                      value={ui.searchTheme || 'dark'}
                      onChange={(v) => {
                        const next = { ...ui, searchTheme: v }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                  <Row label="玻璃透明度" desc="搜索窗表面的不透明程度">
                    <Range
                      min={50}
                      max={95}
                      step={5}
                      value={Math.round((ui.searchOpacity || 0.72) * 100)}
                      display={Math.round((ui.searchOpacity || 0.72) * 100)}
                      unit="%"
                      onChange={(v) => {
                        const next = { ...ui, searchOpacity: v / 100 }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      onReset={Math.round((ui.searchOpacity || 0.72) * 100) !== 72 ? () => {
                        const next = { ...ui, searchOpacity: 0.72 }
                        setUi(next)
                        saveConfig({ ui: next })
                      } : null}
                    />
                  </Row>
                  <Row label="显示底部提示" desc="快捷键提示行；关闭后搜索框更紧凑">
                    <Toggle
                      on={ui.searchHintsVisible !== false}
                      onChange={() => {
                        const next = !(ui.searchHintsVisible !== false)
                        setUi({ ...ui, searchHintsVisible: next })
                        saveConfig({ ui: { ...ui, searchHintsVisible: next } })
                      }}
                    />
                  </Row>
                  <Row label="搜索框宽度">
                    <Range
                      min={380}
                      max={900}
                      step={20}
                      value={ui.searchWidth ?? 600}
                      unit="px"
                      onChange={(v) => {
                        const next = { ...ui, searchWidth: v }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      onReset={(ui.searchWidth ?? 600) !== DEFAULT_SEARCH_WIDTH ? () => {
                        const next = { ...ui, searchWidth: DEFAULT_SEARCH_WIDTH }
                        setUi(next)
                        saveConfig({ ui: next })
                      } : null}
                    />
                  </Row>
                  <Row label="垂直位置">
                    <Range
                      min={0.1}
                      max={0.8}
                      step={0.05}
                      value={ui.searchVerticalRatio ?? 0.3}
                      display={Math.round((ui.searchVerticalRatio ?? 0.3) * 100)}
                      unit="%"
                      onChange={(v) => {
                        const next = { ...ui, searchVerticalRatio: v }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      onReset={Math.round((ui.searchVerticalRatio ?? 0.3) * 100) !== Math.round(DEFAULT_SEARCH_VERTICAL_RATIO * 100) ? () => {
                        const next = { ...ui, searchVerticalRatio: DEFAULT_SEARCH_VERTICAL_RATIO }
                        setUi(next)
                        saveConfig({ ui: next })
                      } : null}
                    />
                  </Row>
                  <Row label="结果展示条数">
                    <Segmented
                      options={[4, 6, 8, 10, 12].map(n => ({ value: n, label: String(n) }))}
                      value={ui.searchMaxResults}
                      onChange={(v) => {
                        const next = { ...ui, searchMaxResults: v as number }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                </div>

                <SubTitle>快捷命令</SubTitle>
                <p className="text-xs text-slate-500 -mt-1">在搜索框输入 <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">&gt;</kbd> 后调用，可按需关闭不需要的系统命令。</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action, index) => (
                    <div key={action.command} className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{action.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{action.key}</div>
                      </div>
                      <Toggle
                        on={action.enabled}
                        onChange={() => {
                          const next = quickActions.map((item, i) =>
                            i === index ? { ...item, enabled: !item.enabled } : item
                          )
                          setQuickActions(next)
                          saveConfig({ quickActions: next })
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-5">
                <SubTitle>主题</SubTitle>
                <div className="space-y-2">
                  <Row label="主题色" desc="按钮、选中态和强调元素的主色调">
                    <div className="flex items-center gap-1.5">
                      {accentPresets.map(preset => (
                        <button
                          key={preset.name}
                          title={preset.name}
                          aria-label={`主题色：${preset.name}`}
                          onClick={() => {
                            const next = { ...ui, accentColor: preset.value }
                            setUi(next)
                            saveConfig({ ui: next })
                          }}
                          className={`focus-ring h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            (ui.accentColor || '') === preset.value ? 'border-slate-900' : 'border-transparent'
                          }`}
                          style={{ background: preset.value || '#6366F1' }}
                        />
                      ))}
                      <label
                        title="自定义颜色"
                        className="focus-ring relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-slate-300"
                        style={{ background: ui.accentColor || 'transparent' }}
                      >
                        <input
                          type="color"
                          value={ui.accentColor || '#6366F1'}
                          onChange={(e) => {
                            const next = { ...ui, accentColor: e.target.value }
                            setUi(next)
                            saveConfig({ ui: next })
                          }}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                    </div>
                  </Row>
                  <Row label="选项卡无字模式" desc="头部工具条只显示图标，更紧凑">
                    <Toggle
                      on={ui.toolbarIconOnly !== false}
                      onChange={() => {
                        const next = ui.toolbarIconOnly === false
                        setUi({ ...ui, toolbarIconOnly: next })
                        saveConfig({ ui: { ...ui, toolbarIconOnly: next } })
                      }}
                    />
                  </Row>
                  <Row label="主题模式">
                    <Segmented
                      options={[
                        { value: 'aurora', label: '极光' },
                        { value: 'glass', label: '玻璃' },
                        { value: 'light', label: '浅色' },
                        { value: 'dark', label: '深色' },
                        { value: 'system', label: '跟随系统' }
                      ]}
                      value={ui.theme}
                      onChange={(v) => {
                        const next = { ...ui, theme: v as UISettings['theme'] }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                </div>

                <SubTitle>界面模板</SubTitle>
                <p className="text-xs text-slate-500 -mt-2">只调整排版，分类、应用和个性化设置保持不变。</p>
                <div className="grid grid-cols-3 gap-3">
                  {layoutTemplates.map(template => {
                    const selected = (ui.layout || 'horizon-workspace') === template.id
                    return (
                      <button
                        key={template.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const next = { ...ui, layout: template.id }
                          setUi(next)
                          saveConfig({ ui: next })
                        }}
                        className={`group focus-ring relative overflow-hidden rounded-xl border bg-white/80 text-left transition-all duration-200 ${
                          selected
                            ? 'border-brand-500 shadow-md shadow-brand-500/10'
                            : 'border-slate-200 hover:border-brand-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="relative aspect-[1.4/1] overflow-hidden border-b border-slate-100 bg-slate-50">
                          <img
                            src={template.image}
                            alt={`${template.name}界面预览`}
                            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                          {selected && (
                            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                              <CheckCircle size={12} weight="fill" aria-hidden="true" />
                              使用中
                            </span>
                          )}
                        </div>
                        <span className="block p-2.5">
                          <span className="block text-sm font-semibold text-slate-800">{template.name}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{template.description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                <SubTitle>项目展示</SubTitle>
                <div className="space-y-2">
                  <Row label="排序方式" desc="手动排序支持拖拽；其它方式只影响展示顺序">
                    <Segmented
                      options={[
                        { value: 'manual', label: '手动' },
                        { value: 'name', label: '名称' },
                        { value: 'launchCount', label: '常用' },
                        { value: 'recent', label: '最近' }
                      ]}
                      value={ui.sortMode || 'manual'}
                      onChange={(v) => {
                        const next = { ...ui, sortMode: v as UISettings['sortMode'] }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                  <Row label="每行显示数量">
                    <Segmented
                      options={[4, 5, 6, 7, 8].map(n => ({ value: n, label: String(n) }))}
                      value={ui.gridColumns}
                      onChange={(v) => {
                        const next = { ...ui, gridColumns: v as number }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      size="sm"
                    />
                  </Row>
                  <Row label="卡片大小">
                    <Segmented
                      options={[
                        { value: 'small', label: '小' },
                        { value: 'medium', label: '中' },
                        { value: 'large', label: '大' }
                      ]}
                      value={ui.cardSize}
                      onChange={(v) => {
                        const next = { ...ui, cardSize: v as UISettings['cardSize'] }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                  <Row label="圆角大小">
                    <Range
                      min={0}
                      max={20}
                      step={1}
                      value={ui.borderRadius}
                      display={ui.borderRadius}
                      unit="px"
                      onChange={(v) => {
                        const next = { ...ui, borderRadius: v }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                  <Row label="显示图标">
                    <Toggle
                      on={ui.showIcon}
                      onChange={() => {
                        const next = { ...ui, showIcon: !ui.showIcon }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                  <Row label="显示名称">
                    <Toggle
                      on={ui.showName}
                      onChange={() => {
                        const next = { ...ui, showName: !ui.showName }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                </div>
              </div>
            )}

            {activeSection === 'about' && (
              <div className="space-y-5">
                <SubTitle>应用</SubTitle>
                <Row label="当前版本">
                  <span className="text-sm font-mono text-slate-500">{currentVersion ? `v${currentVersion}` : '...'}</span>
                </Row>
                <Row label="检查更新">
                  <button
                    disabled={updateState === 'checking'}
                    onClick={onCheckUpdate}
                    className="px-3 py-1 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {updateState === 'checking' ? '检查中...' : '检查更新'}
                  </button>
                </Row>

                <SubTitle>日志与目录</SubTitle>
                <div className="space-y-2">
                  <Row label="更新安装日志">
                    <button onClick={onOpenUpdateLog} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">打开日志</button>
                  </Row>
                  <Row label="诊断日志">
                    <button onClick={onExportDiagnostics} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">导出诊断</button>
                  </Row>
                  <Row label="数据目录">
                    <button onClick={onOpenDataDirectory} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">打开目录</button>
                  </Row>
                  <Row label="自动备份目录">
                    <button onClick={() => void onOpenBackupsDirectory()} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">打开目录</button>
                  </Row>
                </div>

                {updateState === 'checking' && (
                  <div className="flex items-center gap-2 p-3 bg-brand-50/50 rounded-xl text-sm text-slate-500">
                    <svg className="animate-spin w-4 h-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" /></svg>
                    正在检查更新...
                  </div>
                )}
                {updateState === 'available' && (
                  <div className="flex items-center gap-2 p-3 bg-brand-50/50 rounded-xl text-sm text-brand-600">
                    <span>🎉</span>
                    <span className="font-medium">发现新版本 v{updateVersion}</span>
                    {updateSource && <span className="text-xs text-slate-500">{updateSource === 'gitee' ? 'Gitee 镜像' : 'GitHub'}</span>}
                  </div>
                )}
                {updateState === 'idle' && !updateError && (
                  <div className="flex items-center gap-2 p-3 bg-brand-50/50 rounded-xl text-sm text-emerald-600">
                    <span>✓</span>
                    已是最新版本
                  </div>
                )}
                {updateError && (
                  <div className="flex items-center gap-2 p-3 bg-brand-50/50 rounded-xl text-sm text-red-500">
                    <span>✕</span>
                    检查失败：{updateError}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        <div className="flex justify-end px-6 py-3 border-t border-brand-100/50 shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm">关闭</button>
        </div>
      </div>
    </div>
  )
})

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{children}</h4>
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {desc && <div className="text-xs text-slate-500 mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, ariaLabel }: { on: boolean; onChange: () => void; ariaLabel?: string }) {
  return (
    <button
      onClick={onChange}
      aria-label={ariaLabel}
      role="switch"
      aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-slate-300'}`}
    >
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function HotkeyButton({ recording, value, onClick, onReset }: { recording: boolean; value: string; onClick: () => void; onReset: (() => void) | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-lg text-sm font-mono min-w-[120px] text-center transition-colors ${
          recording
            ? 'bg-brand-500 text-white animate-pulse'
            : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-400'
        }`}
      >
        {recording ? '请按下快捷键...' : value}
      </button>
      {onReset && (
        <button
          onClick={onReset}
          aria-label="恢复默认快捷键"
          title="恢复默认"
          className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600"
        >
          ↺
        </button>
      )}
    </div>
  )
}

function Range({ min, max, step, value, display, unit, onChange, onReset }: {
  min: number
  max: number
  step: number
  value: number
  display?: number
  unit: string
  onChange: (v: number) => void
  onReset?: (() => void) | null
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32"
      />
      <span className="text-sm text-slate-500 w-12 text-right">{display ?? value}{unit}</span>
      {onReset && (
        <button
          onClick={onReset}
          aria-label="恢复默认"
          title="恢复默认"
          className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600"
        >
          ↺
        </button>
      )}
    </div>
  )
}

function Segmented<T extends string | number>({ options, value, onChange, size = 'md' }: {
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex gap-1">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`${size === 'sm' ? 'w-8 h-8 text-sm' : 'px-3 py-1 text-sm'} rounded-lg ${
            value === opt.value
              ? 'bg-brand-500 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
