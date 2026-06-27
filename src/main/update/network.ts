import https from 'https'
import http from 'http'
import fs from 'fs'

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
