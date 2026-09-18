import fs from 'fs'
import path from 'path'
import { BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { isAllowedInternalUrl } from './urlPolicy'

/**
 * IPC 入口的统一校验。
 *
 * 背景：`preload.ts` 向渲染层暴露了 60 多个方法，其中包含提权启动程序、安装任意 exe、
 * 关机/重启、读写剪贴板、按任意路径提取图标等能力；而全部 49 处 IPC 注册里，
 * 此前只有 3 处（窗口 resize）校验过调用来源。
 *
 * 这不是"已经被利用"，而是「渲染层一旦出问题（XSS、第三方内容、误导航），
 * 主进程就没有第二道防线」。这里补上这道防线。
 */

type AnyIpcEvent = IpcMainInvokeEvent | IpcMainEvent

/**
 * 校验事件来源确实是本应用自己的窗口与页面。
 *
 * 两道检查：
 *   1. 发送者必须属于一个存活的应用窗口（挡掉来路不明的 webContents）
 *   2. 该窗口当前页面必须是应用自己的内部 URL（挡掉被导航到外部/本地任意 HTML 的窗口）
 */
export function assertSender(event: AnyIpcEvent): boolean {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return false
    const frame = event.senderFrame
    if (!frame) return false
    return isAllowedInternalUrl(frame.url)
  } catch {
    return false
  }
}

export interface PathGuardOptions {
  /** 允许的扩展名（小写、含点）。为空表示不限制 */
  extensions?: string[]
  /** 是否要求路径必须存在，默认 true */
  mustExist?: boolean
  /** 允许的最大长度，默认 4096 */
  maxLength?: number
  /** 是否必须是绝对路径，默认 true */
  absolute?: boolean
}

/**
 * 校验一个「文件系统路径」入参。
 *
 * 校验通过返回规范化后的路径，否则返回 null（调用方应当直接拒绝，不要回退到未校验的值）。
 */
export function assertPath(value: unknown, options: PathGuardOptions = {}): string | null {
  const { extensions, mustExist = true, maxLength = 4096, absolute = true } = options

  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!candidate || candidate.length > maxLength) return null
  // NUL 字节可以截断底层系统调用的路径，是经典的路径绕过手法
  if (candidate.includes('\0')) return null
  if (absolute && !path.isAbsolute(candidate)) return null

  if (extensions && extensions.length > 0) {
    const ext = path.extname(candidate).toLowerCase()
    if (!extensions.includes(ext)) return null
  }

  if (mustExist) {
    try {
      if (!fs.existsSync(candidate)) return null
    } catch {
      return null
    }
  }

  return path.resolve(candidate)
}

/**
 * 校验字符串入参（带长度上限）。
 * 返回 null 表示不合法。
 */
export function assertString(value: unknown, maxLength = 4096): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > maxLength) return null
  return value
}

/** 可执行文件白名单：只有这些扩展名允许被提权启动 */
export const LAUNCHABLE_EXTENSIONS = ['.exe', '.bat', '.cmd', '.lnk', '.com', '.msc']
