import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/**
 * 更新安装助手。
 *
 * 更新流程的最后一环有个硬性约束：必须先等主进程**真正退出**，才能覆盖安装目录里的
 * 文件（Windows 会锁住运行中的 exe）。
 *
 * 旧实现把这件事交给一段外部脚本（经 cmd 拉起脚本宿主执行），但那些组件在受限环境里
 * 不一定可用——组策略可能禁用脚本宿主、执行策略可能被锁死、精简版系统甚至可能没有。
 * 一旦不可用，用户就会看到"下载完成了但装不上"。
 *
 * 现在改由**应用自己的可执行文件**派生一个助手进程来承担，等待与启动全部用 Node
 * 内置能力完成，不依赖任何外部命令解释器。
 */

export type UpdateAssistantOptions = {
  /** NSIS 安装包路径 */
  installerPath: string
  /** 需要等待退出的主进程 PID */
  waitPid: number
  /** 安装目标目录（传给 NSIS 的 /D=） */
  installDir: string
}

const ASSISTANT_FLAG = '--tidy-update-install'

function readArg(argv: string[], name: string): string | null {
  const prefix = `--tidy-${name}=`
  const hit = argv.find(a => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

/**
 * 判断本次启动是否为安装助手。
 * 同时校验安装包路径：只允许位于系统临时目录内，避免被当成任意程序的启动器。
 */
export function parseUpdateAssistantArgs(argv: string[]): UpdateAssistantOptions | null {
  if (!argv.includes(ASSISTANT_FLAG)) return null

  const installerPath = readArg(argv, 'installer')
  const installDir = readArg(argv, 'install-dir')
  const waitPid = Number(readArg(argv, 'wait-pid'))

  if (!installerPath || !installDir || !Number.isFinite(waitPid) || waitPid <= 0) return null

  const tempDir = path.resolve(app.getPath('temp'))
  const resolvedInstaller = path.resolve(installerPath)
  if (path.dirname(resolvedInstaller) !== tempDir) return null

  return { installerPath: resolvedInstaller, waitPid, installDir }
}

/** 探测进程是否存活。signal 0 只做存在性检查，不会真的给目标发信号。 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 等到目标进程退出，最多 timeoutMs 毫秒。纯 Node 轮询，不调用任何外部命令。 */
function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise(resolve => {
    const tick = () => {
      if (!isPidAlive(pid)) {
        resolve(true)
        return
      }
      if (Date.now() >= deadline) {
        resolve(false)
        return
      }
      setTimeout(tick, 250)
    }
    tick()
  })
}

/**
 * 助手主体：等主进程退出后静默启动安装器。
 * /D= 必须是最后一个参数，这是 NSIS 的要求。
 */
export async function runUpdateAssistant(opts: UpdateAssistantOptions): Promise<void> {
  await waitForPidExit(opts.waitPid, 120_000)

  if (!fs.existsSync(opts.installerPath)) {
    console.error('update assistant: installer missing at', opts.installerPath)
    return
  }

  spawn(opts.installerPath, ['/S', '--force-run', `/D=${opts.installDir}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref()
}
