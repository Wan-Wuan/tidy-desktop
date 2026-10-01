import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle,
  Globe,
  Info,
  Keyboard,
  MagnifyingGlass,
  Palette,
  RocketLaunch,
  Warning
} from '@phosphor-icons/react'
import type { BrowserEntry, Config, EnvVar, QuickAction, UISettings, EverythingStatus } from '../../../../shared/types'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { safePickFile, safePickFolder } from '../../utils/nativeDialog'
import type { CorruptBackupInfo, DataHealth } from '../../../../shared/electron'
// 默认值从共享模块取，别在这里写字面量——主进程注册兜底读的是同一份
import { DEFAULT_HOTKEY, DEFAULT_SEARCH_HOTKEY, DEFAULT_PAUSE_HOTKEY } from '../../../../shared/defaults'

type SectionId = 'general' | 'hotkeys' | 'search' | 'appearance' | 'project' | 'about'

const SECTIONS: { id: SectionId; label: string; icon: typeof RocketLaunch }[] = [
  { id: 'general', label: '常规', icon: RocketLaunch },
  { id: 'hotkeys', label: '快捷键', icon: Keyboard },
  { id: 'search', label: '搜索', icon: MagnifyingGlass },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'project', label: '项目', icon: Globe },
  { id: 'about', label: '关于', icon: Info }
]

/**
 * 可选字体族。
 * ⚠️ 是**精选清单**而非枚举系统字体：枚举需要原生模块（Node 侧拿不到字体表），
 * 与项目"纯 JS 依赖"的约束冲突。这里只列 Windows 上常见的中西文字体，
 * 留空 = 跟随主题默认（Inter + 系统回退）。
 */
const FONT_PRESETS: { label: string; value: string }[] = [
  { label: '跟随主题（默认）', value: '' },
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '等线', value: 'DengXian' },
  { label: '宋体', value: 'SimSun' },
  { label: '楷体', value: 'KaiTi' },
  { label: '思源黑体', value: 'Source Han Sans SC' },
  { label: 'HarmonyOS Sans SC', value: 'HarmonyOS Sans SC' },
  { label: '苹方（PingFang SC）', value: 'PingFang SC' },
  { label: 'Segoe UI', value: 'Segoe UI' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Consolas（等宽）', value: 'Consolas' }
]

/** 默认暗化强度：够压住多数亮背景，又不会让图片看不清 */
const DEFAULT_BG_DIM = 0.35

