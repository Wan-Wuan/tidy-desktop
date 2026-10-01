import { app, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { CONFIG_DIR, CONFIG_FILE, getDefaultConfig, isDataFileCorrupted, readJsonFile } from '../config'
import { guardNativeDialog } from '../dialogGuard'
import { assertSender } from '../ipcGuard'
import { buildConfigPreset, mergeConfigPreset } from '../preset'
import type { Config, PresetExportResult, PresetImportResult } from '../../shared/types'

/** 预设文件大小上限：正常只有几 KB，超过这个量级说明不是预设（或已被写坏） */
const MAX_PRESET_BYTES = 2 * 1024 * 1024

const JSON_FILTER = [{ name: 'JSON 预设', extensions: ['json'] }]

function presetFileName(now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `tidy-desktop-预设-${stamp}.json`
}

export function registerPresetHandlers() {
  /**
   * 导出配置预设。
   * 从**磁盘上的 config.json** 取数据而不是让渲染层传进来：那份才是落盘真相，
   * 也避免把整个 Config 再当一次 IPC 入参来校验。
   */
  ipcMain.handle('export-config-preset', async (event): Promise<PresetExportResult> => {
    const failed: PresetExportResult = { ok: false, path: '', canceled: false }
    if (!assertSender(event)) return failed

    const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
    const preset = buildConfigPreset(config, app.getVersion())
    const defaultPath = path.join(app.getPath('documents') || CONFIG_DIR, presetFileName())

    let target: string
    try {
      const result = await guardNativeDialog(() => dialog.showSaveDialog({
        title: '导出配置预设',
        defaultPath,
        filters: JSON_FILTER
      }))
      if (result.canceled || !result.filePath) return { ok: false, path: '', canceled: true }
      target = result.filePath
    } catch (error) {
      console.error('Failed to open save dialog for preset:', error)
      return failed
    }

    try {
      fs.writeFileSync(target, JSON.stringify(preset, null, 2), 'utf-8')
      return { ok: true, path: target, canceled: false }
    } catch (error) {
      console.error('Failed to write preset file:', error)
      return failed
    }
  })

  /**
   * 导入配置预设。
   *
   * **只读 + 合并，不落盘**：返回合并后的完整配置，由渲染层走既有的
   * `saveConfig` 链路写入。这样写入只有一条路径——损坏数据保护、快捷键重新注册、
   * 失败提示全都不用在这里再实现一遍。
   */
  ipcMain.handle('import-config-preset', async (event): Promise<PresetImportResult> => {
    const failed: PresetImportResult = { ok: false, applied: [], config: null, canceled: false }
    if (!assertSender(event)) return failed
    // 数据文件损坏时连读都不该继续：此时读到的 config 是解析失败后的默认值，
    // 拿它做合并基准等于用默认值覆盖用户配置
    if (isDataFileCorrupted(CONFIG_FILE)) return failed

    let source: string
    try {
      const result = await guardNativeDialog(() => dialog.showOpenDialog({
        title: '导入配置预设',
        properties: ['openFile'],
        filters: JSON_FILTER
      }))
      if (result.canceled || result.filePaths.length === 0) return { ok: false, applied: [], config: null, canceled: true }
      source = result.filePaths[0]
    } catch (error) {
      console.error('Failed to open preset file dialog:', error)
      return failed
    }

    let parsed: unknown
    try {
      if (fs.statSync(source).size > MAX_PRESET_BYTES) return failed
      parsed = JSON.parse(fs.readFileSync(source, 'utf-8'))
    } catch (error) {
      console.error('Failed to read preset file:', error)
      return failed
    }

    const defaults = getDefaultConfig()
    const current = readJsonFile<Config>(CONFIG_FILE, defaults)
    const merged = mergeConfigPreset(current, parsed, defaults)
    if (!merged) return failed

    return { ok: true, applied: merged.applied, config: merged.config, canceled: false }
  })
}
