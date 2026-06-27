# Auto-Update 全流程重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构应用检测更新、下载更新、安装更新的全过程，提升代码可维护性、安装可靠性和用户体验。

**Architecture:** 将 `updateHandlers.ts` 拆分为 `types.ts`（类型）、`network.ts`（网络）、`installer.ts`（安装）、`index.ts`（IPC 入口+状态机）四个模块。前端抽离 `useUpdate` hook 和 `UpdateButton` 组件。下载支持断点续传+重试，安装改用 PowerShell 脚本替代 batch 脚本。

**Tech Stack:** TypeScript, Electron 28, React, Node.js `https`/`fs`/`child_process`, PowerShell (Windows native)

## Global Constraints

- 不引入 `electron-updater`，继续使用 GitHub Releases API
- 不添加签名验证（当前 NSIS 安装器未签名）
- 仅支持 Windows（PowerShell 为 Windows 原生）
- 保持现有 `tsconfig.main.json` 配置（target ES2020, module CommonJS）
- 保持现有 IPC 命名风格（kebab-case）
- 安装脚本对用户不可见
- 下载完成后弹窗确认安装（不再自动安装）

---

### Task 1: 类型定义模块 `types.ts`

**Files:**
- Create: `src/main/update/types.ts`
- Create: `src/main/update/__tests__/types.test.ts` (optional, 纯类型无逻辑)

**Interfaces:**

```typescript
// src/main/update/types.ts

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'

export interface UpdateInfo {
  available: boolean
  version?: string
  downloadUrl?: string
  releaseNotes?: string
  error?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface DownloadResult {
  success: boolean
  filePath?: string
  error?: string
}

export interface InstallResult {
  success: boolean
  error?: string
}

export interface UpdateStatus {
  state: UpdateState
  version?: string
  progress?: DownloadProgress
  error?: string
  releaseNotes?: string
}
```

- [ ] **Step 1: 创建 types.ts 文件**

创建 `src/main/update/types.ts`，写入上述类型定义。

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/main/update/types.ts
git commit -m "feat(update): add update types module"
```

---

### Task 2: 网络模块 `network.ts` — 基础函数

**Files:**
- Create: `src/main/update/network.ts`
- Create: `src/main/update/__tests__/network.test.ts` (optional, 依赖外部网络)

**Interfaces:**
- Consumes: 无（新模块）
- Produces: `fetchJson<T>(url: string): Promise<T>`, `compareVersions(a: string, b: string): number`, `cleanupFile(filePath: string): void`

- [ ] **Step 1: 从 updateHandlers.ts 提取 compareVersions**

创建 `src/main/update/network.ts`，将 `compareVersions` 函数移入：

```typescript
import https from 'https'
import http from 'http'
import fs from 'fs'

const MAX_REDIRECTS = 5

export function compareVersions(a: string, b: string): number {
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
```

- [ ] **Step 2: 从 updateHandlers.ts 提取 fetchJson**

将 `fetchJson` 移入并导出。保持重定向处理和速率限制检测：

```typescript
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
```

- [ ] **Step 3: 添加 cleanupFile 工具函数**

```typescript
export function cleanupFile(filePath: string): void {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore */ }
}
```

- [ ] **Step 4: 验证编译**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/main/update/network.ts
git commit -m "feat(update): extract network module with fetchJson, compareVersions, cleanupFile"
```

---

### Task 3: 网络模块 `network.ts` — 断点续传下载

**Files:**
- Modify: `src/main/update/network.ts`

**Interfaces:**
- Consumes: `cleanupFile` (同模块)
- Produces: `downloadFile(url: string, dest: string, onProgress?: (progress: DownloadProgress) => void): Promise<void>`

- [ ] **Step 1: 实现断点续传下载函数**

在 `network.ts` 中添加 `downloadFile` 函数，支持 HTTP Range 断点续传：

```typescript
import { DownloadProgress } from './types'

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

      const options: https.RequestOptions = {}
      if (existingSize > 0) {
        options.headers = { Range: `bytes=${existingSize}-` }
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
```

