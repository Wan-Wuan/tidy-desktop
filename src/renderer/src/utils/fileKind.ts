import type { AppItem } from '../../../shared/types'
import { DOC_FILE_EXTS, isImageFile } from '../../../shared/utils'

/**
 * 文件类别判定。
 *
 * 为什么单独放一个文件：`AppCard.tsx` 是组件文件，在里面导出普通函数会让
 * React Fast Refresh 失效（它要求一个文件只导出组件）。
 * 拖拽引擎、卡片发送按钮、右键菜单都依赖这两个判断，所以放在这里共用。
 */

/** 是不是「文档」类文件（按扩展名判定，且必须是 app 类型） */
export function isDocFile(app: AppItem): boolean {
  if (app.type !== 'app') return false
  const ext = app.path.toLowerCase().substring(app.path.lastIndexOf('.'))
  return DOC_FILE_EXTS.includes(ext)
}

/** 能否拖出窗口交给外部应用（微信、浏览器等）：图片与文档 */
export function canNativeDrag(app: AppItem): boolean {
  return isDocFile(app) || isImageFile(app)
}
