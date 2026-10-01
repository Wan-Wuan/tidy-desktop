// @vitest-environment jsdom
/* 设置页「新增功能」的逐按钮回归测试。
   覆盖 P2（外观/字体/托盘/备份/浏览器/搜索占位符）、P0-4 接线（环境变量 / 便携根目录 / 相对路径）、
   P3-5（配置预设）。目的很直接：**每个按钮点下去，都要产生预期的配置变化**——
   以前这里最容易出的是两类问题：① 受控字段白名单漏字段导致"改了保存后却没了"；
   ② 本地 state 与落盘值不同步导致"按钮点了没反应"。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SettingsModal } from './SettingsModal'
import type { Config, UISettings } from '../../../../shared/types'

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    hotkey: 'Ctrl+Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1200, height: 800 },
    searchEngines: { b: { name: 'Bing', url: 'https://www.bing.com/search?q=' } },
    ui: {
      gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true,
      borderRadius: 8, theme: 'aurora', layout: 'horizon-workspace', sidebarWidth: 240
    },
    everythingHttpPort: 0,
    ...overrides
  }
}

type Api = Record<string, unknown>

function installApi(extra: Api = {}) {
  const api: Api = {
    getAutoStart: vi.fn().mockResolvedValue(false),
    setAutoStart: vi.fn().mockResolvedValue(true),
    setShortcutSuspended: vi.fn().mockResolvedValue(true),
    toggleLaunchPaused: vi.fn().mockResolvedValue(true),
    selectFolder: vi.fn().mockResolvedValue('D:\\Picked'),
    selectFile: vi.fn().mockResolvedValue('D:\\Picked\\a.png'),
    applyTrayIcon: vi.fn().mockResolvedValue(true),
    confirm: vi.fn().mockResolvedValue(true),
    exportConfigPreset: vi.fn().mockResolvedValue({ ok: true, path: 'D:\\preset.json', canceled: false }),
    importConfigPreset: vi.fn().mockResolvedValue({ ok: false, applied: [], config: null, canceled: true }),
    detectEverything: vi.fn().mockResolvedValue({
      installed: false, running: false, httpEnabled: false, port: 0, reachable: false
    }),
    ...extra
  }
  ;(window as unknown as { electronAPI: Api }).electronAPI = api
  return api
}

function renderModal(config: Config, onSave = vi.fn().mockResolvedValue(true)) {
  render(
    <SettingsModal
      config={config}
      currentVersion="2.9.10"
      onClose={vi.fn()}
      onSave={onSave}
      onExportDiagnostics={vi.fn().mockResolvedValue(undefined)}
      onOpenDataDirectory={vi.fn().mockResolvedValue(true)}
      onOpenBackupsDirectory={vi.fn().mockResolvedValue(true)}
      onRestoreCorruptBackup={vi.fn()}
      onOpenCorruptBackupsDirectory={vi.fn()}
    />
  )
  return onSave
}

/** 取最后一次 onSave 收到的配置 */
function saved(onSave: ReturnType<typeof vi.fn>): Config {
  return onSave.mock.calls[onSave.mock.calls.length - 1][0] as Config
}

/** 按 Row 的 label 定位到那一行，避免依赖 DOM 顺序 */
function row(label: string): HTMLElement {
  const el = screen.getByText(label).closest('div.justify-between')
  if (!el) throw new Error(`找不到 Row：${label}`)
  return el as HTMLElement
}

function rangeIn(label: string): HTMLInputElement {
  const el = row(label).querySelector('input[type="range"]')
  if (!el) throw new Error(`Row「${label}」里没有 range`)
  return el as HTMLInputElement
}

function uiOf(onSave: ReturnType<typeof vi.fn>): UISettings {
  return saved(onSave).ui as UISettings
}

const goTo = (section: string) => fireEvent.click(screen.getByRole('button', { name: section }))

