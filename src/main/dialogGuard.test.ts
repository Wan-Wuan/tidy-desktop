import { describe, expect, it, vi } from 'vitest'
import {
  beginNativeDialog,
  endNativeDialog,
  guardNativeDialog,
  isNativeDialogOpen,
  onNativeDialogsClosed
} from './dialogGuard'

/* 这些用例都自己收尾（打开的对话框全部关闭），避免模块级计数串到下一个用例。 */
describe('dialogGuard', () => {
  it('嵌套的原生对话框要全部关闭后才通知一次', () => {
    const onClosed = vi.fn()
    const unsubscribe = onNativeDialogsClosed(onClosed)

    expect(isNativeDialogOpen()).toBe(false)

    beginNativeDialog()
    beginNativeDialog()
    expect(isNativeDialogOpen()).toBe(true)

    endNativeDialog() // 还剩一层
    expect(isNativeDialogOpen()).toBe(true)
    expect(onClosed).not.toHaveBeenCalled()

    endNativeDialog() // 全部关闭，此时才该通知
    expect(isNativeDialogOpen()).toBe(false)
    expect(onClosed).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('多余的 endNativeDialog 不会把计数压成负数', () => {
    endNativeDialog()
    endNativeDialog()
    expect(isNativeDialogOpen()).toBe(false)

    beginNativeDialog()
    expect(isNativeDialogOpen()).toBe(true)
    endNativeDialog()
    expect(isNativeDialogOpen()).toBe(false)
  })

  it('guardNativeDialog 包住的调用无论成功还是抛错都会销账', async () => {
    const onClosed = vi.fn()
    const unsubscribe = onNativeDialogsClosed(onClosed)

    await guardNativeDialog(async () => 'ok')
    expect(isNativeDialogOpen()).toBe(false)

    await expect(
      guardNativeDialog(async () => { throw new Error('用户取消') })
    ).rejects.toThrow('用户取消')
    expect(isNativeDialogOpen()).toBe(false)
    expect(onClosed).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('取消订阅后不再收到通知', () => {
    const onClosed = vi.fn()
    const unsubscribe = onNativeDialogsClosed(onClosed)
    unsubscribe()

    beginNativeDialog()
    endNativeDialog()
    expect(onClosed).not.toHaveBeenCalled()
  })
})
