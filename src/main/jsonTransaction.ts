import fs from 'fs'
import path from 'path'

export interface JsonWriteEntry {
  filePath: string
  data: unknown
}

/** 事务 ID 后缀：<pid>-<时间戳>-<随机串>，用于给临时文件/备份文件命名 */
const TRANSACTION_SUFFIX = /\.[0-9]+-[0-9]+-[a-z0-9]+$/

/**
 * 把已写入的数据真正刷到磁盘。
 *
 * 只 rely on `writeFileSync` 是不够的：它只保证数据进了操作系统的页缓存，
 * 断电时仍可能丢。这里补一次 fsync，让「写临时文件 → 备份原文件 → 替换」
 * 这个序列在崩溃点上也尽量可恢复。
 */
function fsyncFile(filePath: string): void {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r+')
    fs.fsyncSync(fd)
  } catch {
    // fsync 失败不阻断写入：部分文件系统（含某些 Windows 网络盘）不支持
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd) } catch { /* ignore */ }
    }
  }
}

export function writeJsonFilesAtomically(entries: JsonWriteEntry[]): boolean {
  if (entries.length === 0) return false
  if (new Set(entries.map(entry => entry.filePath)).size !== entries.length) return false

  const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const files = entries.map(entry => ({
    ...entry,
    existed: fs.existsSync(entry.filePath),
    tempPath: `${entry.filePath}.${transactionId}.tmp`,
    backupPath: `${entry.filePath}.${transactionId}.bak`
  }))

  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(file.filePath), { recursive: true })
      fs.writeFileSync(file.tempPath, JSON.stringify(file.data, null, 2), 'utf-8')
      // 所有临时文件在进入替换阶段之前就落盘：这样即使后面崩了，
      // 残留的 .tmp 也一定是完整内容，可以被 recoverInterruptedWrites 救回来
      fsyncFile(file.tempPath)
    }
    for (const file of files) {
      if (file.existed) fs.renameSync(file.filePath, file.backupPath)
    }
    for (const file of files) {
      fs.renameSync(file.tempPath, file.filePath)
    }
    for (const file of files) {
      try { fs.unlinkSync(file.backupPath) } catch { /* ignore */ }
    }
    return true
  } catch (error) {
    console.error('Error writing JSON transaction:', error)
    for (const file of [...files].reverse()) {
      try { fs.unlinkSync(file.tempPath) } catch { /* ignore */ }
      try {
        if (fs.existsSync(file.backupPath)) {
          try { fs.unlinkSync(file.filePath) } catch { /* ignore */ }
          fs.renameSync(file.backupPath, file.filePath)
        } else if (!file.existed) {
          try { fs.unlinkSync(file.filePath) } catch { /* ignore */ }
        }
      } catch (rollbackError) {
        console.error(`Error rolling back ${file.filePath}:`, rollbackError)
      }
    }
    return false
  }
}

export interface RecoveryResult {
  /** 从 .bak / .tmp 里救回的主文件数 */
  recovered: number
  /** 清理掉的残留文件数 */
  cleaned: number
  /** 恢复出来的文件名，便于日志排查 */
  recoveredFiles: string[]
}

/**
 * 恢复上一次被中断的写入。
 *
 * 为什么需要：`writeJsonFilesAtomically` 的回滚只在**同一个进程内**的异常路径生效。
 * 如果在两次 rename 之间断电、被杀进程或被强关机，磁盘上会停在中间状态——
 * 典型是「主文件已改名成 .bak，而 .tmp 还没改名成主文件」，此时数据看起来像是丢了。
 *
 * 恢复顺序：
 *   1. 有 `.bak` 且主文件不存在 → 用 .bak 还原（这是最典型的崩溃点）
 *   2. 主文件仍不存在但有 `.tmp` → 用 .tmp 还原（原文件本来就不存在的情况）
 *   3. 剩下的 `.tmp` / `.bak` 都是残留，删掉
 *
 * 必须在任何 readJsonFile 之前调用，否则读到的会是默认值。
 */
export function recoverInterruptedWrites(dir: string): RecoveryResult {
  const result: RecoveryResult = { recovered: 0, cleaned: 0, recoveredFiles: [] }

  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return result
  }

  /** 去掉 `.bak` / `.tmp` 后缀，再去掉事务 ID，得到主文件名 */
  const toMainName = (entry: string): string => entry.slice(0, -4).replace(TRANSACTION_SUFFIX, '')

  const backups = entries.filter(e => e.toLowerCase().endsWith('.bak'))
  const temps = entries.filter(e => e.toLowerCase().endsWith('.tmp'))
  const exists = (name: string) => {
    try { return fs.existsSync(path.join(dir, name)) } catch { return false }
  }
  const restore = (from: string, mainName: string) => {
    try {
      fs.renameSync(path.join(dir, from), path.join(dir, mainName))
      result.recovered++
      result.recoveredFiles.push(mainName)
      return true
    } catch {
      return false
    }
  }

  // 1) 先用备份还原：主文件缺失说明上次卡在「原文件已让位、新文件还没顶上来」
  for (const bak of backups) {
    const mainName = toMainName(bak)
    if (!mainName) continue
    if (exists(mainName)) continue
    restore(bak, mainName)
  }

  // 2) 再用临时文件还原：走到这里说明原本没有备份（文件是新建的）
  for (const tmp of temps) {
    const mainName = toMainName(tmp)
    if (!mainName) continue
    if (exists(mainName)) continue
    restore(tmp, mainName)
  }

  // 3) 清掉所有残留
  for (const leftover of [...backups, ...temps]) {
    const filePath = path.join(dir, leftover)
    if (!exists(leftover)) continue
    try {
      fs.unlinkSync(filePath)
      result.cleaned++
    } catch { /* ignore */ }
  }

  if (result.recovered > 0 || result.cleaned > 0) {
    console.warn(
      `[recovery] 已恢复 ${result.recovered} 个文件，清理 ${result.cleaned} 个残留`,
      result.recoveredFiles
    )
  }
  return result
}
