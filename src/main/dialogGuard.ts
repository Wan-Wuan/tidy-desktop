// 原生对话框守卫。
//
// 背景：「失焦自动隐藏」的成因是用户把焦点移到了别的应用。通常直接藏窗口就行，
// 唯一不能藏的是**原生对话框在场的时候**：dialog.showMessageBox / showOpenDialog
// 这类系统弹窗是独立窗口，会夺走主窗口的焦点；此时把主窗口藏起来，屏幕上就只剩一个
// 没有归属的弹窗，用户点完「确定」才发现主界面不见了（只能去托盘或快捷键捞回来）。
//
// 所以隐藏前必须先问一句「有原生对话框在场吗」。
//
// 刻意**不管**应用自己的浮层——设置/添加应用等模态框、应用内提示框、toast、右键菜单：
// 它们画在窗口内部，窗口藏起来就一起藏起来，不会留下孤儿状态，重新打开窗口时状态还在。
// 早期版本把模态框也拦下来过，结果是「开着设置切到别的应用，窗口死活不收起」，
// 让这个功能变得不可预期（2026-09-24 按用户要求去掉）。

let nativeDialogDepth = 0
const nativeDialogEndListeners = new Set<() => void>()

export function beginNativeDialog(): void {
  nativeDialogDepth += 1
}

export function endNativeDialog(): void {
  if (nativeDialogDepth === 0) return
  nativeDialogDepth -= 1
  emitNativeDialogsClosed()
}

export function isNativeDialogOpen(): boolean {
  return nativeDialogDepth > 0
}

/** 包住一次原生对话框调用：期间登记为「有对话框在场」，结束后自动销账 */
export async function guardNativeDialog<T>(task: () => Promise<T>): Promise<T> {
  beginNativeDialog()
  try {
    return await task()
  } finally {
    endNativeDialog()
  }
}

/** 订阅「原生对话框全部关闭」的边沿事件：因对话框而推迟的隐藏靠它补执行 */
export function onNativeDialogsClosed(listener: () => void): () => void {
  nativeDialogEndListeners.add(listener)
  return () => { nativeDialogEndListeners.delete(listener) }
}

function emitNativeDialogsClosed(): void {
  if (isNativeDialogOpen()) return
  for (const listener of [...nativeDialogEndListeners]) {
    try {
      listener()
    } catch (error) {
      console.error('[dialogGuard] 对话框关闭回调异常', error)
    }
  }
}
