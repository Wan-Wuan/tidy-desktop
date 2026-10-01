/**
 * 快捷方式导入过滤。
 *
 * 开始菜单里除了应用本体，还混着 Inno Setup 卸载器（unins000.exe）、
 * Squirrel 更新器（Update.exe）、崩溃上报（crashpad_handler.exe），
 * 以及「使用说明」「帮助」「更新日志」这类文档快捷方式。
 * 它们在扫描阶段和目标应用一样能通过「目标文件存在」的校验，
 * 于是被整批导进应用列表，用户得手动一个个删掉。
 *
 * 判定走两路：
 *  1. 目标可执行文件名——硬信号，卸载器/更新器有稳定命名；
 *  2. 快捷方式显示名——兜底，覆盖「卸载 XXX」「使用说明」这类中文命名。
 * 原则是宁可漏杀不可错杀：只排除明确没有启动价值的项，
 * 名字里只是"含有"关键字的正常应用（如 HelpDesk）不受影响。
 */

import type { ShortcutImportItem } from '../shared/types'

/** 目标文件名（去掉扩展名、转小写）完全等于这些值时才排除。 */
const BLOCKED_TARGET_EXACT = new Set([
  'uninstall',
  'uninstaller',
  'uninst',
  'setup',
  'install',
  'installer',
  'update',
  'updater',
  'upgrade',
  'updateservice',
  'crashpad_handler',
  'crashreporter',
  'crashreportclient',
  'werfault',
  'readme',
  'help',
  'documentation',
  'manual',
  'license',
  'eula'
])

/** 目标文件名以这些前缀开头时排除（覆盖 uninstall_xxx / crashpad_xxx 等变体）。 */
const BLOCKED_TARGET_PREFIXES = ['uninstall', 'crashpad', 'crashreport']

/** 快捷方式显示名命中任一模式即排除。 */
const BLOCKED_DISPLAY_PATTERNS: RegExp[] = [
  /卸载/, // 「卸载 微信」
  /uninstall/i,
  /使用说明/,
  /说明书/,
  /帮助/, // 「帮助」「XXX 帮助」
  /\bhelp\b/i,
  /\bread\s?me\b/i,
  /更新日志/,
  /changelog/i,
  /许可证/,
  /许可协议/,
  /\blicense\b/i
]

/** 目标可执行文件名是否属于「装了也不该出现在启动器里」的那类。 */
export function isNonLaunchableTargetName(targetPath: string): boolean {
  const base = targetPath
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
  if (!base) return false
  if (BLOCKED_TARGET_EXACT.has(base)) return true
  // Inno Setup 卸载器：unins000 / unins001 / unins ...
  if (/^unins\d*$/.test(base)) return true
  return BLOCKED_TARGET_PREFIXES.some(prefix => base.startsWith(prefix))
}

/** 快捷方式显示名是否属于帮助/文档/卸载类。 */
export function isNonLaunchableDisplayName(displayName: string): boolean {
  const name = displayName.trim()
  if (!name) return false
  return BLOCKED_DISPLAY_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * 判断一条扫描结果是否值得导入应用列表。
 * 目录型目标（folder）不参与排除——用户可能就是想把文件夹放进来。
 */
export function isImportableShortcut(item: { name: string; targetPath: string; type: 'app' | 'folder' }): boolean {
  if (item.type === 'folder') return true
  if (isNonLaunchableTargetName(item.targetPath)) return false
  if (isNonLaunchableDisplayName(item.name)) return false
  return true
}

/**
 * 显示名归一化：去掉空白、标点、符号后转小写。
 * 用来识别「同一个应用既出现在开始菜单 .lnk、又出现在 Get-StartApps」——
 * 两边给的名字常常只差一个空格或全半角标点。
 */
export function normalizeDisplayName(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 把 Appx（Store / UWP）扫描结果并入 .lnk 扫描结果。
 *
 * 规则：
 *  - 优先保留 .lnk——它有真实文件路径，「显示所在文件夹」「提取图标」这些能力还可用；
 *  - 目标或显示名任一重复即丢弃 Appx 那条（旧版 Windows 上 Store 应用也会留 .lnk）；
 *  - 两个来源各自限量，商店应用不会挤掉 .lnk 的配额。
 */
export function mergeAppxResults(
  lnkResults: ShortcutImportItem[],
  appxItems: ShortcutImportItem[],
  appxLimit: number
): ShortcutImportItem[] {
  const seenTargets = new Set(lnkResults.map(item => item.targetPath.toLowerCase()))
  const seenNames = new Set(lnkResults.map(item => normalizeDisplayName(item.name)))
  const merged: ShortcutImportItem[] = []

  for (const item of appxItems) {
    if (merged.length >= appxLimit) break
    const target = item.targetPath.toLowerCase()
    const name = normalizeDisplayName(item.name)
    if (seenTargets.has(target) || seenNames.has(name)) continue
    seenTargets.add(target)
    seenNames.add(name)
    merged.push(item)
  }

  return [...lnkResults, ...merged]
}