beforeEach(() => {
  cleanup()
  window.alert = vi.fn()
  installApi()
})
afterEach(() => cleanup())

/* ───────────────────────── 外观：背景（P2-1） ───────────────────────── */

describe('外观 → 背景', () => {
  it('切到「纯色」会写入 background（不默认压暗）', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '纯色' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toEqual({ kind: 'color', value: '#E8EEFF', blur: 0, dim: 0 })
  })

  it('切到「图片」会写入 background（默认暗化 35%）', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '图片' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toEqual({ kind: 'image', value: '', blur: 0, dim: 0.35 })
  })

  it('切回「无」会清空 background', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'image', value: 'D:\\a.png', blur: 0, dim: 0.35 } } as UISettings
    }))
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '无' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toBeNull()
  })

  it('背景颜色选择器写入颜色值', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'color', value: '#E8EEFF', blur: 0, dim: 0 } } as UISettings
    }))
    goTo('外观')
    fireEvent.change(screen.getByLabelText('背景颜色'), { target: { value: '#123456' } })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toMatchObject({ kind: 'color', value: '#123456' })
  })

  it('「选择背景图片」把选到的路径写进 background.value', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'image', value: '', blur: 0, dim: 0.35 } } as UISettings
    }))
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '选择背景图片' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toMatchObject({ kind: 'image', value: 'D:\\Picked\\a.png' })
  })

  it('模糊 / 暗化滑块与「恢复默认」都能落盘', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'image', value: 'D:\\a.png', blur: 10, dim: 0.5 } } as UISettings
    }))
    goTo('外观')

    fireEvent.change(rangeIn('模糊'), { target: { value: '20' } })
    await waitFor(() => expect(uiOf(onSave).background).toMatchObject({ blur: 20 }))

    fireEvent.change(rangeIn('暗化'), { target: { value: '60' } })
    await waitFor(() => expect(uiOf(onSave).background).toMatchObject({ dim: 0.6 }))
  })
})

/* ───────────────────── 外观：字体 / 托盘图标（P2-2 / P2-4） ───────────────────── */

describe('外观 → 字体与托盘图标', () => {
  it('字体族下拉写入 ui.fontFamily', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    const select = row('字体族').querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Microsoft YaHei' } })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).fontFamily).toBe('Microsoft YaHei')
  })

  it('字号缩放滑块写入 ui.uiScale', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.change(rangeIn('字号缩放'), { target: { value: '120' } })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).uiScale).toBeCloseTo(1.2)
  })

  it('托盘图标「选择托盘图标」写入 trayIcon 并立即刷新托盘', async () => {
    const api = installApi()
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '选择托盘图标' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).trayIcon).toBe('D:\\Picked\\a.png')
    await waitFor(() => expect(api.applyTrayIcon).toHaveBeenCalled())
  })

  it('托盘图标「恢复默认」清空 trayIcon 并立即刷新托盘', async () => {
    const api = installApi()
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, trayIcon: 'D:\\old.png' } as UISettings
    }))
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '恢复默认托盘图标' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).trayIcon).toBeNull()
    await waitFor(() => expect(api.applyTrayIcon).toHaveBeenCalled())
  })
})

/* ───────────────────── 常规：自动备份（P2-7） ───────────────────── */

