import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { InstallResult } from './types'
import { ensureInstallLogHeader, installLog } from './installLog'

const UPDATE_FILE = path.join(app.getPath('temp'), 'tidy-desktop-update.exe')

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

/**
 * 启动更新安装。
 *
 * 约束：Windows 会锁住运行中的 exe，必须等本进程真正退出后才能覆盖安装目录，
 * 否则 NSIS 会报"安装没有完成"。
 *
 * 旧实现是生成一段外部脚本、再用 `cmd /c start` 拉起脚本宿主去等进程退出并启动安装器。
 * 这套链路依赖系统里存在可用的命令解释器与脚本宿主，而这两者在受限机器上并不保证
 * 存在（组策略禁用、执行策略锁死、精简系统缺组件），一旦缺失用户就卡在"下载完却装不上"。
 *
 * 现在改为派生**应用自己的可执行文件**作为安装助手（见 ./assistant），由它用 Node
 * 内置能力完成等待与启动。整条链路不再需要任何外部命令解释器。
 */
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

    // 表头要在主进程退出前建好：之后这条链路由助手进程接管，
    // 万一助手没能启动，至少能从这里看出「主进程已经交棒了」。
    ensureInstallLogHeader({ installDir, mode: 'spawn-assistant' })
    installLog('handing off to update assistant', `main pid=${currentPid} installDir=${installDir}`)

    const child = spawn(
      process.execPath,
      [
        '--tidy-update-install',
        `--tidy-installer=${resolvedPath}`,
        `--tidy-wait-pid=${currentPid}`,
        `--tidy-install-dir=${installDir}`
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    )

    return new Promise<InstallResult>((resolve) => {
      let settled = false
      const done = (result: InstallResult) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      child.on('spawn', () => {
        child.unref()
        done({ success: true })
        // 先落一条日志再退出：主进程一旦 exit(0) 就不会再有写入机会，
        // 这条记录是判断「助手是否真的起来了」的唯一依据。
        installLog('assistant spawned, main process exiting')
        // 立刻退出：绕开"关闭窗口 = 最小化到托盘"那套逻辑（它会让进程继续常驻）。
        // 安装助手会等这个进程真正消失后再启动安装器，所以退出快慢不影响正确性。
        setTimeout(() => app.exit(0), 300)
      })

      child.on('error', (err) => {
        installLog('assistant spawn failed', err)
        done({ success: false, error: err.message })
      })

      // Fallback timeout
      setTimeout(() => {
        if (!settled) {
          child.kill()
          installLog('assistant spawn timeout')
          done({ success: false, error: 'Spawn timeout' })
        }
      }, 5000)
    })
  } catch (err: any) {
    installLog('installer entry failed', err)
    return Promise.resolve({ success: false, error: err.message || 'Installation failed' })
  }
}
