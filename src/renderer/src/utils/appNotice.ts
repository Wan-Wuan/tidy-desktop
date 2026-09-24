/**
 * 应用内提示：替代 window.alert 的窗口内提示框。
 *
 * 为什么要接管 window.alert：
 *   原生 alert 在 Windows 上是一个**独立的系统窗口**，弹出时会夺走主窗口的焦点。
 *   开着「失焦自动隐藏」时，主窗口会在提示还浮在屏幕上的时候被藏起来，
 *   用户点完「确定」才发现主界面已经收起，只能去托盘或快捷键捞回来。
 *   换成窗口内的提示后，既不夺焦，也和应用的玻璃主题一致。
 *
 * 只接管 alert。confirm / prompt 项目里没有使用；需要确认请走
 * window.electronAPI.confirm（主进程原生对话框，已在 dialogGuard 里登记）。
 *
 * 这里刻意不引入 React：它是个纯状态容器，由 AppNoticeDialog 通过
 * useSyncExternalStore 订阅，这样任何模块（含 hook、工具函数）都能直接调用。
 */

let currentMessage: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function subscribeAppNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getAppNotice(): string | null {
  return currentMessage
}

export function showAppNotice(message: unknown): void {
  const text = typeof message === 'string' ? message : String(message ?? '')
  if (!text.trim()) return
  currentMessage = text
  emit()
}

export function dismissAppNotice(): void {
  if (currentMessage === null) return
  currentMessage = null
  emit()
}

/** 用应用内提示替换 window.alert（渲染层入口调用一次） */
export function installAppNotice(): void {
  window.alert = (message?: unknown) => { showAppNotice(message) }
}
