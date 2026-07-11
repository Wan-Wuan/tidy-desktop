import crypto from 'crypto'
import fs from 'fs'

export function parseSha256Digest(digest: string | undefined): string | null {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest || '')
  return match ? match[1].toLowerCase() : null
}

export function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
