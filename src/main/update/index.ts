import { ipcMain, app } from 'electron'
import { compareVersions, fetchJson, downloadWithRetry, cleanupFile } from './network'
import { runInstaller, getUpdateFilePath } from './installer'
import { UpdateInfo } from './types'

const GITHUB_API = 'https://api.github.com/repos/Wan-Wuan/tidy-desktop/releases/latest'

let downloading = false

export function registerUpdateHandlers() {
  ipcMain.handle('check-for-update', async (): Promise<UpdateInfo> => {
    try {
      const currentVersion = app.getVersion()
      const release = await fetchJson<any>(GITHUB_API)
      const latestVersion = (release.tag_name || '').replace(/^v/i, '')

      if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
        return { available: false }
      }

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
        const release = await fetchJson<any>(GITHUB_API)
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
      const updateFile = getUpdateFilePath()

      await downloadWithRetry(url!, updateFile, (progress) => {
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