- [ ] **Step 2: 导入类型并验证编译**

确保 `DownloadProgress` 从 `./types` 正确导入。

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/main/update/network.ts
git commit -m "feat(update): add resumable downloadFile with HTTP Range support"
```

---

### Task 4: 网络模块 `network.ts` — 重试机制

**Files:**
- Modify: `src/main/update/network.ts`

**Interfaces:**
- Consumes: `downloadFile` (同模块)
- Produces: `downloadWithRetry(url: string, dest: string, onProgress?: ..., maxRetries?: number): Promise<void>`

- [ ] **Step 1: 实现指数退避重试包装函数**

在 `network.ts` 中添加 `downloadWithRetry`：

```typescript
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
      if (err.message?.includes('HTTP 404') || err.message?.includes('too many redirects')) {
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
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/main/update/network.ts
git commit -m "feat(update): add downloadWithRetry with exponential backoff"
```

---

### Task 5: 安装模块 `installer.ts`

**Files:**
- Create: `src/main/update/installer.ts`

**Interfaces:**
- Consumes: `InstallResult` from `./types`
- Produces: `runInstaller(installerPath: string): Promise<InstallResult>`

- [ ] **Step 1: 实现 PowerShell 安装脚本生成与执行**

创建 `src/main/update/installer.ts`：

```typescript
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { InstallResult } from './types'

const UPDATE_FILE = path.join(app.getPath('temp'), 'tidy-desktop-update.exe')
const PS_SCRIPT = path.join(app.getPath('temp'), 'tidy-desktop-update.ps1')
const INSTALL_LOG = path.join(app.getPath('temp'), 'tidy-desktop-install.log')

export function getUpdateFilePath(): string {
  return UPDATE_FILE
}

export function runInstaller(installerPath: string): Promise<InstallResult> {
  // Validate path matches expected update file
  const resolvedPath = path.resolve(installerPath)
  const expectedPath = path.resolve(UPDATE_FILE)
  if (resolvedPath !== expectedPath) {
    console.error('install-update: rejected path mismatch:', resolvedPath)
    return Promise.resolve({ success: false, error: 'Invalid installer path' })
  }

  if (!fs.existsSync(installerPath)) {
    return Promise.resolve({ success: false, error: 'Installer file not found' })
  }

  try {
    const currentPid = process.pid
    const escapedInstallerPath = installerPath.replace(/'/g, "''")
    const escapedLogPath = INSTALL_LOG.replace(/'/g, "''")
    const escapedScriptPath = PS_SCRIPT.replace(/'/g, "''")

    const psScript = `
try {
  $logFile = '${escapedLogPath}'
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "[$timestamp] Waiting for app PID ${currentPid} to exit..." | Out-File -FilePath $logFile -Encoding UTF8

  Wait-Process -Id ${currentPid} -Timeout 30

  "[$timestamp] App exited, starting installer..." | Out-File -FilePath $logFile -Append -Encoding UTF8
  Start-Process -FilePath '${escapedInstallerPath}' -ArgumentList '/S' -Wait

  "[$timestamp] Installation completed." | Out-File -FilePath $logFile -Append -Encoding UTF8
} catch {
  $errMsg = $_.Exception.Message
  "[$timestamp] Error: $errMsg" | Out-File -FilePath $logFile -Append -Encoding UTF8
} finally {
  Remove-Item -Path '${escapedScriptPath}' -Force -ErrorAction SilentlyContinue
}
`.trim()

    fs.writeFileSync(PS_SCRIPT, psScript, 'utf-8')

    const child = spawn('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', PS_SCRIPT
    ], {
      detached: true,
      stdio: 'ignore',
      shell: false
    })

    return new Promise<InstallResult>((resolve) => {
      let spawnCalled = false

      child.on('spawn', () => {
        spawnCalled = true
        child.unref()
        resolve({ success: true })
        // Quit after confirming spawn — PowerShell script waits for process exit
        setTimeout(() => app.quit(), 500)
      })

      child.on('error', (err) => {
        console.error('install-update: spawn error:', err)
        if (!spawnCalled) resolve({ success: false, error: err.message })
      })

      // Fallback timeout
      setTimeout(() => {
        if (!spawnCalled) {
          child.kill()
          resolve({ success: false, error: 'Spawn timeout' })
        }
      }, 5000)
    })
  } catch (err: any) {
    return { success: false, error: err.message || 'Installation failed' }
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/main/update/installer.ts
git commit -m "feat(update): replace batch script with PowerShell installer"
```

---

### Task 6: IPC 入口模块 `index.ts` — 状态机与 IPC handlers

**Files:**
- Create: `src/main/update/index.ts`
- Modify: `src/main/index.ts` (更新 import 路径)

**Interfaces:**
- Consumes: `compareVersions`, `fetchJson`, `downloadWithRetry` from `./network`; `runInstaller`, `getUpdateFilePath` from `./installer`; types from `./types`
- Produces: `registerUpdateHandlers(): void`

- [ ] **Step 1: 创建 index.ts 状态机与 IPC handlers**

创建 `src/main/update/index.ts`：

```typescript
import { ipcMain, app } from 'electron'
import fs from 'fs'
import { compareVersions, fetchJson, downloadWithRetry, cleanupFile } from './network'
import { runInstaller, getUpdateFilePath } from './installer'
import { UpdateInfo, UpdateStatus } from './types'

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

  ipcMain.handle('get-update-status', async (): Promise<UpdateStatus> => {
    const updateFile = getUpdateFilePath()
    if (fs.existsSync(updateFile)) {
      const stat = fs.statSync(updateFile)
      if (stat.size > 0) {
        return { state: 'downloaded' }
      }
    }
    return { state: 'idle' }
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
```

- [ ] **Step 2: 更新 src/main/index.ts 的 import**

修改 `src/main/index.ts` 第 8 行：

```typescript
// 旧:
import { registerUpdateHandlers } from './handlers/updateHandlers'
// 新:
import { registerUpdateHandlers } from './update'
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/main/update/index.ts src/main/index.ts
git commit -m "feat(update): add update index module with state machine and IPC handlers"
```

---

### Task 7: 删除旧的 updateHandlers.ts

**Files:**
- Delete: `src/main/handlers/updateHandlers.ts`

- [ ] **Step 1: 删除旧文件**

```bash
rm src/main/handlers/updateHandlers.ts
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误（旧文件已不被引用）

- [ ] **Step 3: Commit**

```bash
git add -A src/main/handlers/updateHandlers.ts
git commit -m "refactor(update): remove old updateHandlers.ts"
```

---

### Task 8: 更新类型定义 `electron.d.ts`

**Files:**
- Modify: `src/shared/electron.d.ts`

**Interfaces:**
- Consumes: `UpdateInfo`, `UpdateProgress`, `UpdateStatus` from `./types`（或内联定义）
- Produces: 更新后的 `Window.electronAPI` 类型

- [ ] **Step 1: 更新 electron.d.ts 类型定义**

修改 `src/shared/electron.d.ts`：

```typescript
import type { AppItem, Category, Subcategory, Config } from './types'

export interface UpdateInfo {
  available: boolean
  version?: string
  downloadUrl?: string
  releaseNotes?: string
  error?: string
}

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'
  version?: string
  progress?: UpdateProgress
  error?: string
  releaseNotes?: string
}

declare global {
  interface Window {
    electronAPI: {
      // ... existing methods ...
      getVersion: () => Promise<string>
      checkForUpdate: () => Promise<UpdateInfo>
      getUpdateStatus: () => Promise<UpdateStatus>
      downloadUpdate: (downloadUrl?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      installUpdate: (filePath: string) => Promise<boolean>
      onUpdateProgress: (callback: (data: UpdateProgress) => void) => () => void
    }
  }
}

export {}
```

注意：保留所有现有方法（getConfig, saveConfig 等），只修改/添加更新相关的类型。

- [ ] **Step 2: 更新 preload.ts**

修改 `src/main/preload.ts`，添加 `getUpdateStatus` 方法：

```typescript
// 在现有方法后添加:
getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit` (全量检查)
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/shared/electron.d.ts src/main/preload.ts
git commit -m "feat(update): update type definitions and preload for new update API"
```

---

### Task 9: 前端 Hook `useUpdate.ts`

**Files:**
- Create: `src/renderer/src/hooks/useUpdate.ts`

**Interfaces:**
- Consumes: `window.electronAPI` methods
- Produces: `useUpdate(): UseUpdateReturn`

- [ ] **Step 1: 创建 useUpdate hook**

创建 `src/renderer/src/hooks/useUpdate.ts`：

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import type { UpdateInfo, UpdateProgress } from '../../../../shared/electron.d'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'

interface UseUpdateReturn {
  state: UpdateState
  version?: string
  progress?: UpdateProgress
  error?: string
  releaseNotes?: string
  currentVersion: string

  checkForUpdate: () => Promise<void>
  retryDownload: () => Promise<void>
  confirmInstall: () => Promise<void>
  dismissUpdate: () => void
}

export function useUpdate(): UseUpdateReturn {
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState<string | undefined>()
  const [progress, setProgress] = useState<UpdateProgress | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>()
  const [currentVersion, setCurrentVersion] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>()

  const mountedRef = useRef(true)

  // Load current version on mount
  useEffect(() => {
    window.electronAPI.getVersion().then(v => {
      if (mountedRef.current) setCurrentVersion(v)
    }).catch(() => {})
  }, [])

  // Auto-check for updates on mount
  useEffect(() => {
    checkForUpdateInternal(true)
  }, [])

  // Progress listener
  useEffect(() => {
    const unsub = window.electronAPI.onUpdateProgress((data) => {
      if (mountedRef.current) setProgress(data)
    })
    return unsub
  }, [])

  const checkForUpdateInternal = useCallback(async (autoDownload = false) => {
    if (mountedRef.current) setState('checking')
    try {
      const info = await window.electronAPI.checkForUpdate()
      if (!mountedRef.current) return

      if (info.available) {
        setVersion(info.version)
        setDownloadUrl(info.downloadUrl)
        setReleaseNotes(info.releaseNotes)

        if (autoDownload) {
          // Auto-download on startup
          setState('available')
          await startDownloadInternal(info.downloadUrl)
        } else {
          setState('available')
        }
      } else {
        setState('idle')
        if (info.error) setError(info.error)
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('idle')
        setError(err.message)
      }
    }
  }, [startDownloadInternal])

  const startDownloadInternal = useCallback(async (url?: string) => {
    if (mountedRef.current) {
      setState('downloading')
      setProgress(undefined)
      setError(undefined)
    }

    try {
      const result = await window.electronAPI.downloadUpdate(url)
      if (!mountedRef.current) return

      if (result.success && result.filePath) {
        setState('downloaded')
      } else {
        setState('idle')
        setError(result.error || 'Download failed')
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('idle')
        setError(err.message)
      }
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    await checkForUpdateInternal(false)
  }, [checkForUpdateInternal])

  const retryDownload = useCallback(async () => {
    await startDownloadInternal(downloadUrl)
  }, [startDownloadInternal, downloadUrl])

  const confirmInstall = useCallback(async () => {
    if (mountedRef.current) setState('installing')
    try {
      await window.electronAPI.installUpdate('')
    } catch (err: any) {
      if (mountedRef.current) {
        setState('downloaded')
        setError(err.message)
      }
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    if (mountedRef.current) setState('idle')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  return {
    state,
    version,
    progress,
    error,
    releaseNotes,
    currentVersion,
    checkForUpdate,
    retryDownload,
    confirmInstall,
    dismissUpdate
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useUpdate.ts
git commit -m "feat(update): add useUpdate hook with state machine and auto-download"
```

---

### Task 10: 前端组件 `UpdateButton.tsx`

**Files:**
- Create: `src/renderer/src/components/UpdateButton.tsx`

**Interfaces:**
- Consumes: `useUpdate()` hook 的返回值
- Produces: `UpdateButton` React 组件

- [ ] **Step 1: 创建 UpdateButton 组件**

创建 `src/renderer/src/components/UpdateButton.tsx`：

```tsx
import React from 'react'
import type { UpdateProgress } from '../../../../shared/electron.d'

interface UpdateButtonProps {
  state: string
  version?: string
  progress?: UpdateProgress
}

export function UpdateButton({ state, version, progress }: UpdateButtonProps) {
  if (state !== 'downloading') return null

  return (
    <div className="px-3.5 py-1.5 bg-brand-500/10 text-brand-600 rounded-lg text-sm font-medium flex items-center gap-1.5">
      <svg
        className="animate-spin"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          strokeDasharray="50"
          strokeDashoffset={50 - (progress?.percent || 0) / 2}
        />
      </svg>
      {progress ? `${progress.percent}%` : '下载中...'}
    </div>
  )
}
```

- [ ] **Step 2: 创建 UpdateDialog 组件**

在同一文件中添加安装确认弹窗组件：

```tsx
interface UpdateDialogProps {
  version?: string
  releaseNotes?: string
  onConfirm: () => void
  onDismiss: () => void
}

export function UpdateDialog({ version, releaseNotes, onConfirm, onDismiss }: UpdateDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">
          🎉 新版本 v{version} 已准备就绪
        </h3>
        {releaseNotes && (
          <div className="text-sm text-slate-600 mb-4 max-h-40 overflow-y-auto">
            <p className="font-medium mb-1">更新内容：</p>
            <div className="whitespace-pre-wrap">{releaseNotes}</div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            立即安装
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/UpdateButton.tsx
git commit -m "feat(update): add UpdateButton and UpdateDialog components"
```

---

### Task 11: 集成到 App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useUpdate()` hook, `UpdateButton`, `UpdateDialog` 组件
- Produces: 移除 App.tsx 中的内联更新逻辑

- [ ] **Step 1: 添加 imports**

在 App.tsx 顶部添加：

```typescript
import { useUpdate } from './hooks/useUpdate'
import { UpdateButton, UpdateDialog } from './components/UpdateButton'
```

- [ ] **Step 2: 在 App 组件内使用 useUpdate hook**

在 `function App() {` 后，替换现有的 update 相关 state：

```typescript
// 旧 (移除):
// const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
// const [updateDownloading, setUpdateDownloading] = useState(false)
// const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)
// const [updateFilePath, setUpdateFilePath] = useState<string | null>(null)
// const [currentVersion, setCurrentVersion] = useState('')

// 新:
const {
  state: updateState,
  version: updateVersion,
  progress: updateProgress,
  releaseNotes: updateReleaseNotes,
  currentVersion,
  checkForUpdate: manualCheckForUpdate,
  retryDownload,
  confirmInstall,
  dismissUpdate
} = useUpdate()
```

- [ ] **Step 3: 移除旧的 useEffect hooks**

移除 App.tsx 中以下 useEffect（约 103-119 行）：

```typescript
// 旧 (移除):
// useEffect(() => {
//   window.electronAPI.getVersion().then(setCurrentVersion).catch(() => {})
//   window.electronAPI.checkForUpdate().then(info => { setUpdateInfo(info) }).catch(() => {})
// }, [])
//
// useEffect(() => {
//   const unsub = window.electronAPI.onUpdateProgress((data) => { setUpdateProgress(data) })
//   return unsub
// }, [])
```

- [ ] **Step 4: 替换 header 中的更新按钮**

替换 App.tsx 中约 953-1006 行的更新按钮代码：

```tsx
{/* 旧 (移除): {updateInfo?.available && (...)} */}

{/* 新: */}
<UpdateButton state={updateState} version={updateVersion} progress={updateProgress ?? undefined} />
```

- [ ] **Step 5: 添加安装确认弹窗**

在 App.tsx 的 JSX 最外层（`return (...)` 内部末尾）添加：

```tsx
{updateState === 'downloaded' && (
  <UpdateDialog
    version={updateVersion}
    releaseNotes={updateReleaseNotes}
    onConfirm={confirmInstall}
    onDismiss={dismissUpdate}
  />
)}
```

- [ ] **Step 6: 更新设置页的 "关于" 部分**

设置页中的更新检查 UI 需要适配新的 hook。设置页组件（在 App.tsx 内联）当前使用局部 state `checking` / `checked` / `localUpdateInfo`。由于 `useUpdate` hook 已管理全局更新状态，设置页应使用 hook 返回的状态。

在设置页的 "关于" 部分（约 1663-1717 行），替换为：

```tsx
<div className="mb-5">
  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
    <span>ℹ️</span> 关于
  </h3>
  <div className="p-3 bg-brand-50/50 rounded-xl">
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-700">当前版本</span>
      <span className="text-sm font-mono text-slate-500">{currentVersion ? `v${currentVersion}` : '...'}</span>
    </div>
    <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-100/50">
      <span className="text-sm text-slate-600">检查更新</span>
      <button
        disabled={updateState === 'checking'}
        onClick={manualCheckForUpdate}
        className="px-3 py-1 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-xs font-medium transition-colors disabled:opacity-50"
      >
        {updateState === 'checking' ? '检查中...' : '检查更新'}
      </button>
    </div>
    {updateState === 'checking' && (
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
        <svg className="animate-spin w-4 h-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" /></svg>
        <span className="text-sm text-slate-500">正在检查更新...</span>
      </div>
    )}
    {updateState === 'available' && (
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
        <span className="text-sm text-emerald-500">🎉</span>
        <span className="text-sm text-brand-600 font-medium">发现新版本 v{updateVersion}</span>
      </div>
    )}
    {updateState === 'idle' && !error && (
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
        <span className="text-sm text-emerald-500">✓</span>
        <span className="text-sm text-emerald-600">已是最新版本</span>
      </div>
    )}
    {error && (
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-100/50">
        <span className="text-sm text-red-500">✕</span>
        <span className="text-sm text-red-500">检查失败：{error}</span>
      </div>
    )}
  </div>
</div>
```

同时移除设置页组件内不再需要的局部 state：`checking`, `checked`, `localUpdateInfo`。

- [ ] **Step 7: 清理未使用的 imports**

移除 App.tsx 中不再需要的 import：

```typescript
// 可能需要移除:
// import type { UpdateInfo, UpdateProgress } from '../../shared/electron.d'
```

- [ ] **Step 8: 验证完整编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(update): integrate useUpdate hook and UpdateButton into App"
```

---

### Task 12: 最终验证与清理

**Files:**
- Verify: 所有修改过的文件

- [ ] **Step 1: 完整 TypeScript 编译检查**

Run: `npx tsc --noEmit && npx tsc -p tsconfig.main.json --noEmit`
Expected: 无类型错误

- [ ] **Step 2: 检查无遗留引用**

Run: `grep -r "updateHandlers" src/`
Expected: 无匹配结果

- [ ] **Step 3: 检查新模块结构**

Run: `ls src/main/update/`
Expected: types.ts, network.ts, installer.ts, index.ts

- [ ] **Step 4: 构建验证**

Run: `npm run build` (或项目配置的构建命令)
Expected: 构建成功

- [ ] **Step 5: 功能测试**

手动测试：
1. 启动应用，检查是否自动检测更新
2. 如果有更新，是否自动开始下载
3. 下载进度是否正确显示
4. 下载完成后是否弹出确认对话框
5. 点击"立即安装"是否正确退出并安装
6. 点击"稍后再说"是否关闭弹窗
7. 设置页手动检查更新是否正常工作

- [ ] **Step 6: Final Commit**

```bash
git add -A
git commit -m "refactor(update): complete auto-update refactoring"
```