describe('常规 → 数据备份', () => {
  it('「每日自动备份」开关能关掉', async () => {
    const onSave = renderModal(makeConfig())
    // 常规分区里「开机自启动」也是一个 switch，必须按名字精确定位
    fireEvent.click(screen.getByRole('switch', { name: '每日自动备份' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).backupEnabled).toBe(false)
  })

  it('「选择目录」写入 backupDir', async () => {
    const onSave = renderModal(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: '选择目录' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).backupDir).toBe('D:\\Picked')
  })

  it('「恢复默认」把 backupDir 置回 null', async () => {
    const onSave = renderModal(makeConfig({ backupDir: 'D:\\Backups' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复默认备份目录' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).backupDir).toBeNull()
  })

  it('「保留份数」滑块写入 backupKeep', async () => {
    const onSave = renderModal(makeConfig())
    fireEvent.change(rangeIn('保留份数'), { target: { value: '14' } })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).backupKeep).toBe(14)
  })
})

/* ───────────────────── 搜索：占位符（P2-8） ───────────────────── */

describe('搜索 → 搜索占位符', () => {
  it('输入占位符写入 ui.searchPlaceholder', async () => {
    const onSave = renderModal(makeConfig())
    goTo('搜索')
    fireEvent.change(screen.getByPlaceholderText('搜索应用或文件夹…'), { target: { value: '找点什么' } })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).searchPlaceholder).toBe('找点什么')
  })
})

/* ───────────────────── 项目：环境变量 / 便携根目录（P0-4） ───────────────────── */

describe('项目 → 环境变量与便携根目录', () => {
  it('「+ 添加变量」追加一行', async () => {
    const onSave = renderModal(makeConfig())
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '+ 添加变量' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).envVars).toEqual([{ key: '', value: '' }])
  })

  it('变量名 / 变量值输入都会落盘', async () => {
    const onSave = renderModal(makeConfig({ envVars: [{ key: 'A', value: 'B' }] }))
    goTo('项目')
    fireEvent.change(screen.getByLabelText('环境变量名'), { target: { value: 'SUB' } })
    await waitFor(() => expect(saved(onSave).envVars).toEqual([{ key: 'SUB', value: 'B' }]))

    fireEvent.change(screen.getByLabelText('环境变量值'), { target: { value: 'apps' } })
    await waitFor(() => expect(saved(onSave).envVars).toEqual([{ key: 'SUB', value: 'apps' }]))
  })

  it('「删除」移除对应变量', async () => {
    const onSave = renderModal(makeConfig({
      envVars: [{ key: 'A', value: '1' }, { key: 'B', value: '2' }]
    }))
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '删除环境变量 A' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).envVars).toEqual([{ key: 'B', value: '2' }])
  })

  it('便携根目录「选择」写入 portableRoot', async () => {
    const onSave = renderModal(makeConfig())
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '选择' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).portableRoot).toBe('D:\\Picked')
  })

  it('便携根目录「清除」置回 null', async () => {
    const onSave = renderModal(makeConfig({ portableRoot: 'D:\\Portable' }))
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '清除' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).portableRoot).toBeNull()
  })

  it('「优先保存相对路径」开关写入 preferRelativePath', async () => {
    const onSave = renderModal(makeConfig({ portableRoot: 'D:\\Portable' }))
    goTo('项目')
    fireEvent.click(screen.getByRole('switch', { name: '优先保存相对路径' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).preferRelativePath).toBe(true)
  })
})

/* ───────────────────── 项目：浏览器（P2-6） ───────────────────── */

describe('项目 → 浏览器列表', () => {
  it('「+ 添加浏览器」用选中的 exe 生成条目', async () => {
    const api = installApi()
    ;(api.selectFile as ReturnType<typeof vi.fn>).mockResolvedValue('C:\\Program Files\\Chrome\\chrome.exe')
    const onSave = renderModal(makeConfig())
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '+ 添加浏览器' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const list = saved(onSave).browsers!
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'chrome', path: 'C:\\Program Files\\Chrome\\chrome.exe' })
  })

  it('名称输入 / 「更换」路径 / 「删除」都能落盘', async () => {
    const api = installApi()
    ;(api.selectFile as ReturnType<typeof vi.fn>).mockResolvedValue('C:\\Other\\edge.exe')
    const onSave = renderModal(makeConfig({
      browsers: [{ id: 'b1', name: 'chrome', path: 'C:\\chrome.exe' }]
    }))
    goTo('项目')

    fireEvent.change(screen.getByLabelText('浏览器名称'), { target: { value: 'Chrome' } })
    await waitFor(() => expect(saved(onSave).browsers![0].name).toBe('Chrome'))

    fireEvent.click(screen.getByRole('button', { name: '更换' }))
    await waitFor(() => expect(saved(onSave).browsers![0].path).toBe('C:\\Other\\edge.exe'))

    fireEvent.click(screen.getByRole('button', { name: '删除浏览器 Chrome' }))
    await waitFor(() => expect(saved(onSave).browsers).toEqual([]))
  })
})

