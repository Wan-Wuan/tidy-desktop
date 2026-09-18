import path from 'path'
import { app } from 'electron'

/**
 * 应用内部的 URL 放行策略。
 *
 * 抽成独立模块的原因有两个：一是 `index.ts`（窗口创建）和 `ipcGuard.ts`（IPC 来源校验）
 * 都要用，放在 index 里会形成循环依赖；二是此前这段判断在仓库里散落了四处、
 * 实现还不一致，收敛到一处才能保证「什么算内部页面」只有一个定义。
 */

const isDev = !app.isPackaged

/** 渲染层产物目录：生产环境只允许导航到这里面的文件 */
export const RENDERER_ROOT = path.resolve(__dirname, '../../renderer')

/**
 * 判断是不是「应用自己的页面」。
 *
 * 注意生产分支：以前这里直接放行任意 `file:`，意味着磁盘上任何一个本地 HTML
 * 都能被导航进来，而它一旦进来就带着 preload 暴露的全部能力（开任意程序、
 * 提权启动、读写剪贴板……）。现在收敛到自身渲染层目录内。
 */
export function isAllowedInternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (isDev) {
      return url.origin === 'http://localhost:5173'
    }
    if (url.protocol !== 'file:') return false
    let pathname = decodeURIComponent(url.pathname)
    // Windows 下 file:// 的 pathname 形如 /D:/dir/file.html，开头的斜杠要先去掉
    if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1)
    const target = path.resolve(pathname)
    const relative = path.relative(RENDERER_ROOT, target)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  } catch {
    return false
  }
}

/** 判断是不是可以交给系统浏览器打开的外部链接 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
