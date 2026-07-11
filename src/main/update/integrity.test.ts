import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { hashFileSha256, parseSha256Digest } from './integrity'

const tempFiles: string[] = []

afterEach(() => {
  for (const file of tempFiles.splice(0)) fs.rmSync(file, { force: true })
})

describe('update integrity', () => {
  it('accepts only a complete SHA-256 digest', () => {
    const hash = 'A'.repeat(64)
    expect(parseSha256Digest(`sha256:${hash}`)).toBe(hash.toLowerCase())
    expect(parseSha256Digest(`sha512:${hash}`)).toBeNull()
    expect(parseSha256Digest('sha256:abc')).toBeNull()
    expect(parseSha256Digest(undefined)).toBeNull()
  })

  it('calculates the SHA-256 of a downloaded file', async () => {
    const file = path.join(os.tmpdir(), `tidy-desktop-hash-${process.pid}-${Date.now()}.bin`)
    tempFiles.push(file)
    const contents = Buffer.from('verified update payload')
    fs.writeFileSync(file, contents)
    const expected = crypto.createHash('sha256').update(contents).digest('hex')
    await expect(hashFileSha256(file)).resolves.toBe(expected)
  })
})