/** 选图片 / 选可执行文件的对话框过滤条件（与主进程 select-file 的参数形状一致） */
const IMAGE_FILE_FILTER = { extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg'], title: '选择图片' }
const EXE_FILE_FILTER = { extensions: ['exe'], title: '选择浏览器程序' }

/** 环境变量名允许的形式：字母/下划线开头，后接字母数字下划线（与 pathResolve 的 %KEY% 规则一致） */
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

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
  dataHealth,
  onRestoreCorruptBackup,
  onOpenCorruptBackupsDirectory,
  effectiveHotkey,
  launchPaused
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
  /** 数据健康状态；存在损坏留档时给出恢复入口 */
  dataHealth?: DataHealth
  onRestoreCorruptBackup: (backup: CorruptBackupInfo) => void
  onOpenCorruptBackupsDirectory: () => void
  /**
   * 主进程实际注册成功的主热键。
   * 与配置里期望的值不同即说明走了降级候选——此时必须把真实生效的组合摆出来，
   * 否则「设置里写着 A、实际是 B」会让用户反复改键也找不到原因。
   */
  effectiveHotkey?: string
  /** 当前快捷键是否已暂停（跨重启保持）；由主进程经 launch-paused-changed 推送 */
  launchPaused?: boolean
}) {
  // Esc 关闭、焦点进出、Tab 循环：此前设置面板按 Esc 关不掉
  const { ref: dialogRef, dialogProps } = useDialogA11y<HTMLDivElement>({
    onClose,
    labelledBy: 'settings-title'
  })

  const [activeSection, setActiveSection] = useState<SectionId>('general')
  const [hotkey, setHotkey] = useState(config.hotkey)
  const [searchHotkey, setSearchHotkey] = useState(config.searchHotkey || DEFAULT_SEARCH_HOTKEY)
  const [autoStart, setAutoStart] = useState(false)
  const [closeAction, setCloseAction] = useState<'tray' | 'quit'>(config.closeAction || 'tray')
  const [searchAutoHideOnBlur, setSearchAutoHideOnBlur] = useState(config.searchAutoHideOnBlur === true)
  const [startMinimized, setStartMinimized] = useState(config.startMinimizedToTray === true)
  const [mainAutoHideOnBlur, setMainAutoHideOnBlur] = useState(config.mainAutoHideOnBlur === true)
  const [quickActions, setQuickActions] = useState<QuickAction[]>(config.quickActions || [])
  // 浏览器列表（P2-6）：网址项目可指定用哪个浏览器打开
  const [browsers, setBrowsers] = useState<BrowserEntry[]>(config.browsers || [])
  // 环境变量 / 便携根目录 / 优先相对路径（P0-5 的界面入口）
  const [envVars, setEnvVars] = useState<EnvVar[]>(config.envVars || [])
  const [portableRoot, setPortableRoot] = useState(config.portableRoot || '')
  const [preferRelativePath, setPreferRelativePath] = useState(config.preferRelativePath === true)
  // 配置预设导入/导出进行中（原生对话框在场时按钮应禁用，避免重复触发）
  const [presetBusy, setPresetBusy] = useState(false)
  const [defaultEngine, setDefaultEngine] = useState(config.defaultEngine || 'b')
  const [ui, setUi] = useState<UISettings>(config.ui || {
    gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8, theme: 'aurora', layout: 'horizon-workspace', sidebarWidth: 240
  })
  const [recording, setRecording] = useState<'main' | 'search' | 'pause' | null>(null)
  const [pauseHotkey, setPauseHotkey] = useState(config.pauseHotkey || DEFAULT_PAUSE_HOTKEY)
  // 暂停状态：以 prop（主进程真相）为准，本地仅作即时反映
  const [paused, setPaused] = useState(config.launchPaused === true)
  // 本机 Everything 的检测结果（安装 / 运行 / HTTP 端口连通性），设置页展示 + 手动检测
  const [everythingStatus, setEverythingStatus] = useState<EverythingStatus | null>(null)
  const [everythingChecking, setEverythingChecking] = useState(false)
  const engines = config.searchEngines
  // 背景设置（P2-1）：单独取出来，JSX 里能借 `bg?.kind === 'image'` 做类型收窄，避免到处写 `!`
  const bg = ui.background
  const DEFAULT_SEARCH_WIDTH = 600
  const DEFAULT_SEARCH_VERTICAL_RATIO = 0.3

  useEffect(() => {
    window.electronAPI.getAutoStart().then(setAutoStart)
  }, [])

  // 打开设置时先自动检测一次 Everything，让用户一眼看到当前连接状态。
  // 用 try/catch 包住：检测接口缺失（旧版 preload / 测试桩）时不能让设置页崩掉。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await window.electronAPI.detectEverything()
        if (!cancelled) setEverythingStatus(s)
      } catch {
        if (!cancelled) setEverythingStatus(null)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 主进程暂停态变化（托盘菜单 / 设置里的按钮）→ 同步本地展示
  useEffect(() => {
    setPaused(launchPaused === true)
  }, [launchPaused])

  const saveConfig = async (overrides: Partial<Config> = {}) => {
    /* 受控字段（有独立输入框 / 本地 state）优先取本地 state——它才是输入框的即时真相；
       其余字段以 overrides 为准。
       ⚠️ 最后必须再展开一次 overrides：任何显式传入的键都要落盘，绝不能因为"没写进上面这张
       白名单"被 `...config` 静默覆盖。本机文件搜索的 everythingHttpPort 直接改 config
       并传 overrides，正是踩过这个坑——「改了端口保存后却没了」。 */
    const newConfig: Config = {
      ...config,
      hotkey: overrides.hotkey ?? hotkey,
      searchHotkey: overrides.searchHotkey ?? searchHotkey,
      pauseHotkey: overrides.pauseHotkey ?? pauseHotkey,
      searchEngines: engines,
      autoStart: overrides.autoStart ?? autoStart,
      closeAction: overrides.closeAction ?? closeAction,
      searchAutoHideOnBlur: overrides.searchAutoHideOnBlur ?? searchAutoHideOnBlur,
      startMinimizedToTray: overrides.startMinimizedToTray ?? startMinimized,
      mainAutoHideOnBlur: overrides.mainAutoHideOnBlur ?? mainAutoHideOnBlur,
      quickActions: overrides.quickActions ?? quickActions,
      browsers: overrides.browsers ?? browsers,
      envVars: overrides.envVars ?? envVars,
      portableRoot: overrides.portableRoot ?? (portableRoot.trim() || null),
      preferRelativePath: overrides.preferRelativePath ?? preferRelativePath,
      ui: overrides.ui ?? ui,
      defaultEngine: overrides.defaultEngine ?? defaultEngine,
      ...overrides
    }
    const success = await onSave(newConfig)
    if (!success) {
      setHotkey(config.hotkey)
      setSearchHotkey(config.searchHotkey || DEFAULT_SEARCH_HOTKEY)
      setPauseHotkey(config.pauseHotkey || DEFAULT_PAUSE_HOTKEY)
      setAutoStart(config.autoStart === true)
      setCloseAction(config.closeAction || 'tray')
      setSearchAutoHideOnBlur(config.searchAutoHideOnBlur === true)
      setStartMinimized(config.startMinimizedToTray === true)
      setMainAutoHideOnBlur(config.mainAutoHideOnBlur === true)
      setQuickActions(config.quickActions || [])
      setBrowsers(config.browsers || [])
      setEnvVars(config.envVars || [])
      setPortableRoot(config.portableRoot || '')
      setPreferRelativePath(config.preferRelativePath === true)
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

  /* ── 配置预设（P3-5） ── */

  /** 导出：主进程读盘上的 config.json 写成预设文件，这里只负责发起与报结果 */
  const handleExportPreset = async () => {
    setPresetBusy(true)
    try {
      const result = await window.electronAPI.exportConfigPreset()
      if (result.canceled) return
      alert(result.ok ? `配置预设已导出到：\n${result.path}` : '导出失败：目标位置可能不可写。')
    } catch (error) {
      // 不接住的话这里会变成未捕获的 rejection，按钮表现为"点了没反应"
      console.error('exportConfigPreset failed:', error)
      alert('导出失败：主进程无响应，请重启应用后重试。')
    } finally {
      setPresetBusy(false)
    }
  }

  /**
   * 导入：主进程只读取 + 校验 + 合并，**落盘仍走 onSave**。
   * 成功之后必须把本地的 ui / quickActions / envVars / browsers 一起重置——
   * 它们是有独立输入框的本地 state，不同步的话面板会继续显示导入前的旧值。
   */
  const handleImportPreset = async () => {
    let confirmed: boolean
    try {
      confirmed = await window.electronAPI.confirm(
        '导入会覆盖当前的外观、搜索引擎、快捷命令、环境变量与浏览器列表。\n项目、分类等数据不受影响。\n\n继续导入？'
      )
    } catch (error) {
      console.error('confirm failed:', error)
      alert('无法显示确认对话框，已取消导入。')
      return
    }
    if (!confirmed) return

    setPresetBusy(true)
    try {
      const result = await window.electronAPI.importConfigPreset()
      if (result.canceled) return
      if (!result.ok || !result.config) {
        alert('导入失败：该文件不是有效的配置预设。')
        return
      }
      const imported = result.config
      if (!await onSave(imported)) return
      setUi(imported.ui || ui)
      setQuickActions(imported.quickActions || [])
      setEnvVars(imported.envVars || [])
      setBrowsers(imported.browsers || [])
      alert(`已导入 ${result.applied.length} 项设置。`)
    } catch (error) {
      console.error('importConfigPreset failed:', error)
      alert('导入失败：主进程无响应，请重启应用后重试。')
    } finally {
      setPresetBusy(false)
    }
  }

  /**
   * 保存成功之后立刻刷新托盘图标。
   *
   * 两个要点：
   *  ① **只在保存成功后调用**。反过来的话托盘会先换成新图，配置却没落盘，
   *     重启后图标又变回去——用户看到的是「改了没用」。
   *  ② 刷新失败要明说。`apply-tray-icon` 读的是盘上的 config.json，
   *     只要保存成功，重启一定能生效，所以这里给的是"稍后生效"而不是"失败"。
   */
  const applyTrayIconAfterSave = async () => {
    try {
      await window.electronAPI.applyTrayIcon()
    } catch (error) {
      console.error('applyTrayIcon failed:', error)
      alert('托盘图标已保存，但刷新失败；重启应用后生效。')
    }
  }

  useEffect(() => {
    if (!recording) return

    /* 录制期间必须挂起主进程的全局热键。
       否则用户想录 Alt+Space 时，按下的瞬间就被主进程的 globalShortcut 抢走并直接执行
       （窗口被切换），渲染层这边既录不到、界面还乱跳——表现就是"录制框卡住不动"。
       Electron 专门为改键场景提供了 setSuspended。 */
    void window.electronAPI.setShortcutSuspended(true)

    const handler = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      /* Escape = 放弃录制。
         以前这里会把 Escape 当成一个普通键录进去，用户手一滑就把全局快捷键设成了 Esc——
         之后按 Esc 不再关闭弹窗 / 取消选择，而是去切换主窗口，看起来像"快捷键全乱了"。
         这是本项目里最隐蔽的一个热键冲突源。 */
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        parts.push(key)
        const combo = parts.join('+')
        /* ⚠️ 顺序要紧：必须先把全局热键恢复回来，再保存配置。
           主进程的 setSuspended(true) 期间**新注册会失败**（Electron 的既定行为），
           而保存配置正是一次重新注册。先保存后恢复的话，用户录好的新键永远注册不上。 */
        await window.electronAPI.setShortcutSuspended(false)
        if (recording === 'main') {
          setHotkey(combo)
          await saveConfigRef.current({ hotkey: combo })
        } else if (recording === 'search') {
          setSearchHotkey(combo)
          await saveConfigRef.current({ searchHotkey: combo })
        } else {
          setPauseHotkey(combo)
          await saveConfigRef.current({ pauseHotkey: combo })
        }
        setRecording(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      // 无论录制是完成、取消还是弹窗被卸载，都要把全局热键恢复回来
      void window.electronAPI.setShortcutSuspended(false)
    }
  }, [recording])

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
      <div ref={dialogRef} {...dialogProps} className="glass rounded-2xl w-[860px] h-[640px] max-w-full max-h-[88vh] overflow-hidden shadow-xl shadow-brand-500/5 modal-enter flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100/50 shrink-0">
          <h2 id="settings-title" className="text-lg font-display font-bold text-slate-800">设置</h2>
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
                      ariaLabel="开机自启动"
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
                      ariaLabel="启动时最小化到托盘"
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
                      ariaLabel="主界面失焦自动隐藏"
                      onChange={() => {
                        const next = !mainAutoHideOnBlur
                        setMainAutoHideOnBlur(next)
                        saveConfig({ mainAutoHideOnBlur: next })
                      }}
                    />
                  </Row>
                </div>

                <SubTitle>数据备份</SubTitle>
                <div className="space-y-2">
                  <Row label="每日自动备份" desc="每次启动时把数据文件快照一份；关闭后不再自动备份">
                    <Toggle
                      on={config.backupEnabled !== false}
                      ariaLabel="每日自动备份"
                      onChange={() => {
                        const next = config.backupEnabled === false
                        saveConfig({ backupEnabled: next })
                      }}
                    />
                  </Row>
                  <Row label="备份目录" desc="留空用数据目录下的 backups；改动在下次启动时生效">
                    <div className="flex items-center gap-2">
                      <span className="max-w-[200px] truncate text-xs text-slate-500" title={config.backupDir || ''}>
                        {config.backupDir || '默认（数据目录 / backups）'}
                      </span>
                      <button
                        onClick={async () => {
                          const picked = await safePickFolder()
                          if (!picked) return
                          saveConfig({ backupDir: picked })
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 hover:border-brand-400 transition-colors"
                      >
                        选择目录
                      </button>
                      {config.backupDir && (
                        <button
                          onClick={() => saveConfig({ backupDir: null })}
                          aria-label="恢复默认备份目录"
                          className="px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-600 hover:border-brand-400 transition-colors"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </Row>
                  <Row label="保留份数" desc="每个数据文件最多保留多少天的快照">
                    <Range
                      label="保留份数"
                      min={1}
                      max={50}
                      step={1}
                      value={config.backupKeep ?? 7}
                      display={config.backupKeep ?? 7}
                      unit=" 份"
                      onChange={(v) => saveConfig({ backupKeep: v })}
                      onReset={(config.backupKeep ?? 7) !== 7 ? () => saveConfig({ backupKeep: 7 }) : null}
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
                      label="主窗口快捷键"
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
                      label="快速搜索快捷键"
                      recording={recording === 'search'}
                      value={searchHotkey}
                      onClick={() => setRecording(recording === 'search' ? null : 'search')}
                      onReset={searchHotkey !== DEFAULT_SEARCH_HOTKEY ? () => {
                        setSearchHotkey(DEFAULT_SEARCH_HOTKEY)
                        saveConfig({ searchHotkey: DEFAULT_SEARCH_HOTKEY })
                      } : null}
                    />
                  </Row>
                  <Row label="暂停 / 恢复快捷键" desc="一键禁用所有唤出热键，再次按下恢复">
                    <HotkeyButton
                      label="暂停快捷键"
                      recording={recording === 'pause'}
                      value={pauseHotkey || '未设置'}
                      onClick={() => setRecording(recording === 'pause' ? null : 'pause')}
                      onReset={pauseHotkey ? () => {
                        setPauseHotkey('')
                        saveConfig({ pauseHotkey: '' })
                      } : null}
                    />
                  </Row>
                </div>
                {/* 暂停状态即时开关：即使没设快捷键，也能从设置里恢复（避免"暂停后忘了设键"的死局） */}
                <div className="flex items-center justify-between p-3 bg-brand-50/50 rounded-xl gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-700">快捷键当前状态</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {paused ? '已暂停：所有唤出热键失效，只能从托盘或这里恢复' : '运行中：唤出热键正常工作'}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const next = await window.electronAPI.toggleLaunchPaused()
                      setPaused(next)
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      paused ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white border border-slate-200 text-slate-700 hover:border-brand-400'
                    }`}
                  >
                    {paused ? '恢复快捷键' : '暂停快捷键'}
                  </button>
                </div>
                {/* 期望的键没注册上、已退到备用组合。必须把真实生效的组合摆出来——
                    否则「设置里写着 A、实际是 B」，用户反复改键也找不到原因。
                    bg-amber-50 + text-amber-700 = 4.84:1，过 WCAG AA。 */}
                {effectiveHotkey && effectiveHotkey.toLowerCase() !== hotkey.toLowerCase() && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                    <span className="font-medium">{hotkey}</span> 无法注册（可能已被其它程序占用），
                    当前实际生效的是 <span className="font-medium">{effectiveHotkey}</span>。
                    建议在此处更换一个未被占用的组合。
                  </div>
                )}
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
                  <Row label="搜索占位符" desc="未输入时搜索框内的提示文字；留空则使用默认值">
                    <input
                      type="text"
                      maxLength={60}
                      value={ui.searchPlaceholder ?? ''}
                      placeholder="搜索应用或文件夹…"
                      onChange={(e) => {
                        const next = { ...ui, searchPlaceholder: e.target.value }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 w-56"
                    />
                  </Row>
                  <Row label="失焦自动隐藏" desc="点击其它窗口时自动收起（类 Spotlight 行为）">
                    <Toggle
                      on={searchAutoHideOnBlur}
                      ariaLabel="失焦自动隐藏"
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
                      label="玻璃透明度"
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
                      ariaLabel="显示底部提示"
                      onChange={() => {
                        const next = !(ui.searchHintsVisible !== false)
                        setUi({ ...ui, searchHintsVisible: next })
                        saveConfig({ ui: { ...ui, searchHintsVisible: next } })
                      }}
                    />
                  </Row>
                  <Row label="搜索框宽度">
                    <Range
                      label="搜索框宽度"
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
                      label="垂直位置"
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
                        ariaLabel={`${action.name}快捷命令`}
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

                <SubTitle>本机文件搜索</SubTitle>
                <p className="text-xs text-slate-500 -mt-1">在搜索框中搜索本机文件 / 文件夹。<b>由本机 Everything 提供</b>（全盘、即时）；需要先在 Everything 中启用 HTTP 服务器，见下方状态。</p>
                <div className="space-y-2">
                  <Row label="Everything HTTP 端口" desc="留 0 = 自动检测（读取 Everything.ini 的 http_server_port）；也可手动指定">
                    <input
                      type="number"
                      min={0}
                      max={65535}
                      value={config.everythingHttpPort || 0}
                      onChange={(e) => {
                        const port = Math.min(65535, Math.max(0, Math.round(Number(e.target.value) || 0)))
                        saveConfig({ everythingHttpPort: port })
                      }}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 w-28"
                    />
                  </Row>

                  {/* Everything 连接状态：明确告诉用户「连上了没 / 为什么没连上」。
                      以前默认端口 0 且无自动检测，用户只会看到结果变少，却不知道为什么。 */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                        {everythingStatus?.reachable ? (
                          <CheckCircle size={15} className="text-emerald-500" weight="fill" />
                        ) : (
                          <Warning size={15} className="text-amber-500" weight="fill" />
                        )}
                        Everything 连接状态
                      </div>
                      <button
                        onClick={async () => {
                          setEverythingChecking(true)
                          try {
                            setEverythingStatus(await window.electronAPI.detectEverything())
                          } catch {
                            setEverythingStatus(null)
                          } finally {
                            setEverythingChecking(false)
                          }
                        }}
                        disabled={everythingChecking}
                        className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 hover:border-brand-400 transition-colors disabled:opacity-50"
                      >
                        {everythingChecking ? '检测中…' : '重新检测'}
                      </button>
                    </div>
                    <div className="text-xs leading-relaxed">
                      {!everythingStatus ? (
                        <span className="text-slate-500">尚未检测。</span>
                      ) : everythingStatus.reachable ? (
                        <span className="text-emerald-700">
                          已连接本机 Everything（端口 {everythingStatus.port}），搜索将走 Everything 全盘索引。
                        </span>
                      ) : !everythingStatus.installed ? (
                        <span className="text-slate-600">
                          未检测到 Everything。本机文件搜索需要它：请先安装 Everything，并在其
                          「工具 → 选项 → HTTP 服务器」中勾选「启用 HTTP 服务器」。
                        </span>
                      ) : !everythingStatus.running ? (
                        <span className="text-amber-700">
                          已安装 Everything，但<b>当前未运行</b>。启动 Everything 后返回此处「重新检测」。
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          已安装且正在运行，但连不上（端口 {everythingStatus.port || '未识别'}）。
                          请在 Everything 中打开「工具 → 选项 → HTTP 服务器」，勾选<b>「启用 HTTP 服务器」</b>后点确定；
                          若已启用仍连不上，检查端口是否被占用，或是否设了用户名 / 密码。
                        </span>
                      )}
                    </div>
                    {(everythingStatus?.iniPath || everythingStatus?.exePath) && (
                      <div className="text-[11px] text-slate-400 truncate" title={everythingStatus?.iniPath || everythingStatus?.exePath}>
                        检测到：{everythingStatus?.exePath || everythingStatus?.iniPath}
                      </div>
                    )}
                  </div>
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
                      ariaLabel="选项卡无字模式"
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

                <SubTitle>背景</SubTitle>
                <div className="space-y-2">
                  <Row label="背景类型" desc="纯色替换主题底色；图片覆盖整窗，文件被移走会自动回退">
                    <Segmented
                      options={[
                        { value: 'none', label: '无' },
                        { value: 'color', label: '纯色' },
                        { value: 'image', label: '图片' }
                      ]}
                      value={bg?.kind || 'none'}
                      onChange={(v) => {
                        const kind = v as 'none' | 'color' | 'image'
                        /* 模糊 / 暗化只在**同一种背景**内继承，换类型一律回到该类型的默认。
                           ⚠️ 跨类型继承会把另一类型的参数带过来：
                             · 图片的 35% 暗化跟到纯色上 → 用户挑的颜色被莫名压暗；
                             · 纯色的 0 暗化跟到图片上 → 亮背景图不压暗，玻璃面板上的浅色文字直接糊掉
                               （正是 R6「背景图与主题对比度冲突」那条风险的触发条件）。
                           同一类型内再点一次（用户误触）不该丢掉他调好的值，所以保留继承。 */
                        const sameKind = bg?.kind === kind
                        const blur = sameKind ? (bg?.blur ?? 0) : 0
                        const dim = sameKind
                          ? (bg?.dim ?? (kind === 'image' ? DEFAULT_BG_DIM : 0))
                          : (kind === 'image' ? DEFAULT_BG_DIM : 0)
                        const next = {
                          ...ui,
                          background: kind === 'none'
                            ? null
                            : {
                              kind,
                              value: kind === 'color'
                                ? (sameKind && bg?.value ? bg.value : '#E8EEFF')
                                : (sameKind ? (bg?.value ?? '') : ''),
                              blur,
                              dim
                            }
                        }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                    />
                  </Row>
                  {bg?.kind === 'color' && (
                    <Row label="背景颜色">
                      <input
                        type="color"
                        aria-label="背景颜色"
                        value={bg.value || '#E8EEFF'}
                        onChange={(e) => {
                          const next = { ...ui, background: { ...bg, value: e.target.value } }
                          setUi(next)
                          saveConfig({ ui: next })
                        }}
                        className="h-8 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white"
                      />
                    </Row>
                  )}
                  {bg?.kind === 'image' && (
                    <>
                      <Row label="背景图片" desc="选一张本地图片作为整窗背景">
                        <div className="flex items-center gap-2">
                          {bg.value && (
                            <span className="max-w-[160px] truncate text-xs text-slate-500" title={bg.value}>
                              {bg.value.split(/[\\/]/).pop()}
                            </span>
                          )}
                          <button
                            onClick={async () => {
                              const picked = await safePickFile(IMAGE_FILE_FILTER)
                              if (!picked) return
                              const next = { ...ui, background: { ...bg, value: picked } }
                              setUi(next)
                              saveConfig({ ui: next })
                            }}
                            aria-label={bg.value ? '更换背景图片' : '选择背景图片'}
                            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 hover:border-brand-400 transition-colors"
                          >
                            {bg.value ? '更换背景图片' : '选择背景图片'}
                          </button>
                        </div>
                      </Row>
                      <Row label="模糊" desc="柔化背景，也有助于文字可读">
                        <Range
                          label="模糊"
                          min={0}
                          max={40}
                          step={2}
                          value={bg.blur ?? 0}
                          display={bg.blur ?? 0}
                          unit="px"
                          onChange={(v) => {
                            const next = { ...ui, background: { ...bg, blur: v } }
                            setUi(next)
                            saveConfig({ ui: next })
                          }}
                          onReset={(bg.blur ?? 0) !== 0 ? () => {
                            const next = { ...ui, background: { ...bg, blur: 0 } }
                            setUi(next)
                            saveConfig({ ui: next })
                          } : null}
                        />
                      </Row>
                      <Row label="暗化" desc="压暗背景，保证玻璃面板上的文字仍清晰（建议 ≥30%）">
                        <Range
                          label="暗化"
                          min={0}
                          max={90}
                          step={5}
                          value={Math.round((bg.dim ?? DEFAULT_BG_DIM) * 100)}
                          display={Math.round((bg.dim ?? DEFAULT_BG_DIM) * 100)}
                          unit="%"
                          onChange={(v) => {
                            const next = { ...ui, background: { ...bg, dim: v / 100 } }
                            setUi(next)
                            saveConfig({ ui: next })
                          }}
                          onReset={Math.round((bg.dim ?? DEFAULT_BG_DIM) * 100) !== Math.round(DEFAULT_BG_DIM * 100) ? () => {
                            const next = { ...ui, background: { ...bg, dim: DEFAULT_BG_DIM } }
                            setUi(next)
                            saveConfig({ ui: next })
                          } : null}
                        />
                      </Row>
                    </>
                  )}
                </div>

                <SubTitle>字体</SubTitle>
                <div className="space-y-2">
                  <Row label="字体族" desc="影响全局文字；图标与网格尺寸不受影响">
                    <select
                      value={ui.fontFamily || ''}
                      onChange={(e) => {
                        const next = { ...ui, fontFamily: e.target.value }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 min-w-[180px]"
                    >
                      {FONT_PRESETS.map(preset => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </Row>
                  <Row label="字号缩放" desc="整体放大 / 缩小文字，不影响图标与网格列数">
                    <Range
                      label="字号缩放"
                      min={80}
                      max={140}
                      step={5}
                      value={Math.round((ui.uiScale ?? 1) * 100)}
                      display={Math.round((ui.uiScale ?? 1) * 100)}
                      unit="%"
                      onChange={(v) => {
                        const next = { ...ui, uiScale: v / 100 }
                        setUi(next)
                        saveConfig({ ui: next })
                      }}
                      onReset={Math.round((ui.uiScale ?? 1) * 100) !== 100 ? () => {
                        const next = { ...ui, uiScale: 1 }
                        setUi(next)
                        saveConfig({ ui: next })
                      } : null}
                    />
                  </Row>
                </div>

                <SubTitle>托盘图标</SubTitle>
                <div className="space-y-2">
                  <Row label="自定义图标" desc="选一张图片作为系统托盘图标；建议用方形的 PNG">
                    <div className="flex items-center gap-2">
                      {ui.trayIcon && (
                        <span className="max-w-[140px] truncate text-xs text-slate-500" title={ui.trayIcon}>
                          {ui.trayIcon.split(/[\\/]/).pop()}
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          const picked = await safePickFile(IMAGE_FILE_FILTER)
                          if (!picked) return
                          const next = { ...ui, trayIcon: picked }
                          setUi(next)
                          if (await saveConfig({ ui: next })) await applyTrayIconAfterSave()
                        }}
                        aria-label={ui.trayIcon ? '更换托盘图标' : '选择托盘图标'}
                        className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 hover:border-brand-400 transition-colors"
                      >
                        {ui.trayIcon ? '更换托盘图标' : '选择托盘图标'}
                      </button>
                      {ui.trayIcon && (
                        <button
                          onClick={async () => {
                            const next = { ...ui, trayIcon: null }
                            setUi(next)
                            if (await saveConfig({ ui: next })) await applyTrayIconAfterSave()
                          }}
                          aria-label="恢复默认托盘图标"
                          className="px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-600 hover:border-brand-400 transition-colors"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
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
                      label="圆角大小"
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
                      ariaLabel="显示图标"
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
                      ariaLabel="显示名称"
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

            {activeSection === 'project' && (
              <div className="space-y-5">
                <SubTitle>环境变量</SubTitle>
                <p className="text-xs text-slate-500 -mt-1">
                  定义之后，项目的路径 / 启动参数 / 起始位置里可以用 <span className="font-mono">%KEY%</span> 引用，
                  常用目录只维护一处。变量值里还能再引用别的变量。
                  <br />
                  注：「启动参数 / 起始位置」只对 <span className="font-mono">.exe</span> 程序生效。
                </p>
                <div className="space-y-2">
                  {envVars.map((item, index) => {
                    const key = item.key.trim()
                    const duplicated = key !== '' && envVars.some((other, i) => i !== index && other.key.trim().toLowerCase() === key.toLowerCase())
                    const invalid = key !== '' && !ENV_KEY_PATTERN.test(key)
                    return (
                      <div key={index} className="flex items-start gap-2 p-3 bg-brand-50/50 rounded-xl">
                        <div className="shrink-0">
                          <input
                            value={item.key}
                            aria-label="环境变量名"
                            placeholder="KEY"
                            onChange={(e) => {
                              const next = envVars.map((v, i) => i === index ? { ...v, key: e.target.value } : v)
                              setEnvVars(next)
                              saveConfig({ envVars: next })
                            }}
                            className={`w-32 px-2.5 py-1.5 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
                              invalid || duplicated ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-brand-400'
                            }`}
                          />
                          {(invalid || duplicated) && (
                            <div className="mt-1 text-[11px] text-rose-600">
                              {invalid ? '只能用字母/数字/下划线，且不能以数字开头' : '变量名重复'}
                            </div>
                          )}
                        </div>
                        <input
                          value={item.value}
                          aria-label="环境变量值"
                          placeholder="D:\\Tools"
                          onChange={(e) => {
                            const next = envVars.map((v, i) => i === index ? { ...v, value: e.target.value } : v)
                            setEnvVars(next)
                            saveConfig({ envVars: next })
                          }}
                          className="min-w-0 flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                        />
                        <button
                          onClick={() => {
                            const next = envVars.filter((_, i) => i !== index)
                            setEnvVars(next)
                            saveConfig({ envVars: next })
                          }}
                          aria-label={`删除环境变量 ${item.key}`}
                          className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-rose-600 hover:border-rose-400 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    )
                  })}
                  {envVars.length === 0 && (
                    <p className="text-xs text-slate-400">暂未定义变量。项目的路径中可以直接写 <span className="font-mono">%KEY%</span>。</p>
                  )}
                  <button
                    onClick={() => {
                      const next = [...envVars, { key: '', value: '' }]
                      setEnvVars(next)
                      saveConfig({ envVars: next })
                    }}
                    disabled={envVars.length >= 100}
                    className="px-3 py-1.5 rounded-lg text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                  >
                    + 添加变量
                  </button>
                </div>

                <SubTitle>便携根目录</SubTitle>
                <Row
                  label="基准目录"
                  desc="开启下面的开关后，落在该目录下的项目路径会以相对形式保存；整个目录搬走后不用重新添加。"
                >
                  <div className="flex items-center gap-2">
                    <span className="max-w-[200px] truncate text-xs text-slate-500 font-mono" title={portableRoot}>
                      {portableRoot || '未设置'}
                    </span>
                    <button
                      onClick={async () => {
                        const picked = await safePickFolder()
                        if (!picked) return
                        setPortableRoot(picked)
                        saveConfig({ portableRoot: picked })
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-600 hover:border-brand-400 transition-colors"
                    >
                      选择
                    </button>
                    {portableRoot !== '' && (
                      <button
                        onClick={() => {
                          setPortableRoot('')
                          saveConfig({ portableRoot: null })
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-500 hover:border-slate-400 transition-colors"
                      >
                        清除
                      </button>
                    )}
                  </div>
                </Row>
                <Row
                  label="优先保存相对路径"
                  desc={
                    portableRoot
                      ? '只影响新增项目；已有项目里的绝对路径不会被自动改写。'
                      : '需要先设置上面的基准目录，否则相对路径无法还原。'
                  }
                >
                  <Toggle
                    on={preferRelativePath}
                    ariaLabel="优先保存相对路径"
                    onChange={() => {
                      const next = !preferRelativePath
                      setPreferRelativePath(next)
                      saveConfig({ preferRelativePath: next })
                    }}
                  />
                </Row>

                <SubTitle>浏览器</SubTitle>
                <p className="text-xs text-slate-500 -mt-1">
                  添加后，网址项目可以指定用哪个浏览器打开；右键网址卡片也有「用其它浏览器打开」。
                  名称可改，路径必须是存在的 .exe。
                </p>
                <div className="space-y-2">
                  {browsers.map((browser, index) => (
                    <div key={browser.id} className="flex items-center gap-2 p-3 bg-brand-50/50 rounded-xl">
                      <input
                        value={browser.name}
                        aria-label="浏览器名称"
                        onChange={(e) => {
                          const next = browsers.map((item, i) => i === index ? { ...item, name: e.target.value } : item)
                          setBrowsers(next)
                          saveConfig({ browsers: next })
                        }}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm w-32 shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={browser.path}>{browser.path}</span>
                      <button
                        onClick={async () => {
                          const picked = await safePickFile(EXE_FILE_FILTER)
                          if (!picked) return
                          const next = browsers.map((item, i) => i === index ? { ...item, path: picked } : item)
                          setBrowsers(next)
                          saveConfig({ browsers: next })
                        }}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-600 hover:border-brand-400 transition-colors"
                      >
                        更换
                      </button>
                      <button
                        onClick={() => {
                          const next = browsers.filter((_, i) => i !== index)
                          setBrowsers(next)
                          saveConfig({ browsers: next })
                        }}
                        aria-label={`删除浏览器 ${browser.name}`}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-rose-600 hover:border-rose-400 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  {browsers.length === 0 && (
                    <p className="text-xs text-slate-400">暂未添加浏览器。网址项目默认使用系统默认浏览器打开。</p>
                  )}
                  <button
                    onClick={async () => {
                      const picked = await safePickFile(EXE_FILE_FILTER)
                      if (!picked) return
                      const base = picked.split(/[\\/]/).pop() || '浏览器'
                      const name = base.replace(/\.[^.]+$/, '') || '浏览器'
                      const next = [
                        ...browsers,
                        { id: crypto.randomUUID(), name, path: picked }
                      ]
                      setBrowsers(next)
                      saveConfig({ browsers: next })
                    }}
                    disabled={browsers.length >= 20}
                    className="px-3 py-1.5 rounded-lg text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                  >
                    + 添加浏览器
                  </button>
                </div>

                <SubTitle>配置预设</SubTitle>
                <p className="text-xs text-slate-500 -mt-1">
                  把「外观、搜索引擎、快捷命令、环境变量、浏览器列表、自动分类规则」导出成一份 JSON，
                  换机器时导入即可。不含应用与分类数据，也不含快捷键、窗口位置这类与机器绑定的设置。
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPreset}
                    disabled={presetBusy}
                    className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-600 hover:border-brand-400 transition-colors disabled:opacity-50"
                  >
                    导出预设
                  </button>
                  <button
                    onClick={handleImportPreset}
                    disabled={presetBusy}
                    className="px-3 py-1.5 rounded-lg text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                  >
                    导入预设
                  </button>
                  {presetBusy && <span className="text-xs text-slate-400">处理中…</span>}
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
                    {updateState === 'checking' ? '检查中…' : '检查更新'}
                  </button>
                </Row>

                {dataHealth && dataHealth.backups.length > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-rose-50/60 border border-rose-200/60 rounded-xl text-xs text-rose-700">
                    <Warning size={16} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">检测到损坏的数据备份</div>
                      <div className="mt-0.5 text-rose-600/90">
                        数据文件曾解析失败，原始内容已留档（当前会话不会覆盖这些文件）。
                        确认下面的留档内容有用，可以恢复回去。
                      </div>
                      <div className="mt-2 space-y-1">
                        {dataHealth.backups.map(backup => (
                          <div key={backup.backupPath} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1">
                            <span className="truncate font-mono text-[11px]" title={backup.fileName}>{backup.fileName}</span>
                            <button
                              onClick={() => onRestoreCorruptBackup(backup)}
                              className="shrink-0 rounded-md border border-rose-300/70 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-50"
                            >
                              恢复
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={onOpenCorruptBackupsDirectory}
                        className="mt-2 text-[11px] underline underline-offset-2"
                      >
                        打开数据目录
                      </button>
                    </div>
                  </div>
                )}

                <SubTitle>日志与目录</SubTitle>
                <div className="space-y-2">
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
                    正在检查更新…
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

function HotkeyButton({ recording, value, label, onClick, onReset }: {
  recording: boolean
  value: string
  /** 用于复位按钮的可访问名；同一分区里可能有 3 个「恢复默认」，必须能区分 */
  label: string
  onClick: () => void
  onReset: (() => void) | null
}) {
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
        {recording ? '请按下快捷键…' : value}
      </button>
      {onReset && (
        <button
          onClick={onReset}
          aria-label={`恢复默认${label}`}
          title="恢复默认"
          className="focus-ring cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600"
        >
          ↺
        </button>
      )}
    </div>
  )
}

function Range({ min, max, step, value, display, unit, label, onChange, onReset }: {
  min: number
  max: number
  step: number
  value: number
  display?: number
  unit: string
  /** 用于复位按钮的可访问名；同一分区里可能有多个「恢复默认」，必须能区分 */
  label: string
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
          aria-label={`恢复默认${label}`}
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
