import { describe, expect, it } from 'vitest'
import { PRESET_FORMAT, PRESET_KEYS, buildConfigPreset, mergeConfigPreset } from './preset'
import type { Config } from '../shared/types'

/** 造一份最小的合法 Config（默认值来自主进程的 getDefaultConfig 形状） */
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    hotkey: 'Ctrl+Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1050, height: 800 },
    windowPosition: { x: 10, y: 20 },
    searchEngines: { b: { name: 'Bing', url: 'https://www.bing.com/search?q=' } },
    autoStart: false,
    ui: {
      gridColumns: 6,
      cardSize: 'medium',
      showIcon: true,
      showName: true,
      borderRadius: 8,
      theme: 'aurora',
      layout: 'horizon-workspace',
      sidebarWidth: 240
    },
    defaultEngine: 'b',
    autoCategoryRules: [],
    quickActions: [],
    envVars: [],
    portableRoot: null,
    preferRelativePath: false,
    browsers: [],
    ...overrides
  }
}

describe('buildConfigPreset', () => {
  it('只收录约定的 6 个字段', () => {
    const preset = buildConfigPreset(makeConfig({ portableRoot: 'D:\\Portable' }), '2.9.10', new Date('2026-09-29T00:00:00Z'))
    expect(preset.format).toBe(PRESET_FORMAT)
    expect(preset.version).toBe(1)
    expect(preset.appVersion).toBe('2.9.10')
    expect(preset.exportedAt).toBe('2026-09-29T00:00:00.000Z')
    expect(Object.keys(preset.settings).sort()).toEqual([...PRESET_KEYS].sort())
  })

  it('不含项目数据与机器绑定项（hotkey / portableRoot / windowPosition 都不导出）', () => {
    const preset = buildConfigPreset(makeConfig({ portableRoot: 'D:\\Portable' }))
    const serialized = JSON.stringify(preset)
    expect(serialized).not.toContain('Ctrl+Alt+Space')
    expect(serialized).not.toContain('Portable')
    expect(serialized).not.toContain('windowPosition')
    expect(serialized).not.toContain('preferRelativePath')
  })
})

describe('mergeConfigPreset', () => {
  const defaults = makeConfig()

  it('拒绝非对象 / 格式标记不对 / 缺 settings 的输入', () => {
    expect(mergeConfigPreset(defaults, null, defaults)).toBeNull()
    expect(mergeConfigPreset(defaults, [], defaults)).toBeNull()
    expect(mergeConfigPreset(defaults, { format: 'something-else', settings: {} }, defaults)).toBeNull()
    expect(mergeConfigPreset(defaults, { format: PRESET_FORMAT }, defaults)).toBeNull()
  })

  it('一个字段都没命中时返回 null（而不是原样返回当前配置）', () => {
    expect(mergeConfigPreset(defaults, { format: PRESET_FORMAT, settings: { hotkey: 'X' } }, defaults)).toBeNull()
  })

  it('替换命中字段、保留未命中字段', () => {
    const current = makeConfig({
      hotkey: 'Ctrl+Shift+F1',
      searchEngines: { b: { name: 'Bing', url: 'https://www.bing.com/search?q=' } },
      envVars: [{ key: 'OLD', value: 'C:\\Old' }]
    })
    const preset = {
      format: PRESET_FORMAT,
      settings: {
        searchEngines: { g: { name: 'Google', url: 'https://www.google.com/search?q=' } },
        envVars: [{ key: 'SUB', value: 'apps' }]
      }
    }
    const merged = mergeConfigPreset(current, preset, defaults)
    expect(merged).not.toBeNull()
    expect(merged!.applied.sort()).toEqual(['envVars', 'searchEngines'])
    /* ⚠️ `sanitizeConfig` 对 searchEngines 是「与默认值取并集」而不是整体替换
       （既有行为：内置引擎无法通过保存被删掉）。这里断言的是实际语义，
       不是我们期望的语义——改 sanitizeConfig 会波及正常保存链路，不在本次范围。 */
    expect(merged!.config.searchEngines).toEqual({
      b: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
      g: { name: 'Google', url: 'https://www.google.com/search?q=' }
    })
    expect(merged!.config.envVars).toEqual([{ key: 'SUB', value: 'apps' }])
    // 预设没带的字段必须原样保留
    expect(merged!.config.hotkey).toBe('Ctrl+Shift+F1')
  })

  it('显式导出的空数组能真正清空（"改了没生效"的经典坑）', () => {
    const current = makeConfig({ envVars: [{ key: 'A', value: 'B' }], browsers: [{ id: '1', name: 'Chrome', path: 'C:\\c.exe' }] })
    const merged = mergeConfigPreset(current, { format: PRESET_FORMAT, settings: { envVars: [], browsers: [] } }, defaults)
    expect(merged!.applied.sort()).toEqual(['browsers', 'envVars'])
    expect(merged!.config.envVars).toEqual([])
    expect(merged!.config.browsers).toEqual([])
  })

  it('导入内容一样要过清洗：越界数值被夹紧、非法条目被丢弃', () => {
    const preset = {
      format: PRESET_FORMAT,
      settings: {
        ui: { gridColumns: 9999, sidebarWidth: 1, theme: 'not-a-theme' },
        envVars: [{ key: '1BAD', value: 'x' }, { key: 'GOOD', value: 'y' }],
        browsers: [{ id: '', name: 'X', path: 'C:\\x.exe' }, { id: 'ok', name: 'Y', path: 'C:\\y.exe' }]
      }
    }
    const merged = mergeConfigPreset(defaults, preset, defaults)!
    expect(merged.config.ui!.gridColumns).toBe(12)
    expect(merged.config.ui!.sidebarWidth).toBe(180)
    expect(merged.config.ui!.theme).toBe('aurora')
    expect(merged.config.envVars).toEqual([{ key: 'GOOD', value: 'y' }])
    expect(merged.config.browsers).toEqual([{ id: 'ok', name: 'Y', path: 'C:\\y.exe' }])
  })

  it('未知键被忽略，不会污染配置', () => {
    const merged = mergeConfigPreset(defaults, {
      format: PRESET_FORMAT,
      settings: { quickActions: [], hotkey: 'Ctrl+Alt+X', portableRoot: 'D:\\Evil' }
    }, defaults)!
    expect(merged.applied).toEqual(['quickActions'])
    expect(merged.config.hotkey).toBe(defaults.hotkey)
    expect(merged.config.portableRoot).toBeNull()
  })
})
