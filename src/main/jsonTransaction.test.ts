import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeJsonFilesAtomically } from './jsonTransaction'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidy-desktop-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('writeJsonFilesAtomically', () => {
  it('commits every JSON file together', () => {
    const dir = makeTempDir()
    const first = path.join(dir, 'first.json')
    const second = path.join(dir, 'second.json')
    fs.writeFileSync(first, '{"old":true}', 'utf8')

    expect(writeJsonFilesAtomically([
      { filePath: first, data: { next: 1 } },
      { filePath: second, data: { next: 2 } }
    ])).toBe(true)
    expect(JSON.parse(fs.readFileSync(first, 'utf8'))).toEqual({ next: 1 })
    expect(JSON.parse(fs.readFileSync(second, 'utf8'))).toEqual({ next: 2 })
  })

  it('keeps original files when serialization fails', () => {
    const dir = makeTempDir()
    const first = path.join(dir, 'first.json')
    const second = path.join(dir, 'second.json')
    fs.writeFileSync(first, '{"old":1}', 'utf8')
    fs.writeFileSync(second, '{"old":2}', 'utf8')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(writeJsonFilesAtomically([
      { filePath: first, data: { next: 1 } },
      { filePath: second, data: { invalid: 1n } }
    ])).toBe(false)
    expect(JSON.parse(fs.readFileSync(first, 'utf8'))).toEqual({ old: 1 })
    expect(JSON.parse(fs.readFileSync(second, 'utf8'))).toEqual({ old: 2 })
  })

  it('rolls every file back when the commit phase fails', () => {
    const dir = makeTempDir()
    const first = path.join(dir, 'first.json')
    const second = path.join(dir, 'second.json')
    fs.writeFileSync(first, '{"old":1}', 'utf8')
    fs.writeFileSync(second, '{"old":2}', 'utf8')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const renameSync = fs.renameSync.bind(fs)
    let renameCount = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      renameCount += 1
      if (renameCount === 3) throw new Error('simulated commit failure')
      return renameSync(oldPath, newPath)
    })

    expect(writeJsonFilesAtomically([
      { filePath: first, data: { next: 1 } },
      { filePath: second, data: { next: 2 } }
    ])).toBe(false)
    expect(JSON.parse(fs.readFileSync(first, 'utf8'))).toEqual({ old: 1 })
    expect(JSON.parse(fs.readFileSync(second, 'utf8'))).toEqual({ old: 2 })
  })

  it('rejects duplicate destination paths', () => {
    const dir = makeTempDir()
    const target = path.join(dir, 'data.json')
    expect(writeJsonFilesAtomically([
      { filePath: target, data: { one: 1 } },
      { filePath: target, data: { two: 2 } }
    ])).toBe(false)
    expect(fs.existsSync(target)).toBe(false)
  })
})
