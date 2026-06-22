import { ipcMain, app, BrowserWindow } from 'electron'
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

const GITHUB_API = 'https://api.github.com/repos/Wan-Wuan/tidy-desktop/releases/latest'
const UPDATE_FILE = path.join(app.getPath('temp'), 'tidy-desktop-update.exe')

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, {
      headers: { 'User-Agent': 'tidy-desktop-updater' }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirect = res.headers.location
        if (redirect) {
          fetchJson(redirect).then(resolve).catch(reject)
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

function downloadFile(url: string, dest: string, onProgress?: (percent: number, transferred: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (downloadUrl: string) => {
      const client = downloadUrl.startsWith('https') ? https : http
      const req = client.get(downloadUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirect = res.headers.location
          if (redirect) { follow(redirect); return }
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let transferred = 0
        const file = fs.createWriteStream(dest)
        res.on('data', (chunk) => {
          file.write(chunk)
          transferred += chunk.length
          if (onProgress && total > 0) {
            onProgress(Math.round((transferred / total) * 100), transferred, total)
          }
        })
        res.on('end', () => {
          file.end(() => resolve())
        })
        res.on('error', (err) => {
          file.end()
          reject(err)
        })
      })
      req.on('error', reject)
      req.setTimeout(120000, () => { req.destroy(); reject(new Error('download timeout')) })
    }
    follow(url)
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
    } catch {
      // Network error, rate limit, etc. — silently ignore
      return { available: false }
    }
  })

  ipcMain.handle('download-update', async (event) => {
    try {
      const release = await fetchJson(GITHUB_API)
      const assets = release.assets || []
      const exeAsset = assets.find((a: any) =>
        a.name && a.name.endsWith('.exe') && !a.name.includes('blockmap')
      )

      if (!exeAsset) {
        return { success: false, error: 'No installer found' }
      }

      const sender = event.sender

      await downloadFile(exeAsset.browser_download_url, UPDATE_FILE, (percent, transferred, total) => {
        if (!sender.isDestroyed()) {
          sender.send('update-progress', { percent, transferred, total })
        }
      })

      return { success: true, filePath: UPDATE_FILE }
    } catch (err: any) {
      return { success: false, error: err.message || 'Download failed' }
    }
  })

  ipcMain.handle('install-update', (_, filePath: string) => {
    const installerPath = filePath || UPDATE_FILE
    if (!fs.existsSync(installerPath)) {
      return false
    }

    // Spawn installer with /S (silent) flag, then quit app
    const child = execFile(installerPath, ['/S'], { detached: true, stdio: 'ignore' } as any)
    child.unref()

    // Quit after a short delay to let the installer start
    setTimeout(() => {
      app.quit()
    }, 500)

    return true
  })
}
