import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { compareVersions, fetchJson, downloadWithRetry, cleanupFile } from './network'
import { runInstaller, getUpdateFilePath } from './installer'
import { UpdateInfo } from './types'
import { hashFileSha256, parseSha256Digest } from './integrity'

const GITHUB_API = 'https://api.github.com/repos/Wan-Wuan/tidy-desktop/releases/latest'

let downloading = false

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
  size?: number
  digest?: string
}

interface InstallerAsset {
  downloadUrl: string
  size: number
  sha256: string
}

interface DownloadCacheMeta {
  version: string
  downloadUrl: string
  size: number
  sha256: string
}

const UPDATE_META_FILE = path.join(app.getPath('temp'), 'tidy-desktop-update.json')

function isTrustedReleaseAssetUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.startsWith('/Wan-Wuan/tidy-desktop/releases/download/')
  } catch {
    return false
  }
}

function getInstallerAsset(release: { assets?: GitHubReleaseAsset[] }): InstallerAsset | null {
  const assets = release.assets || []
  const exeAsset = assets.find((asset) =>
    asset.name &&
    asset.name.endsWith('.exe') &&
    !asset.name.includes('blockmap') &&
    asset.browser_download_url &&
    isTrustedReleaseAssetUrl(asset.browser_download_url)
  )
  if (!exeAsset?.browser_download_url) return null
  const sha256 = parseSha256Digest(exeAsset.digest)
  if (!sha256) return null
  return {
    downloadUrl: exeAsset.browser_download_url,
    size: exeAsset.size || 0,
    sha256
  }
}

function readDownloadCacheMeta(): DownloadCacheMeta | null {
  try {
    if (!fs.existsSync(UPDATE_META_FILE)) return null
    return JSON.parse(fs.readFileSync(UPDATE_META_FILE, 'utf-8')) as DownloadCacheMeta
  } catch {
    return null
  }
}

function writeDownloadCacheMeta(meta: DownloadCacheMeta): void {
  try {
    fs.writeFileSync(UPDATE_META_FILE, JSON.stringify(meta, null, 2), 'utf-8')
  } catch {
    // The installer is still valid even if metadata persistence fails.
  }
}

function cleanupDownloadCache(): void {
  cleanupFile(getUpdateFilePath())
  try { fs.unlinkSync(UPDATE_META_FILE) } catch { /* ignore */ }
}

export function cleanupInstalledUpdateCache(): void {
  const meta = readDownloadCacheMeta()
  if (!meta?.version) return

  if (compareVersions(app.getVersion(), meta.version) >= 0) {
    cleanupDownloadCache()
  }
}

async function hasCachedInstaller(version: string, asset: InstallerAsset): Promise<boolean> {
  try {
    const meta = readDownloadCacheMeta()
    if (!meta) return false
    if (meta.version !== version || meta.downloadUrl !== asset.downloadUrl) return false
    if (asset.size > 0 && meta.size !== asset.size) return false
    if (meta.sha256 !== asset.sha256) return false

    const stat = fs.statSync(getUpdateFilePath())
    if (!stat.isFile() || (asset.size > 0 && stat.size !== asset.size)) return false
    return await hashFileSha256(getUpdateFilePath()) === asset.sha256
  } catch {
    return false
  }
}

export function registerUpdateHandlers() {
  ipcMain.handle('check-for-update', async (): Promise<UpdateInfo> => {
    try {
      const currentVersion = app.getVersion()
      const release = await fetchJson<any>(GITHUB_API)
      const latestVersion = (release.tag_name || '').replace(/^v/i, '')

      if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
        return { available: false }
      }

      const installerAsset = getInstallerAsset(release)

      if (!installerAsset) {
        return { available: false, error: 'Release installer is missing a trusted SHA-256 digest' }
      }

      return {
        available: true,
        downloaded: await hasCachedInstaller(latestVersion, installerAsset),
        version: latestVersion,
        downloadUrl: installerAsset.downloadUrl,
        releaseNotes: release.body || ''
      }
    } catch (err: any) {
      return { available: false, error: err.message || 'check failed' }
    }
  })

  ipcMain.handle('download-update', async (event) => {
    if (downloading) {
      return { success: false, error: 'Download already in progress' }
    }
    downloading = true

    try {
      const release = await fetchJson<any>(GITHUB_API)
      const version = (release.tag_name || '').replace(/^v/i, '')
      const installerAsset = getInstallerAsset(release)
      if (!version || !installerAsset) {
        return { success: false, error: 'No installer found' }
      }

      const sender = event.sender
      const updateFile = getUpdateFilePath()

      if (await hasCachedInstaller(version, installerAsset)) {
        if (!sender.isDestroyed()) {
          sender.send('update-progress', {
            percent: 100,
            transferred: installerAsset.size,
            total: installerAsset.size
          })
        }
        return { success: true, filePath: updateFile }
      }

      cleanupDownloadCache()

      await downloadWithRetry(installerAsset.downloadUrl, updateFile, (progress) => {
        if (!sender.isDestroyed()) {
          sender.send('update-progress', progress)
        }
      })
      const actualSha256 = await hashFileSha256(updateFile)
      if (actualSha256 !== installerAsset.sha256) {
        throw new Error('Downloaded installer failed SHA-256 verification')
      }
      writeDownloadCacheMeta({
        version,
        downloadUrl: installerAsset.downloadUrl,
        size: installerAsset.size,
        sha256: installerAsset.sha256
      })

      return { success: true, filePath: updateFile }
    } catch (err: any) {
      cleanupDownloadCache()
      return { success: false, error: err.message || 'Download failed' }
    } finally {
      downloading = false
    }
  })

  ipcMain.handle('install-update', async (_, filePath: string) => {
    const result = await runInstaller(filePath || getUpdateFilePath())
    return result.success
  })

  ipcMain.handle('get-version', () => {
    return app.getVersion()
  })
}