/* ───────────────────── 项目：配置预设（P3-5） ───────────────────── */

describe('项目 → 配置预设', () => {
  it('「导出预设」调用导出接口并回报路径', async () => {
    const api = installApi()
    renderModal(makeConfig())
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '导出预设' }))

    await waitFor(() => expect(api.exportConfigPreset).toHaveBeenCalled())
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('D:\\preset.json')))
  })

  it('用户取消导出时不弹任何提示', async () => {
    const api = installApi({ exportConfigPreset: vi.fn().mockResolvedValue({ ok: false, path: '', canceled: true }) })
    renderModal(makeConfig())
    goTo('项目')
    fireEvent.click(screen.getByRole('button', { name: '导出预设' }))

    await waitFor(() => expect(api.exportConfigPreset).toHaveBeenCalled())
    expect(window.alert).not.toHaveBeenCalled()
  })
})

/* ───────────── 值正确性：背景类型切换时 blur / dim 的归属 ───────────── */

describe('外观 → 背景类型切换', () => {
  it('图片 → 纯色：不继承图片的暗化与模糊（否则用户挑的纯色会被莫名压暗）', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'image', value: 'D://a.png', blur: 20, dim: 0.6 } } as UISettings
    }))
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '纯色' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toEqual({ kind: 'color', value: '#E8EEFF', blur: 0, dim: 0 })
  })

  it('纯色 → 图片：拿到图片的默认暗化 0.35（否则亮图不压暗、字会糊）', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'color', value: '#123456', blur: 0, dim: 0 } } as UISettings
    }))
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '图片' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toEqual({ kind: 'image', value: '', blur: 0, dim: 0.35 })
  })

  it('同类型内重复点击保留用户已调好的值', async () => {
    const onSave = renderModal(makeConfig({
      ui: { ...makeConfig().ui, background: { kind: 'image', value: 'D://a.png', blur: 20, dim: 0.6 } } as UISettings
    }))
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '图片' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(uiOf(onSave).background).toMatchObject({ value: 'D://a.png', blur: 20, dim: 0.6 })
  })
})

/* ───────────── 值正确性：外观其它控件 ───────────── */

describe('外观 → 主题 / 模板 / 项目展示', () => {
  it('主题模式写入 ui.theme', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    await waitFor(() => expect(uiOf(onSave).theme).toBe('dark'))
  })

  it('主题色预设写入 ui.accentColor', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.click(screen.getByRole('button', { name: '主题色：翠绿' }))
    await waitFor(() => expect(uiOf(onSave).accentColor).toBeTruthy())
  })

  it('选项卡无字模式开关写入 ui.toolbarIconOnly', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    fireEvent.click(row('选项卡无字模式').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(uiOf(onSave).toolbarIconOnly).toBe(false))
  })

  it('界面模板按钮写入 ui.layout', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')
    const template = screen.getAllByRole('button').find(b => (b.textContent || '').includes('指挥侧栏'))!
    fireEvent.click(template)
    await waitFor(() => expect(uiOf(onSave).layout).toBe('command-rail'))
  })

  it('排序方式 / 每行数量 / 卡片大小 / 圆角 / 图标 / 名称都能落盘', async () => {
    const onSave = renderModal(makeConfig())
    goTo('外观')

    fireEvent.click(screen.getByRole('button', { name: '常用' }))
    await waitFor(() => expect(uiOf(onSave).sortMode).toBe('launchCount'))

    fireEvent.click(screen.getByRole('button', { name: '8' }))
    await waitFor(() => expect(uiOf(onSave).gridColumns).toBe(8))

    fireEvent.click(screen.getByRole('button', { name: '大' }))
    await waitFor(() => expect(uiOf(onSave).cardSize).toBe('large'))

    fireEvent.change(rangeIn('圆角大小'), { target: { value: '16' } })
    await waitFor(() => expect(uiOf(onSave).borderRadius).toBe(16))

    fireEvent.click(row('显示图标').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(uiOf(onSave).showIcon).toBe(false))

    fireEvent.click(row('显示名称').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(uiOf(onSave).showName).toBe(false))
  })
})

