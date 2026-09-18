import { app } from 'electron'
import path from 'path'
import fs from 'fs'

import { recoverInterruptedWrites, writeJsonFilesAtomically } from './jsonTransaction'

export { writeJsonFilesAtomically, recoverInterruptedWrites }

export const CONFIG_DIR = path.join(app.getPath('userData'), 'data')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
export const APPS_FILE = path.join(CONFIG_DIR, 'apps.json')
export const CATEGORIES_FILE = path.join(CONFIG_DIR, 'categories.json')
export const ICONS_DIR = path.join(CONFIG_DIR, 'icons')

/**
 * 异步清理图标缓存目录。
 *
 * 原本这段逻辑在 `ensureDataDir` 里用 `fs.readdirSync` + `fs.unlinkSync` 同步跑，
 * 而 `ensureDataDir` 在 `app.on('ready')` 的启动路径上被同步调用——几百个缓存文件
 * 逐一 stat/删除会卡住主窗口弹出。这里把它挪到 `setImmediate` 之后，用 `fs.promises`
 * 异步删文件，既保持原有清理规则（删 0 字节文件 + 不符合 32 位十六进制 png 的旧缓存），
 * 又不再阻塞启动。整体 try/catch：清理失败绝不影响启动。
 */
export function scheduleIconCacheCleanup(): void {
  setImmediate(() => {
    void (async () => {
      try {
        const files = await fs.promises.readdir(ICONS_DIR)
        for (const file of files) {
          const filePath = path.join(ICONS_DIR, file)
          const stat = await fs.promises.stat(filePath)
          if (stat.size === 0) {
            await fs.promises.unlink(filePath)
            continue
          }
          // 清理旧缓存键规则（base64url 截断）遗留的文件；当前键为 32 位十六进制 png
          const lower = file.toLowerCase()
          if (lower.endsWith('.png') && !/^[0-9a-f]{32}\.png$/.test(lower)) {
            await fs.promises.unlink(filePath)
          }
        }
      } catch { /* ignore：清理失败不影响启动 */ }
    })()
  })
}

export function ensureDataDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  // 必须排在所有 readJsonFile 之前：上一次写入若卡在两次 rename 之间被中断，
  // 主文件会缺失而内容还在 .bak / .tmp 里；不先恢复就会被当成"没有数据"，
  // 随后渲染层一保存就把默认值写回去，等于永久丢掉用户的分类。
  recoverInterruptedWrites(CONFIG_DIR)
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true })
  }
  // 启动路径上只做必需的同步工作（建目录 + 恢复中断写入）；图标缓存清理改为异步，
  // 由 scheduleIconCacheCleanup 排到事件循环之后执行，不再阻塞 ready。
  scheduleIconCacheCleanup()
}

/**
 * 本次运行中解析失败过的数据文件。
 *
 * 损坏的文件必须**在本次会话内拒绝写入**：解析失败只会返回默认值，而渲染层拿到
 * 默认值后会立刻保存回去，那就把用户真正的数据盖掉了（虽然 .corrupt-* 里还留着，
 * 但用户完全不知道它存在）。这里记下名单，写入口据此拒绝。
 */
const corruptedFiles = new Set<string>()

export function isDataFileCorrupted(filePath: string): boolean {
  return corruptedFiles.has(filePath)
}

export function getCorruptedFiles(): string[] {
  return [...corruptedFiles]
}

export interface CorruptBackup {
  /** 损坏的原始数据文件路径 */
  targetFile: string
  /** 留档文件路径（<原文件>.corrupt-<时间戳>） */
  backupPath: string
  fileName: string
  size: number
  createdAt: number
}

/**
 * 列出数据目录里所有 `.corrupt-*` 留档。
 *
 * 这些文件是 `readJsonFile` 解析失败时自动留的底，但以前没有任何入口能发现或使用它们，
 * 用户实际处于"数据看着没了、其实还在磁盘上"的状态。
 */
