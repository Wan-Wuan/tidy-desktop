# Fix Update Race Condition Design

## Problem

When installing a new version via auto-update, the NSIS installer fails with:
"Failed to uninstall old application files. Please try running the installer again.: 2"

**Root cause:** Race condition between installer's uninstall phase and app exit.

Current flow in `updateHandlers.ts`:
1. Spawn installer with `/S` (silent mode)
2. Wait 2 seconds
3. Call `app.quit()`

The NSIS uninstaller starts immediately and tries to rename/remove old files, but the app is still running and has file locks.

## Solution

Replace direct installer spawn with a batch script that:
1. Waits for the app process to fully exit
2. Then launches the installer
3. Self-cleans after execution

## Implementation

### Changes to `src/main/handlers/updateHandlers.ts`

**Replace `install-update` handler:**

```typescript
ipcMain.handle('install-update', (_, filePath: string) => {
  const installerPath = filePath || UPDATE_FILE
  if (!fs.existsSync(installerPath)) {
    return false
  }

  // Validate path
  const resolvedPath = path.resolve(installerPath)
  const expectedPath = path.resolve(UPDATE_FILE)
  if (resolvedPath !== expectedPath) {
    console.error('install-update: rejected path mismatch:', resolvedPath)
    return false
  }

  try {
    const batPath = path.join(app.getPath('temp'), 'tidy-desktop-update.bat')
    const appName = path.basename(process.execPath)

    // Write batch script with timeout protection (30s max wait)
    const batContent = `@echo off
setlocal
set TIMEOUT=30
set ELAPSED=0

:wait_loop
tasklist /FI "IMAGENAME eq ${appName}" 2>nul | find /I "${appName}" >nul
if errorlevel 1 (
    goto :install
)
timeout /t 1 /nobreak >nul
set /a ELAPSED+=1
if %ELAPSED% geq %TIMEOUT% (
    goto :install
)
goto :wait_loop

:install
start "" "${installerPath.replace(/\//g, '\\')}" /S
timeout /t 2 /nobreak >nul
del "%~f0"
`

    fs.writeFileSync(batPath, batContent, 'utf-8')

    const child = spawn(batPath, [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    })

    return new Promise<boolean>((resolve) => {
      let spawnCalled = false
      child.on('spawn', () => {
        spawnCalled = true
        child.unref()
        resolve(true)
        // Quit after confirming spawn
        setTimeout(() => app.quit(), 500)
      })
      child.on('error', (err) => {
        console.error('install-update: spawn error:', err)
        if (!spawnCalled) resolve(false)
      })
      setTimeout(() => {
        if (!spawnCalled) {
          child.kill()
          resolve(false)
        }
      }, 5000)
    })
  } catch {
    return false
  }
})
```

### Key Safety Features

1. **30-second timeout** - If app doesn't exit within 30 seconds, installer proceeds anyway
2. **Path validation** - Only allows running the expected update file
3. **Self-cleaning batch** - Batch script deletes itself after execution
4. **Spawn verification** - Waits for spawn confirmation before quitting

## Testing

1. Build app with `npm run electron:build`
2. Install the built version
3. Create a new release with higher version
4. Trigger update from within the app
5. Verify installer completes successfully
