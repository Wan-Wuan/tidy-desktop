import fs from 'fs'
import path from 'path'

export interface JsonWriteEntry {
  filePath: string
  data: unknown
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