export function listCorruptBackups(dir: string = CONFIG_DIR): CorruptBackup[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }

  const results: CorruptBackup[] = []
  for (const entry of entries) {
    const markerIndex = entry.indexOf('.corrupt-')
    if (markerIndex === -1) continue
    const fullPath = path.join(dir, entry)
    try {
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) continue
      results.push({
        targetFile: path.join(dir, entry.slice(0, markerIndex)),
        backupPath: fullPath,
        fileName: entry,
        size: stat.size,
        createdAt: stat.mtimeMs
      })
    } catch {
      /* ignore */
    }
  }
  return results.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 用留档覆盖回目标文件。
 *
 * 调用方（渲染层）会先让用户确认，这里只做搬运：把留档复制成目标文件，
 * 并**保留留档本身**——万一用户后悔还能再来一次。
 */
export function restoreCorruptBackup(backupPath: string, targetFile: string): boolean {
  try {
    const raw = fs.readFileSync(backupPath, 'utf-8')
    // 先确认内容是可解析的 JSON，避免把同样损坏的内容又搬回原位
    JSON.parse(raw)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.writeFileSync(targetFile, raw, 'utf-8')
    // 恢复成功后解除写保护，否则用户之后所有保存都会被拒
    corruptedFiles.delete(targetFile)
    return true
  } catch (error) {
    console.error(`Error restoring ${targetFile} from ${backupPath}:`, error)
    return false
  }
}

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) return defaultValue
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
    return defaultValue
  }
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    // 解析失败说明文件已损坏：先把原始内容留档，避免后续写入覆盖后无法恢复
    console.error(`Error parsing ${filePath}:`, error)
    try {
      fs.writeFileSync(`${filePath}.corrupt-${Date.now()}`, raw, 'utf-8')
    } catch { /* ignore */ }
    corruptedFiles.add(filePath)
    return defaultValue
  }
}

export function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    ensureDataDir()
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
    return true
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
    try { fs.unlinkSync(filePath + '.tmp') } catch { /* ignore */ }
    return false
  }
}

export function getDefaultConfig() {
  return {
    hotkey: 'Alt+Space',
    searchHotkey: 'Ctrl+K',
    windowSize: { width: 1050, height: 800 },
    windowPosition: null,
    searchEngines: {
      b: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
      g: { name: 'Google', url: 'https://www.google.com/search?q=' },
      bd: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
      yh: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
      ddg: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
      gh: { name: 'GitHub', url: 'https://github.com/search?q=' },
      yt: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
      npm: { name: 'npm', url: 'https://www.npmjs.com/search?q=' },
      mdn: { name: 'MDN', url: 'https://developer.mozilla.org/search?q=' },
      so: { name: 'StackOverflow', url: 'https://stackoverflow.com/search?q=' },
      zhihu: { name: '知乎', url: 'https://www.zhihu.com/search?q=' },
      bilibili: { name: 'B站', url: 'https://search.bilibili.com/all?keyword=' }
    },
    autoStart: false,
    closeAction: 'tray' as const,
    lastActiveCategoryId: null,
    trayNotified: false,
    searchAutoHideOnBlur: false,
    startMinimizedToTray: false,
    mainAutoHideOnBlur: false,
    ui: {
      gridColumns: 6,
      cardSize: 'medium' as const,
      showIcon: true,
      showName: true,
      borderRadius: 8,
      theme: 'aurora' as const,
      layout: 'horizon-workspace' as const,
      sidebarWidth: 240,
      accentColor: '',
      searchWidth: 600,
      searchVerticalRatio: 0.3,
      searchMaxResults: 6,
      sortMode: 'manual' as const,
      searchTheme: 'dark' as const,
      searchOpacity: 0.72,
      searchHintsVisible: true,
      toolbarIconOnly: true,
    },
    defaultEngine: 'b',
    onboardingCompleted: false,
    autoCategoryRules: [],
    quickActions: [
      { key: '>shutdown', name: '关机', command: 'shutdown' as const, enabled: true },
      { key: '>restart', name: '重启', command: 'restart' as const, enabled: true },
      { key: '>lock', name: '锁定电脑', command: 'lock' as const, enabled: true },
      { key: '>settings', name: '系统设置', command: 'settings' as const, enabled: true },
      { key: '>calc', name: '计算器', command: 'calculator' as const, enabled: true },
      { key: '>notepad', name: '记事本', command: 'notepad' as const, enabled: true },
      { key: '>clipboard', name: '剪贴板历史', command: 'clipboard' as const, enabled: true }
    ]
  }
}
