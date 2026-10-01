import { describe, expect, it } from 'vitest'
import type { ShortcutImportItem } from '../shared/types'
import {
  isImportableShortcut,
  isNonLaunchableDisplayName,
  isNonLaunchableTargetName,
  mergeAppxResults,
  normalizeDisplayName
} from './shortcutFilter'

const item = (name: string, targetPath: string, type: 'app' | 'folder' = 'app') => ({ name, targetPath, type })

const importItem = (
  name: string,
  targetPath: string,
  source: ShortcutImportItem['source'] = 'startMenu'
): ShortcutImportItem => ({ name, path: targetPath, targetPath, icon: '', type: 'app', source })

const aumidTarget = (aumid: string) => `shell:AppsFolder\\${aumid}`

describe('isNonLaunchableTargetName', () => {
  it('识别 Inno Setup 卸载器', () => {
    expect(isNonLaunchableTargetName('C:\\Program Files\\App\\unins000.exe')).toBe(true)
    expect(isNonLaunchableTargetName('C:\\Program Files\\App\\unins001.exe')).toBe(true)
    expect(isNonLaunchableTargetName('C:\\Program Files\\App\\unins.exe')).toBe(true)
  })

  it('识别 Squirrel / 各类更新器', () => {
    expect(isNonLaunchableTargetName('C:\\Users\\me\\AppData\\Local\\Slack\\Update.exe')).toBe(true)
    expect(isNonLaunchableTargetName('C:\\App\\updater.exe')).toBe(true)
  })

  it('识别崩溃上报进程', () => {
    expect(isNonLaunchableTargetName('C:\\App\\crashpad_handler.exe')).toBe(true)
    expect(isNonLaunchableTargetName('C:\\App\\CrashReporter.exe')).toBe(true)
  })

  it('识别安装器与文档', () => {
    expect(isNonLaunchableTargetName('D:\\downloads\\setup.exe')).toBe(true)
    expect(isNonLaunchableTargetName('C:\\App\\readme.exe')).toBe(true)
  })

  it('不误杀名字里带关键字的正常应用', () => {
    expect(isNonLaunchableTargetName('C:\\App\\HelpDesk.exe')).toBe(false)
    expect(isNonLaunchableTargetName('C:\\App\\InstallerPlus.exe')).toBe(false)
    expect(isNonLaunchableTargetName('C:\\App\\WeChat.exe')).toBe(false)
    expect(isNonLaunchableTargetName('C:\\App\\Updates Manager Pro.exe')).toBe(false)
  })

  it('空路径不判为不可启动', () => {
    expect(isNonLaunchableTargetName('')).toBe(false)
  })
})

describe('isNonLaunchableDisplayName', () => {
  it('识别中文卸载与文档命名', () => {
    expect(isNonLaunchableDisplayName('卸载 微信')).toBe(true)
    expect(isNonLaunchableDisplayName('使用说明')).toBe(true)
    expect(isNonLaunchableDisplayName('更新日志')).toBe(true)
    expect(isNonLaunchableDisplayName('许可协议')).toBe(true)
  })

  it('识别英文卸载与文档命名', () => {
    expect(isNonLaunchableDisplayName('Uninstall Tool')).toBe(true)
    expect(isNonLaunchableDisplayName('ReadMe')).toBe(true)
    expect(isNonLaunchableDisplayName('Help')).toBe(true)
  })

  it('不误杀正常应用名', () => {
    expect(isNonLaunchableDisplayName('微信')).toBe(false)
    expect(isNonLaunchableDisplayName('Visual Studio Code')).toBe(false)
    expect(isNonLaunchableDisplayName('HelpDesk Pro')).toBe(false)
    expect(isNonLaunchableDisplayName('')).toBe(false)
  })
})

describe('isImportableShortcut', () => {
  it('排除指向卸载器的快捷方式，即使显示名看着正常', () => {
    expect(isImportableShortcut(item('微信', 'C:\\Program Files\\Tencent\\WeChat\\unins000.exe'))).toBe(false)
  })

  it('排除显示名为「卸载 XXX」的快捷方式', () => {
    expect(isImportableShortcut(item('卸载 微信', 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe'))).toBe(false)
  })

  it('保留正常应用', () => {
    expect(isImportableShortcut(item('微信', 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe'))).toBe(true)
  })

  it('目录型目标不参与排除', () => {
    expect(isImportableShortcut(item('卸载说明', 'C:\\Some\\Folder', 'folder'))).toBe(true)
  })
})

describe('normalizeDisplayName', () => {
  it('抹掉空白、标点与符号', () => {
    expect(normalizeDisplayName('Visual Studio Code')).toBe('visualstudiocode')
    expect(normalizeDisplayName('Visual Studio  Code')).toBe('visualstudiocode')
    expect(normalizeDisplayName('Microsoft Store')).toBe('microsoftstore')
    expect(normalizeDisplayName('Microsoft  Store ')).toBe('microsoftstore')
  })

  it('保留中日韩文字与数字', () => {
    expect(normalizeDisplayName('微信')).toBe('微信')
    expect(normalizeDisplayName('网易云音乐 3')).toBe('网易云音乐3')
  })

  it('不同应用归一化后仍然不同', () => {
    expect(normalizeDisplayName('Windows Terminal')).not.toBe(normalizeDisplayName('Windows Terminal Preview'))
  })
})

describe('mergeAppxResults', () => {
  const lnk = importItem('微信', 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe')
  const appx = importItem('计算器', aumidTarget('Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'), 'appx')

  it('把 Appx 结果附在 .lnk 结果之后', () => {
    const merged = mergeAppxResults([lnk], [appx], 120)
    expect(merged.map(entry => entry.name)).toEqual(['微信', '计算器'])
  })

  it('目标重复时丢弃 Appx 那条（优先保留 .lnk）', () => {
    const duplicated = importItem('微信', lnk.targetPath, 'appx')
    expect(mergeAppxResults([lnk], [duplicated], 120)).toHaveLength(1)
  })

  it('显示名重复时丢弃 Appx 那条（忽略大小写与空格）', () => {
    const storeLnk = importItem('Microsoft Store', 'C:\\Windows\\SystemApps\\Store.exe')
    const storeAppx = importItem('Microsoft  Store', aumidTarget('Microsoft.WindowsStore_8wekyb3d8bbwe!App'), 'appx')
    const merged = mergeAppxResults([storeLnk], [storeAppx], 120)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('startMenu')
  })

  it('Appx 侧自己的重复也会被去掉', () => {
    const again = importItem('计算器', appx.targetPath, 'appx')
    expect(mergeAppxResults([], [appx, again], 120)).toHaveLength(1)
  })

  it('受 appxLimit 限制，且不影响 .lnk 的配额', () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      importItem(`应用${index}`, aumidTarget(`Vendor.App${index}_8wekyb3d8bbwe!App`), 'appx')
    )
    const merged = mergeAppxResults([lnk], many, 2)
    expect(merged).toHaveLength(3)
    expect(merged[0]).toBe(lnk)
  })

  it('Appx 为空时原样返回 .lnk 结果', () => {
    expect(mergeAppxResults([lnk], [], 120)).toEqual([lnk])
  })

  it('两边都为空时返回空数组', () => {
    expect(mergeAppxResults([], [], 120)).toEqual([])
  })
})
