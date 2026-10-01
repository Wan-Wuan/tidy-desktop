/**
 * 渲染层调用原生对话框的统一包装。
 *
 * ⚠️ 为什么不直接 `await window.electronAPI.selectFolder()`：
 * 主进程异常、或 preload 是旧版本（压根没这个方法）时，这个 await 会抛出
 * **未捕获的 Promise rejection**，界面上表现为「按钮点了毫无反应」。
 * 而单测里的 mock 永远 resolve，本地永远复现不出来——只有真机会暴露。
 *
 * 所以凡是渲染层调原生对话框，一律走这里。
 */

/** 文件过滤器，与 `select-file` 通道的入参形状一致 */
export interface FileFilter {
  extensions?: string[]
  title?: string
}

export async function safePickFolder(): Promise<string | null> {
  try {
    return await window.electronAPI.selectFolder()
  } catch (error) {
    console.error('selectFolder failed:', error)
    alert('无法打开文件夹选择器，请重试。')
    return null
  }
}

export async function safePickFile(filter?: FileFilter): Promise<string | null> {
  try {
    return await window.electronAPI.selectFile(filter)
  } catch (error) {
    console.error('selectFile failed:', error)
    alert('无法打开文件选择器，请重试。')
    return null
  }
}
