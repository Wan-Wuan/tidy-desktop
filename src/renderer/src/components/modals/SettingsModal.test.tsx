// @vitest-environment jsdom
/* SettingsModal 保存配置的回归测试。
   背景：saveConfig 里曾用一张"受控字段白名单"重建 config，只把白名单里的 overrides 落盘，
   其余键被 `...config` 静默覆盖。本机文件搜索的 everythingHttpPort 直接改 config 并传
   overrides，恰好不在白名单里 —— 结果「在设置里改了端口，保存后却没了」。
   这里把"任何显式传入的 override 都必须落盘"钉成断言。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SettingsModal } from './SettingsModal'
import type { Config } from '../../../../shared/types'

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    hotkey: 'Ctrl+Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1200, height: 800 },
    searchEngines: { b: { name: 'Bing', url: 'https://www.bing.com/search?q=' } },
    ui: { gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true, borderRadius: 8, theme: 'aurora' },
    everythingHttpPort: 0,
    ...overrides
  }
}

function renderModal(config: Config, onSave = vi.fn().mockResolvedValue(true)) {
  render(
    <SettingsModal
      config={config}
      currentVersion="2.9.4"
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

describe('SettingsModal 保存配置：overrides 不得被静默丢弃', () => {
  beforeEach(() => {
    cleanup()
    window.alert = vi.fn()
    ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getAutoStart: vi.fn().mockResolvedValue(false),
      setAutoStart: vi.fn().mockResolvedValue(true),
      setShortcutSuspended: vi.fn().mockResolvedValue(true),
      toggleLaunchPaused: vi.fn().mockResolvedValue(true),
      selectFolder: vi.fn().mockResolvedValue('D:\\MySearchRoot'),
      confirm: vi.fn().mockResolvedValue(true),
      detectEverything: vi.fn().mockResolvedValue({
        installed: false,
        running: false,
        httpEnabled: false,
        port: 0,
        reachable: false
      })
    }
  })
  afterEach(() => cleanup())

  it('修改 Everything 端口后必须落盘（防止受控字段白名单再漏字段）', async () => {
    const onSave = renderModal(makeConfig())

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    const portInput = screen.getByRole('spinbutton')
    fireEvent.change(portInput, { target: { value: '8080' } })

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0] as Config
    expect(saved.everythingHttpPort).toBe(8080)
  })
})

/* 「项目」分区是 P0-4 接线 + P3-5 预设的入口，同样靠受控字段白名单落盘，
   一起钉住：新增字段若忘了进白名单，就会重演"改了保存后却没了"。 */
function lastSaved(onSave: ReturnType<typeof vi.fn>): Config {
  return onSave.mock.calls[onSave.mock.calls.length - 1][0] as Config
}

describe('SettingsModal 项目分区', () => {
  beforeEach(() => {
    cleanup()
    window.alert = vi.fn()
    ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      getAutoStart: vi.fn().mockResolvedValue(false),
      setAutoStart: vi.fn().mockResolvedValue(true),
      setShortcutSuspended: vi.fn().mockResolvedValue(true),
      toggleLaunchPaused: vi.fn().mockResolvedValue(true),
      selectFolder: vi.fn().mockResolvedValue('D:\\Portable'),
      confirm: vi.fn().mockResolvedValue(true),
      detectEverything: vi.fn().mockResolvedValue({
        installed: false, running: false, httpEnabled: false, port: 0, reachable: false
      })
    }
  })
  afterEach(() => cleanup())

  it('新增环境变量会写进配置', async () => {
    const onSave = renderModal(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 添加变量' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(lastSaved(onSave).envVars).toEqual([{ key: '', value: '' }])
  })

  it('便携根目录与「优先保存相对路径」开关都会落盘', async () => {
    const onSave = renderModal(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: '项目' }))

    fireEvent.click(screen.getByRole('button', { name: '选择' }))
    await waitFor(() => expect(lastSaved(onSave).portableRoot).toBe('D:\\Portable'))

    fireEvent.click(screen.getByRole('switch', { name: '优先保存相对路径' }))
    await waitFor(() => expect(lastSaved(onSave).preferRelativePath).toBe(true))
  })

  it('导入预设：按合并结果保存（含本地输入框状态的同步）', async () => {
    const imported = makeConfig({
      envVars: [{ key: 'SUB', value: 'apps' }],
      preferRelativePath: true
    })
    ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      ...(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI,
      importConfigPreset: vi.fn().mockResolvedValue({ ok: true, applied: ['envVars', 'preferRelativePath'], config: imported, canceled: false })
    }

    const onSave = renderModal(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '导入预设' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(lastSaved(onSave).envVars).toEqual([{ key: 'SUB', value: 'apps' }])
    expect(lastSaved(onSave).preferRelativePath).toBe(true)
    // 本地输入框要跟着新配置走，否则面板继续显示导入前的旧值
    expect((screen.getByLabelText('环境变量名') as HTMLInputElement).value).toBe('SUB')
  })

  it('预设文件无效时报错且不保存', async () => {
    ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      ...(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI,
      importConfigPreset: vi.fn().mockResolvedValue({ ok: false, applied: [], config: null, canceled: false })
    }

    const onSave = renderModal(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '导入预设' }))

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('导入失败：该文件不是有效的配置预设。'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('用户在文件对话框里取消时不报错也不保存', async () => {
    ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
      ...(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI,
      importConfigPreset: vi.fn().mockResolvedValue({ ok: false, applied: [], config: null, canceled: true })
    }

    const onSave = renderModal(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: '项目' }))
    fireEvent.click(screen.getByRole('button', { name: '导入预设' }))

    // 取消是正常路径，不该弹任何提示
    await waitFor(() => expect(window.electronAPI.importConfigPreset).toHaveBeenCalled())
    expect(onSave).not.toHaveBeenCalled()
    expect(window.alert).not.toHaveBeenCalled()
  })
})
