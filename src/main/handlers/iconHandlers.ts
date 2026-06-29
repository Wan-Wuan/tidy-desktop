import { ipcMain, app } from 'electron'
import { execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { ICONS_DIR } from '../config'

interface ShortcutInfo {
  targetPath: string
  iconPath: string
  iconIndex: number
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function escapePsString(value: string): string {
  return value.replace(/'/g, "''")
}

function parseIconLocation(iconLocation: string): { iconPath: string; iconIndex: number } {
  const trimmed = (iconLocation || '').trim()
  if (!trimmed) return { iconPath: '', iconIndex: 0 }
  const match = trimmed.match(/^(.*?)(?:,(-?\d+))?$/)
  const iconPath = (match?.[1] || trimmed).replace(/^"|"$/g, '')
  const iconIndex = Number.parseInt(match?.[2] || '0', 10)
  return { iconPath, iconIndex: Number.isFinite(iconIndex) ? iconIndex : 0 }
}

function expandWindowsEnvPath(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name: string) => {
    return process.env[name] || process.env[name.toUpperCase()] || process.env[name.toLowerCase()] || `%${name}%`
  })
}

function resolveShortcut(filePath: string): ShortcutInfo {
  try {
    const escapedPath = escapePsString(filePath)
    const result = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut('${escapedPath}'); [Console]::OutputEncoding=[Text.Encoding]::UTF8; [string]::Join([char]31, @($s.TargetPath, $s.IconLocation))`
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 }
    ).trim()
    const [targetPath = '', iconLocation = ''] = result.split(String.fromCharCode(31))
    const parsedIcon = parseIconLocation(iconLocation)
    return {
      targetPath: expandWindowsEnvPath(targetPath),
      iconPath: expandWindowsEnvPath(parsedIcon.iconPath),
      iconIndex: parsedIcon.iconIndex
    }
  } catch {
    return { targetPath: '', iconPath: '', iconIndex: 0 }
  }
}

function extractIconByPowerShell(sourcePath: string, iconIndex = 0): Buffer | null {
  try {
    if (!fs.existsSync(sourcePath)) return null
    const escapedSourcePath = escapePsString(sourcePath)
    const psResult = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IconExtractor {
  [DllImport("Shell32.dll", CharSet = CharSet.Auto)]
  public static extern int ExtractIconEx(string lpszFile, int nIconIndex, IntPtr[] phiconLarge, IntPtr[] phiconSmall, int nIcons);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@
$path = '${escapedSourcePath}'
$index = ${iconIndex}
$large = New-Object IntPtr[] 1
$small = New-Object IntPtr[] 1
$count = [IconExtractor]::ExtractIconEx($path, $index, $large, $small, 1)
$handle = [IntPtr]::Zero
if ($count -gt 0 -and $large[0] -ne [IntPtr]::Zero) { $handle = $large[0] }
elseif ($count -gt 0 -and $small[0] -ne [IntPtr]::Zero) { $handle = $small[0] }
if ($handle -ne [IntPtr]::Zero) {
  $icon = [System.Drawing.Icon]::FromHandle($handle)
  $bmp = $icon.ToBitmap()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [Convert]::ToBase64String($ms.ToArray())
  $bmp.Dispose()
  $icon.Dispose()
  [IconExtractor]::DestroyIcon($handle) | Out-Null
} else {
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
  if ($icon) {
    $bmp = $icon.ToBitmap()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [Convert]::ToBase64String($ms.ToArray())
    $bmp.Dispose()
    $icon.Dispose()
  }
}
`.trim()
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 4000 }
    ).trim()
    if (!psResult || psResult.length <= 100) return null
    return Buffer.from(psResult, 'base64')
  } catch {
    return null
  }
}

async function getIconPng(sourcePath: string, iconIndex = 0): Promise<Buffer | null> {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null

  const ext = path.extname(sourcePath).toLowerCase()
  if (ext === '.ico' || ext === '.png') {
    const data = fs.readFileSync(sourcePath)
    return data.length > 100 ? data : null
  }

  try {
    const icon = await app.getFileIcon(sourcePath, { size: 'large' })
    const pngData = icon.toPNG()
    if (pngData.length > 1200) return pngData
  } catch { /* ignore */ }

  const extracted = extractIconByPowerShell(sourcePath, iconIndex)
  if (extracted && extracted.length > 500) return extracted

  return extracted && extracted.length > 0 ? extracted : null
}

export function registerIconHandlers() {
  ipcMain.handle('extract-icon', async (_, filePath: string) => {
    try {
      const hash = Buffer.from(filePath).toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
      const iconPath = path.join(ICONS_DIR, `${hash}.png`)

      if (fs.existsSync(iconPath)) {
        const data = fs.readFileSync(iconPath)
        return `data:image/png;base64,${data.toString('base64')}`
      }

      const candidates: Array<{ sourcePath: string; iconIndex: number }> = []
      if (filePath.toLowerCase().endsWith('.lnk')) {
        const shortcut = resolveShortcut(filePath)
        if (shortcut.iconPath) {
          candidates.push({ sourcePath: shortcut.iconPath, iconIndex: shortcut.iconIndex })
        }
        if (shortcut.targetPath) {
          candidates.push({ sourcePath: shortcut.targetPath, iconIndex: 0 })
        }
      }
      candidates.push({ sourcePath: filePath, iconIndex: 0 })

      for (const candidate of candidates) {
        const pngData = await getIconPng(candidate.sourcePath, candidate.iconIndex)
        if (pngData && pngData.length > 0) {
          fs.writeFileSync(iconPath, pngData)
          return `data:image/png;base64,${pngData.toString('base64')}`
        }
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
        const response = await fetchWithTimeout(iconUrl)
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

      const response = await fetchWithTimeout(`https://store.steampowered.com/api/appdetails?appids=${appId}`, 5000)
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
