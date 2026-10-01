// @vitest-environment jsdom
/* 设置页「没有死按钮」守卫：把每个分区的**每个按钮**都点一遍，断言它至少产生一个可观察的效果
   （onSave 被调用，或调用了某个 electronAPI 方法，或触发了某个 props 回调）。
   没有任何效果的按钮，就是用户口中的"点了没反应"。
   本文件用「渲染 → 清记录 → 点一下 → 看有没有反应」的方式覆盖**全量**按钮（含历史按钮），
   与 SettingsModal.newFeatures.test.tsx 的「值正确性」互补：那个管"点完值对不对"，这个管"点了有没有用"。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SettingsModal } from './SettingsModal'
import type { Config } from '../../../../shared/types'

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    hotkey: 'Ctrl+Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1200, height: 800 },
    searchEngines: { b: { name: 'Bing', url: 'https://www.bing.com/search?q=' } },
    ui: {
      gridColumns: 6, cardSize: 'medium', showIcon: true, showName: true,
      borderRadius: 8, theme: 'aurora', layout: 'horizon-workspace', sidebarWidth: 240,
      background: { kind: 'image', value: 'D:\\bg.png', blur: 10, dim: 0.35 },
      fontFamily: 'Segoe UI', uiScale: 1.2, trayIcon: 'D:\\tray.png', searchPlaceholder: 'x'
    },
    everythingHttpPort: 0,
    envVars: [{ key: 'A', value: '1' }],
    portableRoot: 'D:\\Portable',
    preferRelativePath: false,
    browsers: [{ id: 'b1', name: 'chrome', path: 'C:\\chrome.exe' }],
    backupDir: 'D:\\Backups',
    backupKeep: 7,
    ...overrides
  }
}

const API_METHODS = [
  'getAutoStart', 'setAutoStart', 'setShortcutSuspended', 'toggleLaunchPaused', 'selectFolder',
  'selectFile', 'applyTrayIcon', 'confirm', 'exportConfigPreset', 'importConfigPreset', 'detectEverything'
]

function installApi() {
  const api: Record<string, unknown> = {
    getAutoStart: vi.fn().mockResolvedValue(false),
    setAutoStart: vi.fn().mockResolvedValue(true),
    setShortcutSuspended: vi.fn().mockResolvedValue(true),
    toggleLaunchPaused: vi.fn().mockResolvedValue(true),
    selectFolder: vi.fn().mockResolvedValue('D:\\Picked'),
    selectFile: vi.fn().mockResolvedValue('D:\\Picked\\a.png'),
    applyTrayIcon: vi.fn().mockResolvedValue(true),
    confirm: vi.fn().mockResolvedValue(true),
    exportConfigPreset: vi.fn().mockResolvedValue({ ok: true, path: 'D:\\p.json', canceled: false }),
    importConfigPreset: vi.fn().mockResolvedValue({ ok: false, applied: [], config: null, canceled: true }),
    detectEverything: vi.fn().mockResolvedValue({ installed: false, running: false, httpEnabled: false, port: 0, reachable: false })
  }
  ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = api
  return api
}

function nameOf(b: Element): string {
  const raw = b.getAttribute('aria-label') || b.textContent || b.getAttribute('title') || ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, 36)
}

interface Probe { name: string; nth: number }

function collectButtons(): Probe[] {
  const counters = new Map<string, number>()
  const out: Probe[] = []
  for (const b of Array.from(document.querySelectorAll('button'))) {
    const name = nameOf(b)
    if (!name) continue
    const nth = counters.get(name) ?? 0
    counters.set(name, nth + 1)
    out.push({ name, nth })
  }
  return out
}

function clickProbe(probe: Probe): boolean {
  const matches = Array.from(document.querySelectorAll('button')).filter(b => nameOf(b) === probe.name)
  const target = matches[probe.nth]
  if (!target) return false
  fireEvent.click(target)
  return true
}

const SECTIONS = ['常规', '快捷键', '搜索', '外观', '项目', '关于']
const SKIP = new Set(['关闭', '取消'])

describe('设置页按钮扫描', () => {
  beforeEach(() => { cleanup(); window.alert = vi.fn(); installApi() })
  afterEach(() => cleanup())

  it('每个分区的每个按钮点击后都至少产生一个可观察效果（无死按钮）', async () => {
    const dead: string[] = []
    const lines: string[] = []

    for (const section of SECTIONS) {
      // 先渲染一次拿到该分区的按钮清单
      const first = render(
        <SettingsModal
          config={makeConfig()} currentVersion="2.9.10" onClose={vi.fn()} onSave={vi.fn().mockResolvedValue(true)}
          onExportDiagnostics={vi.fn().mockResolvedValue(undefined)} onOpenDataDirectory={vi.fn().mockResolvedValue(true)}
          onOpenBackupsDirectory={vi.fn().mockResolvedValue(true)} onRestoreCorruptBackup={vi.fn()}
          onOpenCorruptBackupsDirectory={vi.fn()} onCheckUpdate={vi.fn().mockResolvedValue(undefined)}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: section }))
      const probes = collectButtons().filter(p => !SECTIONS.includes(p.name) && !SKIP.has(p.name))
      first.unmount()
      cleanup()

      for (const probe of probes) {
        const api = installApi()
        const onSave = vi.fn().mockResolvedValue(true)
        const props = {
          onClose: vi.fn(),
          onExportDiagnostics: vi.fn().mockResolvedValue(undefined),
          onOpenDataDirectory: vi.fn().mockResolvedValue(true),
          onOpenBackupsDirectory: vi.fn().mockResolvedValue(true),
          onRestoreCorruptBackup: vi.fn(),
          onOpenCorruptBackupsDirectory: vi.fn(),
          onCheckUpdate: vi.fn().mockResolvedValue(undefined)
        }
        render(
          <SettingsModal
            config={makeConfig()} currentVersion="2.9.10" onSave={onSave} {...props}
          />
        )
        fireEvent.click(screen.getByRole('button', { name: section }))
        /* 挂载阶段本身会调 getAutoStart / detectEverything —— 清掉调用记录，
           否则每个按钮都会被误判成"有效果"。clearAllMocks 只清记录、保留实现。 */
        vi.clearAllMocks()
        if (!clickProbe(probe)) { cleanup(); continue }
        await new Promise(r => setTimeout(r, 20))

        const ipcUsed = API_METHODS.filter(m => (api[m] as ReturnType<typeof vi.fn>).mock.calls.length > 0)
        const propsUsed = Object.entries(props).filter(([, f]) => (f as ReturnType<typeof vi.fn>).mock.calls.length > 0).map(([k]) => k)
        const effect = onSave.mock.calls.length > 0 || ipcUsed.length > 0 || propsUsed.length > 0
        const tag = `[${section}] ${probe.name}${probe.nth > 0 ? ` #${probe.nth + 1}` : ''}`
        lines.push(`${effect ? 'OK  ' : 'DEAD'} ${tag}${ipcUsed.length ? ` → ipc: ${ipcUsed.join(',')}` : ''}${propsUsed.length ? ` → props: ${propsUsed.join(',')}` : ''}${onSave.mock.calls.length ? ' → save' : ''}`)
        if (!effect) dead.push(tag)
        cleanup()
      }
    }

    console.log('\n===== 按钮扫描结果 =====\n' + lines.join('\n') + `\n\n无效果按钮（${dead.length}）：\n` + dead.join('\n') + '\n========================')
    // 至少要扫到一批按钮，否则说明定位逻辑坏了（会变成"假通过"）
    expect(lines.length).toBeGreaterThan(20)
    expect(dead).toEqual([])
  }, 120000)
})
