import { BrowserWindow } from 'electron'
import { isNativeDialogOpen, onNativeDialogsClosed } from './dialogGuard'

/** 失焦后等多久再隐藏：留出「用户只是点了一下别处又回来」的容错窗口 */
const BLUR_HIDE_DELAY_MS = 200

export interface BlurAutoHideOptions {
  /** 读取最新配置：该窗口当前是否开启了失焦自动隐藏（每次重新读，避免用到过期配置） */
  isEnabled: () => boolean
  /** 额外的保留条件，返回 true 表示这次不隐藏（如本应用其它窗口仍在前台） */
  shouldKeepVisible?: (win: BrowserWindow) => boolean
  /** 未开启自动隐藏时的既有行为（快速搜索窗口用它把失焦事件转发给渲染层） */
  onAutoHideDisabled?: (win: BrowserWindow) => void
}

/**
 * 给窗口挂上「失焦自动隐藏」。
 *
 * 判定顺序（全部通过才 hide）：
 *   1. 延时窗口内没有重新获得焦点
 *   2. 没有别的保留条件（如本应用其它窗口仍在前台）
 *   3. 配置里开着该窗口的失焦自动隐藏
 *   4. **当前没有原生对话框在场**（见 dialogGuard）
 *
 * 第 4 条只针对主进程的原生对话框（打开/保存文件、确认框）——它们是独立窗口，
 * 主窗口藏了就会留下一个没有归属的弹窗。应用自己的界面（设置等模态框、提示框、
 * toast）一律不拦：它们画在窗口内部，藏起来就一起藏起来，重新打开时状态还在。
 *
 * 第 4 条不是「取消隐藏」，而是**推迟**：记下 pendingHide，等对话框关闭后重走一遍
 * 完整校验再隐藏。这样对话框关掉后窗口会紧接着收起，不会一直留在屏幕上。
 *
 * 注意第 1 条要重跑一次：原生对话框关闭时焦点回归比 endNativeDialog 稍晚，
 * 若不等一个延时窗口，会出现「刚点完确定、窗口就没了」。
 */
export function attachBlurAutoHide(win: BrowserWindow, options: BlurAutoHideOptions): void {
  let hideTimer: NodeJS.Timeout | null = null
  /** 因为「有原生对话框在场」而没能执行的那次隐藏 */
  let pendingHide = false

  const cancelTimer = () => {
    if (!hideTimer) return
    clearTimeout(hideTimer)
    hideTimer = null
  }

  const stopPending = () => {
    cancelTimer()
    pendingHide = false
  }

  const evaluate = (runFallback: boolean) => {
    hideTimer = null
    if (win.isDestroyed()) return
    // 焦点已经回来 / 本应用其它窗口在前台 → 这次不该隐藏
    if (win.isFocused() || options.shouldKeepVisible?.(win)) {
      pendingHide = false
      return
    }
    if (!options.isEnabled()) {
      pendingHide = false
      if (runFallback) options.onAutoHideDisabled?.(win)
      return
    }
    // 有原生对话框在场 → 推迟，等它关掉再补（见下方 onNativeDialogsClosed）
    if (isNativeDialogOpen()) {
      pendingHide = true
      return
    }
    pendingHide = false
    win.hide()
  }

  const schedule = (runFallback: boolean) => {
    cancelTimer()
    hideTimer = setTimeout(() => evaluate(runFallback), BLUR_HIDE_DELAY_MS)
  }

  win.on('blur', () => schedule(true))
  // 重新获得焦点 = 用户回来了：撤掉待执行的隐藏，也不再补隐藏
  win.on('focus', stopPending)

  const unsubscribe = onNativeDialogsClosed(() => {
    if (!pendingHide || win.isDestroyed()) return
    schedule(true)
  })

  win.on('closed', () => {
    stopPending()
    unsubscribe()
  })
}
