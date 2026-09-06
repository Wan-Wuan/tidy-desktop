import { mkdtempSync, existsSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { readdirSync } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, afterEach } from 'vitest'
import { getBackupDir, pruneBackups, runStartupBackup } from './backup'

let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tidy-backup-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writeFile(filePath: string, content = '{}') {
  writeFileSync(filePath, content, 'utf-8')
}

describe('runStartupBackup', () => {
  it('copies each data file once per day', () => {
    const dataDir = makeTempDir()
    const backupDir = getBackupDir(dataDir)
    const appsFile = path.join(dataDir, 'apps.json')
    writeFile(appsFile)

    expect(runStartupBackup({ files: [appsFile], backupDir, now: new Date('2026-09-06T10:00:00Z') })).toBe(1)
    // 同一天再次启动：已有当日快照，不再新建
    expect(runStartupBackup({ files: [appsFile], backupDir, now: new Date('2026-09-06T18:00:00Z') })).toBe(0)
    // 第二天：产生新快照
    expect(runStartupBackup({ files: [appsFile], backupDir, now: new Date('2026-09-07T10:00:00Z') })).toBe(1)

    const names = readdirSync(backupDir).sort()
    expect(names).toEqual(['2026-09-06-apps.json', '2026-09-07-apps.json'])
  })

  it('skips missing data files without failing', () => {
    const dataDir = makeTempDir()
    const backupDir = getBackupDir(dataDir)
    const missing = path.join(dataDir, 'missing.json')

    expect(runStartupBackup({ files: [missing], backupDir })).toBe(0)
    expect(existsSync(backupDir)).toBe(true)
  })
})

describe('pruneBackups', () => {
  it('keeps only the newest N backups per data file', () => {
    const backupDir = makeTempDir()
    const baseNames = ['apps.json', 'config.json']
    for (let day = 1; day <= 10; day++) {
      for (const base of baseNames) {
        const file = path.join(backupDir, `2026-09-${String(day).padStart(2, '0')}-${base}`)
        writeFile(file)
        const mtime = new Date(Date.UTC(2026, 8, day, 8)).getTime()
        utimesSync(file, new Date(mtime), new Date(mtime))
      }
    }
    // 干扰项：损坏留档文件不参与命名规则，不应被清理
    writeFile(path.join(backupDir, 'apps.json.corrupt-123'))

    pruneBackups(backupDir, 7)

    const remaining = readdirSync(backupDir).sort()
    expect(remaining.filter(name => name.endsWith('apps.json'))).toEqual([
      '2026-09-04-apps.json',
      '2026-09-05-apps.json',
      '2026-09-06-apps.json',
      '2026-09-07-apps.json',
      '2026-09-08-apps.json',
      '2026-09-09-apps.json',
      '2026-09-10-apps.json'
    ])
    expect(remaining.filter(name => name.endsWith('config.json')).length).toBe(7)
    expect(remaining).toContain('apps.json.corrupt-123')
  })
})
