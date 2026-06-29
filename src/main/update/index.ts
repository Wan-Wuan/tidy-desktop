import { ipcMain, app } from 'electron'
import { compareVersions, fetchJson, downloadWithRetry, cleanupFile } from './network'
import { runInstaller, getUpdateFilePath } from './installer'
import { UpdateInfo } from './types'

const GITHUB_API = 'https://api.github.com/repos/Wan-Wuan/tidy-desktop/releases/latest'

let downloading = false

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
}

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

function getInstallerDownloadUrl(release: { assets?: GitHubReleaseAsset[] }): string | null {
  const assets = release.assets || []
  const exeAsset = assets.find((asset) =>
    asset.name &&
    asset.name.endsWith('.exe') &&
    !asset.name.includes('blockmap') &&
    asset.browser_download_url &&
    isTrustedReleaseAssetUrl(asset.browser_download_url)
  )
  return exeAsset?.browser_download_url || null
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

      const downloadUrl = getInstallerDownloadUrl(release)

      if (!downloadUrl) {
        return { available: false }
      }

      return {
        available: true,
        version: latestVersion,
        downloadUrl,
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
      const url = getInstallerDownloadUrl(release)
      if (!url) {
        return { success: false, error: 'No installer found' }
      }

      const sender = event.sender
      const updateFile = getUpdateFilePath()

      await downloadWithRetry(url, updateFile, (progress) => {
        if (!sender.isDestroyed()) {
          sender.send('update-progress', progress)
        }
      })

      return { success: true, filePath: updateFile }
    } catch (err: any) {
      cleanupFile(getUpdateFilePath())
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
