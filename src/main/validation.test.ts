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

describe('sanitizeConfig new fields', () => {
  it('keeps a supported close action and rejects unknown values', () => {
    const quit = sanitizeConfig({ ...defaults, closeAction: 'quit' }, defaults)
    expect(quit?.closeAction).toBe('quit')

    const invalid = sanitizeConfig({ ...defaults, closeAction: 'explode' }, defaults)
    expect(invalid?.closeAction).toBe('tray')
  })

  it('preserves lastActiveCategoryId and drops non-string values', () => {
    const saved = sanitizeConfig({ ...defaults, lastActiveCategoryId: 'cat-123' }, defaults)
    expect(saved?.lastActiveCategoryId).toBe('cat-123')

    const empty = sanitizeConfig({ ...defaults, lastActiveCategoryId: 42 }, defaults)
    expect(empty?.lastActiveCategoryId).toBeNull()
  })

  it('clamps search box settings to supported ranges', () => {
    const result = sanitizeConfig({
      ...defaults,
      ui: { ...defaults.ui, searchWidth: 2000, searchVerticalRatio: 5, searchMaxResults: 99, sortMode: 'newest' }
    }, defaults)
    expect(result?.ui?.searchWidth).toBe(900)
    expect(result?.ui?.searchVerticalRatio).toBe(0.8)
    expect(result?.ui?.searchMaxResults).toBe(12)
    expect(result?.ui?.sortMode).toBe('manual')
  })

  it('keeps a valid sort mode', () => {
    const result = sanitizeConfig({ ...defaults, ui: { ...defaults.ui, sortMode: 'launchCount' } }, defaults)
    expect(result?.ui?.sortMode).toBe('launchCount')
  })

  it('persists boolean flags as booleans', () => {
    const result = sanitizeConfig({
      ...defaults,
      searchAutoHideOnBlur: true,
      startMinimizedToTray: true,
      mainAutoHideOnBlur: true,
      trayNotified: true,
      windowPosition: { x: 120, y: 80 }
    }, defaults)
    expect(result?.searchAutoHideOnBlur).toBe(true)
    expect(result?.startMinimizedToTray).toBe(true)
    expect(result?.mainAutoHideOnBlur).toBe(true)
    expect(result?.trayNotified).toBe(true)
    expect(result?.windowPosition).toEqual({ x: 120, y: 80 })
  })
})
