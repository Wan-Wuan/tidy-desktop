import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { recoverInterruptedWrites } from './jsonTransaction'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tidy-desktop-recovery-'))
  tempDirs.push(dir)
  return dir
}

/** 模拟一次「写到一半被打断」的事务：主文件已让位成 .bak，新文件还没顶上来 */
const TX = '.12345-1700000000000-abc123'

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('recoverInterruptedWrites', () => {
  it('主文件缺失时用 .bak 还原（最典型的崩溃点：卡在两次 rename 之间）', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, `apps.json${TX}.bak`), '{"apps":["old"]}', 'utf8')
    fs.writeFileSync(path.join(dir, `apps.json${TX}.tmp`), '{"apps":["new"]}', 'utf8')

    const result = recoverInterruptedWrites(dir)

    expect(result.recovered).toBe(1)
    expect(result.recoveredFiles).toEqual(['apps.json'])
    // 还原的必须是**旧**数据：新数据还没提交，丢掉它是正确的
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'apps.json'), 'utf8'))).toEqual({ apps: ['old'] })
    // 残留的 .tmp 应被清理
    expect(fs.readdirSync(dir).filter(f => f.endsWith('.tmp') || f.endsWith('.bak'))).toEqual([])
  })

  it('主文件正常时只清理残留，不覆盖它', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'apps.json'), '{"apps":["current"]}', 'utf8')
    fs.writeFileSync(path.join(dir, `apps.json${TX}.bak`), '{"apps":["stale"]}', 'utf8')
    fs.writeFileSync(path.join(dir, `apps.json${TX}.tmp`), '{"apps":["uncommitted"]}', 'utf8')

    const result = recoverInterruptedWrites(dir)

    expect(result.recovered).toBe(0)
    expect(result.cleaned).toBe(2)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'apps.json'), 'utf8'))).toEqual({ apps: ['current'] })
  })

  it('原本不存在主文件时用 .tmp 还原（新建文件的场景）', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, `categories.json${TX}.tmp`), '{"categories":["fresh"]}', 'utf8')

    const result = recoverInterruptedWrites(dir)

    expect(result.recovered).toBe(1)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'categories.json'), 'utf8'))).toEqual({ categories: ['fresh'] })
  })

  it('兼容 config.ts 里不带事务 ID 的 .tmp 命名', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'config.json.tmp'), '{"hotkey":"Alt+Space"}', 'utf8')

    const result = recoverInterruptedWrites(dir)

    expect(result.recovered).toBe(1)
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config.json.tmp'))).toBe(false)
  })

  it('不动无关文件', () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'apps.json'), '{}', 'utf8')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me', 'utf8')
    fs.writeFileSync(path.join(dir, 'icon.png'), 'binary-ish', 'utf8')

    recoverInterruptedWrites(dir)

    expect(fs.readdirSync(dir).sort()).toEqual(['apps.json', 'icon.png', 'notes.txt'])
  })

  it('目录不存在时安全返回', () => {
    const missing = path.join(os.tmpdir(), 'tidy-desktop-definitely-missing-dir-xyz')
    expect(recoverInterruptedWrites(missing)).toEqual({ recovered: 0, cleaned: 0, recoveredFiles: [] })
  })
})
