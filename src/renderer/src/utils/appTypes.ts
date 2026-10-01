import type { AppItemType } from '../../../shared/types'

/**
 * 项目类型的展示元数据。
 *
 * AddAppModal 与 EditAppModal 共用一份，避免「加了一个新类型、只改了其中一个弹窗」
 * 这种漏改——类型选择器和占位提示必须始终一致。
 */

/** 类型的中文名 */
export const APP_TYPE_LABELS: Record<AppItemType, string> = {
  app: '应用程序',
  folder: '文件夹',
  url: '网址',
  steam: 'Steam 链接',
  note: '文本',
  group: '组合'
}

/** 类型选择器里的展示顺序（按使用频率排，应用/文件夹/网址最常用） */
export const APP_TYPE_ORDER: AppItemType[] = ['app', 'folder', 'url', 'steam', 'note', 'group']

/** 各类型在表单里的占位提示 */
export const APP_TYPE_PLACEHOLDERS: Record<AppItemType, { name: string; path: string }> = {
  app: {
    name: '输入应用名称',
    path: '输入应用路径，如 C:\\Program Files\\app.exe'
  },
  folder: {
    name: '输入文件夹名称',
    path: '输入文件夹路径，如 D:\\Documents'
  },
  url: {
    name: '输入网址名称',
    path: '输入网址，如 https://example.com'
  },
  steam: {
    name: '输入游戏名称（可选）',
    path: '粘贴 Steam 链接，如 steam://launch/730/0 或 https://store.steampowered.com/app/730/'
  },
  note: {
    name: '输入标题',
    path: '正文（可留空，保存后在卡片上编辑）'
  },
  group: {
    name: '输入组合名称',
    path: '组合不需要路径，成员在下方勾选'
  }
}

/** 「路径」这一栏在各类型下的标签 */
export const APP_TYPE_PATH_LABELS: Record<AppItemType, string> = {
  app: '路径',
  folder: '路径',
  url: '网址',
  steam: 'Steam 链接',
  note: '正文',
  group: '说明（可选）'
}

/** 需要「路径」字段的类型——其余类型（文本、组合）不靠路径启动 */
export const APP_TYPE_REQUIRES_PATH: Record<AppItemType, boolean> = {
  app: true,
  folder: true,
  url: true,
  steam: true,
  note: false,
  group: false
}
