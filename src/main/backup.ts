import fs from 'fs'
import path from 'path'
import { APPS_FILE, CATEGORIES_FILE, CONFIG_DIR, CONFIG_FILE } from './config'

export const BACKUP_DIR = path.join(CONFIG_DIR, 'backups')
const KEEP_PER_FILE = 7
const BACKUP_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}-.+\.json$/

function pruneOldBackups() {
  try {
    const byBase = new Map<string, Array<{ file: string; mtime: number }>>()
    for (const name of fs.readdirSync(BACKUP_DIR)) {
      if (!BACKUP_FILE_PATTERN.test(name)) continue
      const fullPath = path.join(BACKUP_DIR, name)
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
      for (const item of list.slice(KEEP_PER_FILE)) {
        try { fs.unlinkSync(item.file) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

/** 每天首次启动时把三份数据文件快照到 backups 目录，返回本次新建数量 */
export function runStartupBackup(): number {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true })
    }
    const stamp = new Date().toISOString().slice(0, 10)
    let created = 0
    for (const file of [CONFIG_FILE, APPS_FILE, CATEGORIES_FILE]) {
      if (!fs.existsSync(file)) continue
      const target = path.join(BACKUP_DIR, `${stamp}-${path.basename(file)}`)
      if (fs.existsSync(target)) continue
      try {
        fs.copyFileSync(file, target)
        created++
      } catch { /* ignore */ }
    }
    pruneOldBackups()
    return created
  } catch {
    return 0
  }
}
