import { ipcMain, dialog, type IpcMainInvokeEvent } from 'electron'
import { pathToFileURL } from 'url'
import { assertSender, assertPath } from '../ipcGuard'
import { guardNativeDialog } from '../dialogGuard'

/** 允许作为背景图 / 托盘图标的图片扩展名。 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.ico', '.svg']

/** 对话框扩展名白名单的上限与清洗：只接受形如 `png` / `.png` 的短串。 */
function normalizeExtensions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 20)
    .map(item => item.replace(/^\./, '').toLowerCase())
    .filter(item => /^[a-z0-9]{1,10}$/.test(item))
  return out.length > 0 ? out : undefined
}

/**
 * 外观个性化（P2）相关 IPC。
 *
 * ⚠️ 为什么**不**把用户选的图片复制进 `icons/` 缓存目录：
 * 图标缓存有一个「刷新全部图标」入口（`clear-icon-cache`），它会删掉缓存目录里的
 * `.png / .ico / .jpg / .jpeg`——背景图放进去会被顺手清掉。
 * 而且背景图 / 托盘图标本来就是"用户自己的文件"，原地引用更符合预期：
 * 文件被移走 → 背景自动失效回退到主题背景，不会留下一个指向缓存的幽灵副本。
 */
export function registerAppearanceHandlers(): void {
  /**
   * 通用的「选一个文件」对话框（背景图 / 托盘图标 / 浏览器可执行文件共用）。
   * 只负责弹框取路径，不复制、不读取内容。
   * 扩展名过滤只是**给用户的便利**，不是安全边界——真正的校验在消费端（`assertPath`）。
   */
  ipcMain.handle('select-file', async (event: IpcMainInvokeEvent, payload: unknown): Promise<string | null> => {
    if (!assertSender(event)) return null
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const extensions = normalizeExtensions(p.extensions)
    const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim().slice(0, 80) : '选择文件'
    try {
      const result = await guardNativeDialog(() => dialog.showOpenDialog({
        title,
        properties: ['openFile'],
        filters: extensions ? [{ name: '文件', extensions }] : []
      }))
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    } catch (error) {
      console.error('Failed to select file:', error)
      return null
    }
  })

  /**
   * 把本地图片的绝对路径换成渲染层可加载的 `file://` URL。
   * 路径先过白名单（绝对 + 存在 + 图片扩展名），杜绝任意文件读取。
   */
  ipcMain.handle('get-local-image-url', (event: IpcMainInvokeEvent, filePath: unknown): string | null => {
    if (!assertSender(event)) return null
    const safe = assertPath(filePath, { extensions: IMAGE_EXTENSIONS, mustExist: true, absolute: true })
    if (!safe) return null
    return pathToFileURL(safe).href
  })
}
