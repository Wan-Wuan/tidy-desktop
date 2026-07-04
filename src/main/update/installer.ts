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

function getCurrentInstallDir(): string {
  try {
    return path.dirname(app.getPath('exe'))
  } catch {
    return path.dirname(process.execPath)
  }
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
    const installDir = getCurrentInstallDir()
    const escapedInstallerPath = installerPath.replace(/'/g, "''")
    const escapedInstallDir = installDir.replace(/'/g, "''")
    const escapedLogPath = INSTALL_LOG.replace(/'/g, "''")
    const escapedScriptPath = PS_SCRIPT.replace(/'/g, "''")

    const psScript = `
try {
  $logFile = '${escapedLogPath}'
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "[$ts] Waiting for app PID ${currentPid} to exit..." | Out-File -FilePath $logFile -Encoding UTF8

  try {
    Wait-Process -Id ${currentPid} -Timeout 30
  } catch {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "[$ts] Wait timed out or process already exited; continuing installer." | Out-File -FilePath $logFile -Append -Encoding UTF8
  }

  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "[$ts] App exited, starting installer for '${escapedInstallDir}'..." | Out-File -FilePath $logFile -Append -Encoding UTF8
  $installDir = '${escapedInstallDir}'
  $installerArgs = "/S --force-run /D=$installDir"
  Start-Process -FilePath '${escapedInstallerPath}' -ArgumentList $installerArgs -Wait

  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "[$ts] Installation completed, app start requested." | Out-File -FilePath $logFile -Append -Encoding UTF8
} catch {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $errMsg = $_.Exception.Message
  "[$ts] Error: $errMsg" | Out-File -FilePath $logFile -Append -Encoding UTF8
} finally {
  Remove-Item -Path '${escapedScriptPath}' -Force -ErrorAction SilentlyContinue
}
`.trim()

    fs.writeFileSync(PS_SCRIPT, psScript, 'utf-8')

    // Use cmd /c start to launch PowerShell as a fully independent process
    // This ensures the script survives after app.quit() on Windows
    const child = spawn('cmd.exe', [
      '/c', 'start', '', 'powershell',
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
        // Force exit immediately — skip window close handlers that would hide instead of quit
        // PowerShell script (cmd /c start) is already independent, no need to wait
        setTimeout(() => app.exit(0), 500)
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
    return Promise.resolve({ success: false, error: err.message || 'Installation failed' })
  }
}
