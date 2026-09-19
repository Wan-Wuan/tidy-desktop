import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * 更新安装日志。
 *
 * 更新链路的最后一环（派生安装助手 → 等主进程退出 → 启动 NSIS 安装器）全部发生在
 * 主进程即将消失之后，一旦安装失败，用户和开发者都拿不到任何现场。这里把每个关键
 * 步骤落到 %TEMP%\tidy-desktop-install.log，装不上时至少能查。
 *
 * 硬性约束：**日志本身永远不能抛异常**。它跑在整条链路最不能失败的路径上，
 * 写日志失败不能反过来把更新流程搞挂，所以每个函数都整体包在 try/catch 里。
 */

const LOG_FILE_NAME = 'tidy-desktop-install.log'
const MAX_LOG_BYTES = 256 * 1024
const TRIM_TO_BYTES = 64 * 1024

/** 一次安装会话的终点标记：助手进程在安装器退出时写入 */
export const DONE_MARK = 'installer exited'

export function getInstallLogPath(): string {
  return path.join(app.getPath('temp'), LOG_FILE_NAME)
}

function formatDetail(detail: unknown): string {
  if (detail === undefined) return ''
  if (typeof detail === 'string') return detail
  if (detail instanceof Error) return `${detail.message}${detail.stack ? `\n${detail.stack}` : ''}`
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

/** 超过上限时截断，只保留尾部，避免日志无限增长 */
function trimIfTooLarge(filePath: string): void {
  try {
    if (fs.statSync(filePath).size <= MAX_LOG_BYTES) return
    const raw = fs.readFileSync(filePath, 'utf-8')
    const head = `[${new Date().toISOString()}] [log] 日志超过上限，仅保留最后 ${Math.round(TRIM_TO_BYTES / 1024)}KB\n`
    fs.writeFileSync(filePath, head + raw.slice(-TRIM_TO_BYTES), 'utf-8')
  } catch {
    /* ignore */
  }
}

/** 文件不存在时先写一段表头，方便用户直接把日志发出来 */
export function ensureInstallLogHeader(context?: Record<string, unknown>): void {
  try {
    const filePath = getInstallLogPath()
    if (fs.existsSync(filePath)) return
    let version = 'unknown'
    let exePath = 'unknown'
    try {
      version = app.getVersion()
      exePath = app.getPath('exe')
    } catch {
      /* 早期调用时 app 可能还不可用，留 unknown 即可 */
    }
    const header = [
      '=== tidy-desktop 更新安装日志 ===',
      `应用版本  : ${version}`,
      `可执行文件: ${exePath}`,
      `运行环境  : ${process.platform} ${process.arch} / Node ${process.versions.node}`,
      context ? `上下文    : ${formatDetail(context)}` : null,
      `创建时间  : ${new Date().toISOString()}`,
      '=== 以下为更新安装时间线 ==='
    ].filter(Boolean).join('\n')
    fs.writeFileSync(filePath, `${header}\n`, 'utf-8')
  } catch {
    /* ignore */
  }
}

/** 追加一条带时间戳的日志。任何异常都被吞掉，绝不影响更新流程。 */
export function installLog(step: string, detail?: unknown): void {
  try {
    const filePath = getInstallLogPath()
    trimIfTooLarge(filePath)
    const suffix = detail === undefined ? '' : ` | ${formatDetail(detail)}`
    fs.appendFileSync(filePath, `[${new Date().toISOString()}] [pid ${process.pid}] ${step}${suffix}\n`, 'utf-8')
  } catch {
    /* 日志失败不能影响更新流程 */
  }
}
