import https from 'https'
import http from 'http'
import fs from 'fs'
import { DownloadProgress } from './types'

const MAX_REDIRECTS = 5

export function compareVersions(a: string, b: string): number {
  // Strip pre-release suffixes (e.g. "2.0.0-beta1" → "2.0.0")
  const clean = (v: string) => v.replace(/-.*$/, '')
  const pa = clean(a).split('.').map(Number)
  const pb = clean(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export function fetchJson<T = any>(url: string, redirectsLeft = MAX_REDIRECTS): Promise<T> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) {
      reject(new Error('Too many redirects'))
      return
    }
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, {
      headers: { 'User-Agent': 'tidy-desktop-updater' }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirect = res.headers.location
        if (redirect && redirect.startsWith('https://')) {
          // Drain the response body to free the socket for reuse
          res.resume()
          fetchJson<T>(redirect, redirectsLeft - 1).then(resolve).catch(reject)
          return
        }
        reject(new Error('Invalid redirect'))
        return
      }
      if (res.statusCode === 403) {
        const remaining = res.headers['x-ratelimit-remaining']
        if (remaining === '0') {
          reject(new Error('GitHub API rate limited, try again later'))
          return
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

export function cleanupFile(filePath: string): void {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore */ }
}

export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      cleanupFile(dest)
      reject(err)
    }

    // Check existing partial file
    let existingSize = 0
    try {
      if (fs.existsSync(dest)) {
        const stat = fs.statSync(dest)
        existingSize = stat.size
      }
    } catch {
      existingSize = 0
    }

    const follow = (downloadUrl: string, redirectsLeft: number) => {
      if (redirectsLeft <= 0) {
        fail(new Error('Too many redirects'))
        return
      }

      const options: https.RequestOptions = {
        headers: {
          'User-Agent': 'tidy-desktop-updater',
          ...(existingSize > 0 ? { Range: `bytes=${existingSize}-` } : {})
        }
      }

      const client = downloadUrl.startsWith('https') ? https : http
      const req = client.get(downloadUrl, options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirect = res.headers.location
          if (redirect && redirect.startsWith('https://')) {
            res.resume()
            follow(redirect, redirectsLeft - 1)
            return
          }
          fail(new Error('Invalid redirect'))
          return
        }

        // 206 = Partial Content (resume supported)
        // 200 = Full content (resume not supported, start fresh)
        if (res.statusCode === 200 && existingSize > 0) {
          // Server doesn't support range, restart
          existingSize = 0
          cleanupFile(dest)
        } else if (res.statusCode !== 200 && res.statusCode !== 206) {
          fail(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }

        const contentLength = parseInt(res.headers['content-length'] || '0', 10)
        const total = existingSize + contentLength
        let transferred = existingSize

        const file = fs.createWriteStream(dest, existingSize > 0 ? { flags: 'a' } : {})

        res.pipe(file)

        res.on('data', (chunk) => {
          transferred += chunk.length
          if (onProgress && total > 0) {
            onProgress({ percent: Math.round((transferred / total) * 100), transferred, total })
          }
        })

        file.on('finish', () => {
          if (settled) return
          // Validate total size if known
          if (total > 0 && transferred !== total) {
            fail(new Error(`Download incomplete: ${transferred}/${total} bytes`))
            return
          }
          settled = true
          resolve()
        })

        file.on('error', () => {
          res.destroy()
          fail(new Error('Write failed'))
        })

        res.on('error', () => {
          file.destroy()
          fail(new Error('Download stream error'))
        })
      })

      req.on('error', (err) => fail(err))
      req.setTimeout(120000, () => {
        req.destroy()
        fail(new Error('download timeout'))
      })
    }

    follow(url, MAX_REDIRECTS)
  })
}

export async function downloadWithRetry(
  url: string,
  dest: string,
  onProgress?: (progress: DownloadProgress) => void,
  maxRetries = 3
): Promise<void> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await downloadFile(url, dest, onProgress)
      return // success
    } catch (err: any) {
      lastError = err

      // Don't retry on non-retryable errors
      if (err.message?.includes('HTTP 404') || err.message?.includes('Too many redirects')) {
        throw err
      }

      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  throw lastError || new Error('Download failed after retries')
}
