import { describe, expect, it } from 'vitest'
import type { Config } from '../shared/types'
import { sanitizeConfig } from './validation'

const defaults: Config = {
  hotkey: 'Alt+Space',
  searchHotkey: 'Ctrl+K',
  windowSize: { width: 1050, height: 800 },
  searchEngines: {
    b: { name: 'Bing', url: 'https://www.bing.com/search?q=' }
  },
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
  onboardingCompleted: true
}

describe('sanitizeConfig UI layout', () => {
  it('preserves a supported workspace template', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, layout: 'studio-split' }
    }, defaults)

    expect(result?.ui?.layout).toBe('studio-split')
  })

  it('falls back when an unknown workspace template is supplied', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, layout: 'unknown-layout' }
    }, defaults)

    expect(result?.ui?.layout).toBe('horizon-workspace')
  })

  it('clamps a saved sidebar width to the supported range', () => {
    const tooNarrow = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, sidebarWidth: 80 }
    }, defaults)
    const tooWide = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, sidebarWidth: 900 }
    }, defaults)

    expect(tooNarrow?.ui?.sidebarWidth).toBe(180)
    expect(tooWide?.ui?.sidebarWidth).toBe(420)
  })
})
