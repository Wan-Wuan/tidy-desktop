/**
 * 配置预设（P3-5）：把「可以搬走的偏好」打包成一份 JSON。
 *
 * 只收录**跨机器、跨安装仍然有意义**且不涉及项目数据的字段：
 *   `ui` / `autoCategoryRules` / `quickActions` / `searchEngines` / `envVars` / `browsers`
 *
 * 刻意排除：
 *  · `apps` / `categories` / `collections` —— 那是**数据**不是偏好，应该走数据备份而不是预设；
 *  · `hotkey` / `searchHotkey` / `pauseHotkey` / `windowPosition` / `everythingHttpPort` ——
 *    与具体机器绑定，导到另一台机器上大概率是错的（甚至被别的程序占用）；
 *  · `backupDir` / `portableRoot` / `trayIcon` / `background` 里的绝对路径 —— 同上。
 *
 * 导入必须过 `sanitizeConfig`：预设文件是外部输入，可能被手改过，也可能来自
 * 旧版本（字段缺失 / 多出未知键）。
 */

import type { Config } from '../shared/types'
import { sanitizeConfig } from './validation'

/** 预设里允许出现的字段（同时也是「导入后真正生效的字段」白名单） */
export const PRESET_KEYS = ['ui', 'autoCategoryRules', 'quickActions', 'searchEngines', 'envVars', 'browsers'] as const

export type PresetKey = typeof PRESET_KEYS[number]

/** 文件内的格式标记：导入时用它确认「这确实是我们导出的预设」 */
export const PRESET_FORMAT = 'tidy-desktop-preset'
export const PRESET_VERSION = 1

export interface ConfigPreset {
  format: typeof PRESET_FORMAT
  version: number
  /** 导出时间（ISO 字符串），仅供人看 */
  exportedAt: string
  /** 导出时的应用版本，排查用 */
  appVersion?: string
  settings: Partial<Pick<Config, PresetKey>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 从当前配置里挑出预设字段 */
export function buildConfigPreset(config: Config, appVersion?: string, now: Date = new Date()): ConfigPreset {
  return {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    settings: {
      ui: config.ui,
      autoCategoryRules: config.autoCategoryRules ?? [],
      quickActions: config.quickActions ?? [],
      searchEngines: config.searchEngines ?? {},
      envVars: config.envVars ?? [],
      browsers: config.browsers ?? []
    }
  }
}

export interface MergePresetResult {
  config: Config
  /** 真正被写入的字段名（预设里缺的字段不会出现在这里） */
  applied: PresetKey[]
}

/**
 * 把预设合并进当前配置。
 *
 * @returns 不是合法预设、或一个字段都没命中时返回 `null`；成功返回新配置与生效字段。
 */
export function mergeConfigPreset(current: Config, raw: unknown, defaults: Config): MergePresetResult | null {
  if (!isRecord(raw)) return null
  if (raw.format !== PRESET_FORMAT) return null
  const settings = isRecord(raw.settings) ? raw.settings : null
  if (!settings) return null

  const applied: PresetKey[] = []
  const candidate: Record<string, unknown> = { ...current }
  for (const key of PRESET_KEYS) {
    // 用 in 而不是取值判空：显式导出的空数组（比如"清空所有环境变量"）也要能生效
    if (!(key in settings)) continue
    applied.push(key)
    candidate[key] = settings[key]
  }
  if (applied.length === 0) return null

  const config = sanitizeConfig(candidate, defaults)
  if (!config) return null
  return { config, applied }
}
