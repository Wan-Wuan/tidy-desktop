import fs from 'fs'
import path from 'path'

export const KEEP_PER_FILE = 7
const BACKUP_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}-.+\.json$/

export function getBackupDir(dataDir: string): string {
  return path.join(dataDir, 'backups')
}

/** 清理超出保留数量的旧备份（按文件名前缀分组、按修改时间保留最新 N 份） */
export function pruneBackups(backupDir: string, keep = KEEP_PER_FILE): void {
  const byBase = new Map<string, Array<{ file: string; mtime: number }>>()
  for (const name of fs.readdirSync(backupDir)) {
    if (!BACKUP_FILE_PATTERN.test(name)) continue
    const fullPath = path.join(backupDir, name)
    let mtime: number
    try {
      mtime = fs.statSync(fullPath).mtimeMs
    } catch { continue }
    const base = name.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    const list = byBase.get(base) || []
    list.push({ file: fullPath, mtime })
    byBase.set(base, list)
  }
  for (const list of byBase.values()) {
    list.sort((a, b) => b.mtime - a.mtime)
    for (const item of list.slice(keep)) {
      try { fs.unlinkSync(item.file) } catch { /* ignore */ }
    }
  }
}

/** 每天首次调用时把数据文件快照到 backups 目录，返回本次新建数量 */
export function runStartupBackup(options: {
  files: string[]
  backupDir: string
  now?: Date
  keep?: number
}): number {
  const { files, backupDir, now = new Date(), keep = KEEP_PER_FILE } = options
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const stamp = now.toISOString().slice(0, 10)
    let created = 0
    for (const file of files) {
      if (!fs.existsSync(file)) continue
      const target = path.join(backupDir, `${stamp}-${path.basename(file)}`)
      if (fs.existsSync(target)) continue
      try {
        fs.copyFileSync(file, target)
        created++
      } catch { /* ignore */ }
    }
    pruneBackups(backupDir, keep)
    return created
  } catch {
    return 0
  }
}
