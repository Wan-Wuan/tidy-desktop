import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { compareVersions, fetchJson, fetchText, downloadWithRetry, cleanupFile } from './network'
import { runInstaller, getUpdateFilePath } from './installer'
import { UpdateInfo } from './types'
import { hashFileSha256, parseSha256Checksum, parseSha256Digest } from './integrity'

const GITHUB_API = 'https://api.github.com/repos/Wan-Wuan/tidy-desktop/releases/latest'
const GITEE_API = 'https://gitee.com/api/v5/repos/wanwuan/tidy_desktop/releases/latest'

let downloading = false

type UpdateChannel = 'gitee' | 'github'

interface ReleaseAsset {
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

interface ResolvedUpdate {
  version: string
  installer: InstallerAsset
  releaseNotes: string
  source: UpdateChannel
}

interface DownloadCacheMeta {
  version: string
  downloadUrl: string
  size: number
  sha256: string
}

const UPDATE_META_FILE = path.join(app.getPath('temp'), 'tidy-desktop-update.json')

function isTrustedReleaseAssetUrl(rawUrl: string, source: UpdateChannel): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    if (source === 'github') {
      return url.hostname === 'github.com' &&
        url.pathname.startsWith('/Wan-Wuan/tidy-desktop/releases/download/')
    }
    return url.hostname === 'gitee.com' &&
      url.pathname.startsWith('/wanwuan/tidy_desktop/releases/download/')
  } catch {
    return false
  }
}

async function getInstallerAsset(
  release: { assets?: ReleaseAsset[] },
  source: UpdateChannel
): Promise<InstallerAsset | null> {
  const assets = release.assets || []
  const exeAsset = assets.find((asset) =>
    asset.name &&
    asset.name.endsWith('.exe') &&
    !asset.name.includes('blockmap') &&
    asset.browser_download_url &&
    isTrustedReleaseAssetUrl(asset.browser_download_url, source)
  )
  if (!exeAsset?.browser_download_url) return null

  let sha256 = parseSha256Digest(exeAsset.digest)
  if (!sha256 && source === 'gitee' && exeAsset.name) {
    const checksumAsset = assets.find((asset) =>
      asset.name === `${exeAsset.name}.sha256` &&
      asset.browser_download_url &&
      isTrustedReleaseAssetUrl(asset.browser_download_url, source)
    )
    if (checksumAsset?.browser_download_url) {
      sha256 = parseSha256Checksum(await fetchText(checksumAsset.browser_download_url), exeAsset.name)
    }
  }
  if (!sha256) return null
  return {
    downloadUrl: exeAsset.browser_download_url,
    size: exeAsset.size || 0,
    sha256
  }
}

async function resolveLatestUpdate(): Promise<ResolvedUpdate | null> {
  const errors: string[] = []
  const sources: Array<{ name: UpdateChannel; apiUrl: string }> = [
    { name: 'gitee', apiUrl: GITEE_API },
    { name: 'github', apiUrl: GITHUB_API }
  ]

  for (const source of sources) {
    try {
      const release = await fetchJson<any>(source.apiUrl)
      const version = (release.tag_name || '').replace(/^v/i, '')
      if (!version || compareVersions(version, app.getVersion()) <= 0) continue

      const installer = await getInstallerAsset(release, source.name)
      if (!installer) {
        errors.push(`${source.name} release is missing a verified installer`)
        continue
      }
      return { version, installer, releaseNotes: release.body || '', source: source.name }
    } catch (error: any) {
      errors.push(`${source.name}: ${error.message || 'request failed'}`)
    }
  }

  if (errors.length === sources.length) {
    throw new Error(errors.join('; '))
  }
  return null
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
      const update = await resolveLatestUpdate()
      if (!update) return { available: false }

      return {
        available: true,
        downloaded: await hasCachedInstaller(update.version, update.installer),
        version: update.version,
        downloadUrl: update.installer.downloadUrl,
        releaseNotes: update.releaseNotes,
        source: update.source
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
      const update = await resolveLatestUpdate()
      if (!update) {
        return { success: false, error: 'No installer found' }
      }
      const { version, installer: installerAsset } = update

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
