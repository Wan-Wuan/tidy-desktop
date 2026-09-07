// 原生对话框（打开/保存文件、消息确认）会夺走主窗口的焦点。
// 「主界面失焦自动隐藏」开启时若不加保护，用户点「导出备份」会连带把主窗口一起藏掉。
// 这里用一个计数器记录进行中的原生对话框，供失焦隐藏逻辑查询。

let nativeDialogDepth = 0

export function beginNativeDialog(): void {
  nativeDialogDepth += 1
}

export function endNativeDialog(): void {
  nativeDialogDepth = nativeDialogDepth > 0 ? nativeDialogDepth - 1 : 0
}

export function isNativeDialogOpen(): boolean {
  return nativeDialogDepth > 0
}

export async function guardNativeDialog<T>(task: () => Promise<T>): Promise<T> {
  beginNativeDialog()
  try {
    return await task()
  } finally {
    endNativeDialog()
  }
}
