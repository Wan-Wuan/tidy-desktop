import React, { useEffect, useRef, useState } from 'react'
import type { Config, UISettings } from '../../../../shared/types'
import type { HealthReport, IconRefreshProgress } from './types'

export const SettingsModal = React.memo(function SettingsModal({
  config,
  currentVersion,
  onClose,
  onSave,
  updateState,
  updateVersion,
  updateError,
  onCheckUpdate,
  onRefreshIcons,
  iconRefreshProgress,
  onAutoCategorize,
  onCleanupInvalid,
  onRestoreHidden,
  onExportBackup,
  onImportBackup,
  onImportShortcuts,
  onRunHealthCheck,
  onFixHealthIssues,
  onExportDiagnostics,
  onOpenDataDirectory,
  healthReport,
  onOpenUpdateLog
}: {
  config: Config
  currentVersion: string
  onClose: () => void
  onSave: (config: Config) => Promise<boolean>
  updateState?: string
  updateVersion?: string
  updateError?: string
  onCheckUpdate?: () => Promise<void>
  onRefreshIcons: () => Promise<void>
  iconRefreshProgress: IconRefreshProgress | null
  onAutoCategorize: () => Promise<void>
  onCleanupInvalid: () => Promise<void>
  onRestoreHidden: () => Promise<void>
  onExportBackup: () => Promise<void>
  onImportBackup: () => Promise<void>
  onImportShortcuts: () => Promise<void>
  onRunHealthCheck: () => Promise<void>
  onFixHealthIssues: () => Promise<void>
  onExportDiagnostics: () => Promise<void>
  onOpenDataDirectory: () => Promise<boolean>
  healthReport: HealthReport | null
  onOpenUpdateLog: () => Promise<boolean>
}) {
  const [hotkey, setHotkey] = useState(config.hotkey)
  const [searchHotkey, setSearchHotkey] = useState(config.searchHotkey || 'Ctrl+K')
  const [autoStart, setAutoStart] = useState(false)
  const [defaultEngine, setDefaultEngine] = useState(config.defaultEngine || 'b')
  const [ui, setUi] = useState<UISettings>(config.ui || {
    gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8, theme: 'aurora'
  })
  const [recording, setRecording] = useState<'main' | 'search' | null>(null)
  const engines = config.searchEngines

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
      ui: overrides.ui ?? ui,
      defaultEngine: overrides.defaultEngine ?? defaultEngine
    }
    const success = await onSave(newConfig)
    if (!success) {
      setHotkey(config.hotkey)
      setSearchHotkey(config.searchHotkey || 'Ctrl+K')
      setAutoStart(config.autoStart === true)
      setDefaultEngine(config.defaultEngine || 'b')
      setUi(config.ui || {
        gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8, theme: 'aurora'
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

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="glass rounded-2xl p-6 w-[480px] max-h-[85vh] overflow-auto shadow-xl shadow-brand-500/5 modal-enter">
        <h2 className="text-lg font-display font-bold text-slate-800 mb-5">设置</h2>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>🚀</span> 常规
          </h3>
          <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
            <div>
              <div className="text-sm font-medium text-slate-700">开机自启动</div>
              <div className="text-xs text-slate-500">系统启动时自动运行</div>
            </div>
            <button
              onClick={() => {
                const next = !autoStart
                setAutoStart(next)
                window.electronAPI.setAutoStart(next)
                saveConfig({ autoStart: next })
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${autoStart ? 'bg-brand-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoStart ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>⌨️</span> 快捷键
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <div>
                <div className="text-sm font-medium text-slate-700">显示/隐藏主窗口</div>
                <div className="text-xs text-slate-500">全局快捷键</div>
              </div>
              <button
                onClick={() => setRecording(recording === 'main' ? null : 'main')}
                className={`px-3 py-1.5 rounded-lg text-sm font-mono min-w-[120px] text-center transition-colors ${
                  recording === 'main'
                    ? 'bg-brand-500 text-white animate-pulse'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-400'
                }`}
              >
                {recording === 'main' ? '请按下快捷键...' : hotkey}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <div>
                <div className="text-sm font-medium text-slate-700">快速搜索框</div>
                <div className="text-xs text-slate-500">仅弹出搜索框</div>
              </div>
              <button
                onClick={() => setRecording(recording === 'search' ? null : 'search')}
                className={`px-3 py-1.5 rounded-lg text-sm font-mono min-w-[120px] text-center transition-colors ${
                  recording === 'search'
                    ? 'bg-brand-500 text-white animate-pulse'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-400'
                }`}
              >
                {recording === 'search' ? '请按下快捷键...' : searchHotkey}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>🔍</span> 搜索引擎
          </h3>
          <div className="mb-3">
            <label className="text-xs text-slate-500 mb-1 block">默认搜索引擎</label>
            <select
              value={defaultEngine}
              onChange={(e) => {
                setDefaultEngine(e.target.value)
                saveConfig({ defaultEngine: e.target.value })
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            >
              {Object.entries(engines).map(([key, engine]) => (
                <option key={key} value={key}>{engine.name} ({key} + 空格)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(engines).map(([key, engine]) => (
              <div key={key} className="flex items-center gap-1.5 p-2 bg-brand-50/50 rounded-lg text-xs">
                <span className="font-mono bg-brand-100 px-1.5 py-0.5 rounded">{key}</span>
                <span className="text-slate-600 truncate">{engine.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">输入 关键词 + 空格 调用搜索引擎</p>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>🎨</span> 界面
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">每行显示数量</span>
              <div className="flex gap-1">
                {[4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => {
                      const next = { ...ui, gridColumns: n }
                      setUi(next)
                      saveConfig({ ui: next })
                    }}
                    className={`w-8 h-8 rounded-lg text-sm ${ui.gridColumns === n ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">卡片大小</span>
              <div className="flex gap-1">
                {(['small', 'medium', 'large'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      const next = { ...ui, cardSize: s }
                      setUi(next)
                      saveConfig({ ui: next })
                    }}
                    className={`px-3 py-1 rounded-lg text-sm ${ui.cardSize === s ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'}`}
                  >
                    {cardSizeLabels[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">圆角大小</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={ui.borderRadius}
                  onChange={(e) => {
                    const next = { ...ui, borderRadius: Number(e.target.value) }
                    setUi(next)
                    saveConfig({ ui: next })
                  }}
                  className="w-32"
                />
                <span className="text-sm text-slate-500 w-8">{ui.borderRadius}px</span>
              </div>
            </div>
            {(['showIcon', 'showName'] as const).map(key => (
              <div key={key} className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
                <span className="text-sm text-slate-700">{key === 'showIcon' ? '显示图标' : '显示名称'}</span>
                <button
                  onClick={() => {
                    const next = { ...ui, [key]: !ui[key] }
                    setUi(next)
                    saveConfig({ ui: next })
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${ui[key] ? 'bg-brand-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ui[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl">
              <span className="text-sm text-slate-700">主题</span>
              <div className="flex gap-1">
                {(['aurora', 'light', 'dark', 'system'] as const).map(theme => (
                  <button
                    key={theme}
                    onClick={() => {
                      const next = { ...ui, theme }
                      setUi(next)
                      saveConfig({ ui: next })
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs ${ui.theme === theme ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-400'}`}
                  >
                    {{ aurora: '极光', light: '浅色', dark: '深色', system: '跟随系统' }[theme]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>工具</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onRefreshIcons} disabled={!!iconRefreshProgress} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300 disabled:opacity-60">
              {iconRefreshProgress ? `刷新中 ${iconRefreshProgress.done}/${iconRefreshProgress.total}` : '刷新图标'}
            </button>
            <button onClick={onAutoCategorize} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">自动分类</button>
            <button onClick={onCleanupInvalid} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">清理失效项</button>
            <button onClick={onRestoreHidden} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">恢复隐藏项</button>
            <button onClick={onImportShortcuts} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">导入桌面快捷方式</button>
            <button onClick={onRunHealthCheck} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">数据健康检查</button>
            <button onClick={onExportBackup} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">导出备份</button>
            <button onClick={onImportBackup} className="px-3 py-2 bg-white/70 border border-brand-100 rounded-xl text-xs text-slate-700 hover:border-brand-300">导入备份</button>
          </div>
          {iconRefreshProgress && (
            <div className="mt-3 p-3 bg-brand-50/50 rounded-xl text-xs text-slate-600 space-y-2">
              <div className="h-2 bg-white/70 rounded-full overflow-hidden border border-brand-100">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${iconRefreshProgress.total ? Math.round(iconRefreshProgress.done / iconRefreshProgress.total * 100) : 0}%` }} />
              </div>
              <div className="flex justify-between">
                <span>成功 {iconRefreshProgress.success}</span>
                <span>失败 {iconRefreshProgress.failed}</span>
              </div>
              {iconRefreshProgress.current && <div>正在处理：{iconRefreshProgress.current}</div>}
              {iconRefreshProgress.failures.length > 0 && <div>最近失败：{iconRefreshProgress.failures.join('、')}</div>}
            </div>
          )}
          {healthReport && (
            <div className="mt-3 p-3 bg-brand-50/50 rounded-xl text-xs text-slate-600 space-y-2">
              <div className="font-semibold text-slate-700">健康检查结果</div>
              <div className="grid grid-cols-2 gap-2">
                <span>项目总数：{healthReport.total}</span>
                <span>失效路径：{healthReport.invalidPaths.length}</span>
                <span>缺失图标：{healthReport.missingIcons.length}</span>
                <span>重复路径：{healthReport.duplicatePaths.length}</span>
                <span>空分类：{healthReport.emptyCategories.length}</span>
                <span>隐藏项：{healthReport.hiddenCount}</span>
              </div>
              <button onClick={onFixHealthIssues} className="w-full px-3 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-xs font-medium transition-colors">自动修复可处理问题</button>
            </div>
          )}
        </div>

        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>ℹ️</span> 关于
          </h3>
          <div className="p-3 bg-brand-50/50 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">当前版本</span>
              <span className="text-sm font-mono text-slate-500">{currentVersion ? `v${currentVersion}` : '...'}</span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-100/50">
              <span className="text-sm text-slate-600">检查更新</span>
              <button disabled={updateState === 'checking'} onClick={onCheckUpdate} className="px-3 py-1 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-xs font-medium transition-colors disabled:opacity-50">
                {updateState === 'checking' ? '检查中...' : '检查更新'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-100/50">
              <span className="text-sm text-slate-600">更新安装日志</span>
              <button onClick={onOpenUpdateLog} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">打开日志</button>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-100/50">
              <span className="text-sm text-slate-600">诊断日志</span>
              <button onClick={onExportDiagnostics} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">导出诊断</button>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-100/50">
              <span className="text-sm text-slate-600">数据目录</span>
              <button onClick={onOpenDataDirectory} className="px-3 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg hover:border-brand-300 text-xs font-medium transition-colors">打开目录</button>
            </div>
            {updateState === 'checking' && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
                <svg className="animate-spin w-4 h-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" /></svg>
                <span className="text-sm text-slate-500">正在检查更新...</span>
              </div>
            )}
            {updateState === 'available' && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
                <span className="text-sm text-emerald-500">🎉</span>
                <span className="text-sm text-brand-600 font-medium">发现新版本 v{updateVersion}</span>
              </div>
            )}
            {updateState === 'idle' && !updateError && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
                <span className="text-sm text-emerald-500">✓</span>
                <span className="text-sm text-emerald-600">已是最新版本</span>
              </div>
            )}
            {updateError && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
                <span className="text-sm text-red-500">✕</span>
                <span className="text-sm text-red-500">检查失败：{updateError}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-brand-100/50">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">关闭</button>
        </div>
      </div>
    </div>
  )
})
