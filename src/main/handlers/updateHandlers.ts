import { ipcMain, app } from 'electron'
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

const GITHUB_API = 'https://api.github.com/repos/Wan-Wuan/tidy-desktop/releases/latest'
const UPDATE_FILE = path.join(app.getPath('temp'), 'tidy-desktop-update.exe')
const MAX_REDIRECTS = 5

let downloading = false

function compareVersions(a: string, b: string): number {
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

function fetchJson(url: string, redirectsLeft = MAX_REDIRECTS): Promise<any> {
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
          fetchJson(redirect, redirectsLeft - 1).then(resolve).catch(reject)
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

function cleanupFile(filePath: string) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore */ }
}

function downloadFile(url: string, dest: string, onProgress?: (percent: number, transferred: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      cleanupFile(dest)
      reject(err)
    }

    const follow = (downloadUrl: string, redirectsLeft: number) => {
      if (redirectsLeft <= 0) {
        fail(new Error('Too many redirects'))
        return
      }

      const client = downloadUrl.startsWith('https') ? https : http
      const req = client.get(downloadUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirect = res.headers.location
          if (redirect && redirect.startsWith('https://')) {
            follow(redirect, redirectsLeft - 1)
            return
          }
          fail(new Error('Invalid redirect'))
          return
        }
        if (res.statusCode !== 200) {
          fail(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let transferred = 0

        const file = fs.createWriteStream(dest)

        // Use pipe() for proper backpressure handling
        res.pipe(file)

        res.on('data', (chunk) => {
          transferred += chunk.length
          if (onProgress) {
            onProgress(total > 0 ? Math.round((transferred / total) * 100) : 0, transferred, total)
          }
        })

        file.on('finish', () => {
          if (settled) return
          // Validate content-length if provided
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

export function registerUpdateHandlers() {
  ipcMain.handle('check-for-update', async () => {
    try {
      const currentVersion = app.getVersion()
      const release = await fetchJson(GITHUB_API)
      const latestVersion = (release.tag_name || '').replace(/^v/i, '')

      if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
        return { available: false }
      }

      // Find .exe asset
      const assets = release.assets || []
      const exeAsset = assets.find((a: any) =>
        a.name && a.name.endsWith('.exe') && !a.name.includes('blockmap')
      )

      if (!exeAsset) {
        return { available: false }
      }

      return {
        available: true,
        version: latestVersion,
        downloadUrl: exeAsset.browser_download_url,
        releaseNotes: release.body || ''
      }
    } catch (err: any) {
      return { available: false, error: err.message || 'check failed' }
    }
  })

  ipcMain.handle('download-update', async (event, downloadUrl?: string) => {
    if (downloading) {
      return { success: false, error: 'Download already in progress' }
    }
    downloading = true

    try {
      let url = downloadUrl

      if (!url) {
        const release = await fetchJson(GITHUB_API)
        const assets = release.assets || []
        const exeAsset = assets.find((a: any) =>
          a.name && a.name.endsWith('.exe') && !a.name.includes('blockmap')
        )
        if (!exeAsset) {
          return { success: false, error: 'No installer found' }
        }
        url = exeAsset.browser_download_url
      }

      const sender = event.sender

      await downloadFile(url!, UPDATE_FILE, (percent, transferred, total) => {
        if (!sender.isDestroyed()) {
          sender.send('update-progress', { percent, transferred, total })
        }
      })

      return { success: true, filePath: UPDATE_FILE }
    } catch (err: any) {
      cleanupFile(UPDATE_FILE)
      return { success: false, error: err.message || 'Download failed' }
    } finally {
      downloading = false
    }
  })

  ipcMain.handle('install-update', (_, filePath: string) => {
    const installerPath = filePath || UPDATE_FILE
    if (!fs.existsSync(installerPath)) {
      return false
    }

    try {
      const child = execFile(installerPath, ['/S'], { detached: true, stdio: 'ignore' } as any)
      child.on('error', () => { /* spawn failed — nothing we can do after exit */ })
      child.unref()

      // Release file locks so the installer can overwrite old files
      setTimeout(() => app.exit(0), 1500)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('get-version', () => {
    return app.getVersion()
  })
}
