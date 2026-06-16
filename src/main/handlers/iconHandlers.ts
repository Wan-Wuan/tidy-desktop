import { ipcMain, app } from 'electron'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { ICONS_DIR } from '../config'

export function registerIconHandlers() {
  ipcMain.handle('extract-icon', async (_, filePath: string) => {
    try {
      const hash = Buffer.from(filePath).toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
      const iconPath = path.join(ICONS_DIR, `${hash}.png`)

      if (fs.existsSync(iconPath)) {
        const data = fs.readFileSync(iconPath)
        return `data:image/png;base64,${data.toString('base64')}`
      }

      let targetPath = filePath
      if (filePath.toLowerCase().endsWith('.lnk')) {
        try {
          const escapedPath = filePath.replace(/'/g, "''")
          const result = execSync(
            `powershell -NoProfile -Command "$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut('${escapedPath}'); $s.TargetPath"`,
            { encoding: 'utf8', windowsHide: true, timeout: 3000 }
          ).trim()
          if (result && fs.existsSync(result)) {
            targetPath = result
          }
        } catch { /* .lnk resolve failed, use original path */ }
      }

      const icon = await app.getFileIcon(targetPath, { size: 'large' })
      const pngData = icon.toPNG()
      if (pngData.length > 500) {
        fs.writeFileSync(iconPath, pngData)
        return `data:image/png;base64,${pngData.toString('base64')}`
      }

      // Fallback: use PowerShell to extract associated icon
      try {
        const escapedTargetPath = targetPath.replace(/'/g, "''")
        const psResult = execSync(
          `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escapedTargetPath}'); if($icon){$bmp=$icon.ToBitmap(); $ms=New-Object System.IO.MemoryStream; $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($ms.ToArray())}"`,
          { encoding: 'utf8', windowsHide: true, timeout: 5000 }
        ).trim()
        if (psResult && psResult.length > 100) {
          const buf = Buffer.from(psResult, 'base64')
          fs.writeFileSync(iconPath, buf)
          return `data:image/png;base64,${psResult}`
        }
      } catch { /* PowerShell extraction failed */ }

      if (pngData.length > 0) {
        fs.writeFileSync(iconPath, pngData)
        return `data:image/png;base64,${pngData.toString('base64')}`
      }

      return null
    } catch (error) {
      console.error('Failed to extract icon:', error)
      return null
    }
  })

  ipcMain.handle('extract-steam-icon', async (_, steamUrl: string) => {
    try {
      const match = steamUrl.match(/steam:\/\/(?:launch|rungameid)\/(\d+)/)
      if (!match) return null
      const appId = match[1]

      const steamPaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
        'D:\\Steam',
        'E:\\Steam'
      ]

      // Search common Steam install paths
      for (const steamPath of steamPaths) {
        const cacheDir = path.join(steamPath, 'appcache', 'librarycache')
        if (!fs.existsSync(cacheDir)) continue

        const iconFiles = [
          `${appId}_icon.jpg`,
          `${appId}_library_600x900.jpg`,
          `${appId}_header.jpg`,
          `${appId}_capsule_231x87.jpg`
        ]

        for (const iconFile of iconFiles) {
          const iconPath = path.join(cacheDir, iconFile)
          if (fs.existsSync(iconPath)) {
            const data = fs.readFileSync(iconPath)
            if (data.length > 500) {
              const ext = path.extname(iconFile).toLowerCase()
              const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
              return `data:${mime};base64,${data.toString('base64')}`
            }
          }
        }
      }

      // Try reading Steam's libraryfolders.vdf for additional library paths
      for (const steamPath of steamPaths) {
        const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
        if (fs.existsSync(libraryFoldersPath)) {
          const vdf = fs.readFileSync(libraryFoldersPath, 'utf-8')
          const libMatches = vdf.matchAll(/"path"\s+"([^"]+)"/g)
          for (const libMatch of libMatches) {
            const libPath = libMatch[1].replace(/\\\\/g, '\\')
            const cacheDir = path.join(libPath, 'appcache', 'librarycache')
            if (!fs.existsSync(cacheDir)) continue
            for (const iconFile of [`${appId}_icon.jpg`, `${appId}_library_600x900.jpg`]) {
              const iconPath = path.join(cacheDir, iconFile)
              if (fs.existsSync(iconPath)) {
                const data = fs.readFileSync(iconPath)
                if (data.length > 500) {
                  return `data:image/jpeg;base64,${data.toString('base64')}`
                }
              }
            }
          }
        }
      }

      // Fallback: download icon from Steam CDN
      try {
        const iconUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
        const response = await fetch(iconUrl)
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer())
          if (buffer.length > 1000) {
            const cachedPath = path.join(ICONS_DIR, `steam_${appId}.jpg`)
            try { fs.writeFileSync(cachedPath, buffer) } catch { /* ignore */ }
            return `data:image/jpeg;base64,${buffer.toString('base64')}`
          }
        }
      } catch { /* CDN download failed */ }

      return null
    } catch (error) {
      console.error('Failed to extract Steam icon:', error)
      return null
    }
  })

  ipcMain.handle('get-steam-game-name', async (_, steamUrl: string) => {
    try {
      const match = steamUrl.match(/steam:\/\/(?:launch|rungameid)\/(\d+)/)
      if (!match) return null
      const appId = match[1]

      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`)
      if (!response.ok) return null

      const data = await response.json() as Record<string, any>
      if (data[appId]?.success && data[appId]?.data?.name) {
        return data[appId].data.name
      }
      return null
    } catch (error) {
      console.error('Failed to get Steam game name:', error)
      return null
    }
  })
}