/* ───────────── 值正确性：搜索 / 常规 / 快捷命令 ───────────── */

describe('搜索 → 各控件', () => {
  it('玻璃主题 / 透明度 / 提示开关 / 宽度 / 垂直位置 / 结果条数', async () => {
    const onSave = renderModal(makeConfig())
    goTo('搜索')

    fireEvent.click(screen.getByRole('button', { name: '浅色云瓷' }))
    await waitFor(() => expect(uiOf(onSave).searchTheme).toBe('light'))

    fireEvent.change(rangeIn('玻璃透明度'), { target: { value: '85' } })
    await waitFor(() => expect(uiOf(onSave).searchOpacity).toBeCloseTo(0.85))

    fireEvent.click(row('显示底部提示').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(uiOf(onSave).searchHintsVisible).toBe(false))

    fireEvent.change(rangeIn('搜索框宽度'), { target: { value: '800' } })
    await waitFor(() => expect(uiOf(onSave).searchWidth).toBe(800))

    fireEvent.change(rangeIn('垂直位置'), { target: { value: '0.5' } })
    await waitFor(() => expect(uiOf(onSave).searchVerticalRatio).toBeCloseTo(0.5))

    fireEvent.click(screen.getByRole('button', { name: '12' }))
    await waitFor(() => expect(uiOf(onSave).searchMaxResults).toBe(12))
  })

  it('失焦自动隐藏开关写入 searchAutoHideOnBlur', async () => {
    const onSave = renderModal(makeConfig())
    goTo('搜索')
    fireEvent.click(row('失焦自动隐藏').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(saved(onSave).searchAutoHideOnBlur).toBe(true))
  })

  it('快捷命令开关写入 quickActions', async () => {
    const onSave = renderModal(makeConfig({
      quickActions: [
        { key: '>shutdown', name: '关机', command: 'shutdown', enabled: true },
        { key: '>lock', name: '锁定电脑', command: 'lock', enabled: true }
      ]
    }))
    goTo('搜索')
    fireEvent.click(screen.getByText('关机').closest('div.justify-between')!.querySelector('button[role="switch"]')!)

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).quickActions![0].enabled).toBe(false)
    expect(saved(onSave).quickActions![1].enabled).toBe(true)
  })
})

describe('常规 → 系统', () => {
  it('开机自启动同时调 setAutoStart 并落盘', async () => {
    const api = installApi()
    const onSave = renderModal(makeConfig())
    fireEvent.click(row('开机自启动').querySelector('button[role="switch"]')!)

    await waitFor(() => expect(api.setAutoStart).toHaveBeenCalledWith(true))
    expect(saved(onSave).autoStart).toBe(true)
  })

  it('启动时最小化 / 关闭行为 / 主界面失焦隐藏', async () => {
    const onSave = renderModal(makeConfig())
    fireEvent.click(row('启动时最小化到托盘').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(saved(onSave).startMinimizedToTray).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '退出程序' }))
    await waitFor(() => expect(saved(onSave).closeAction).toBe('quit'))

    fireEvent.click(row('主界面失焦自动隐藏').querySelector('button[role="switch"]')!)
    await waitFor(() => expect(saved(onSave).mainAutoHideOnBlur).toBe(true))
  })
})
