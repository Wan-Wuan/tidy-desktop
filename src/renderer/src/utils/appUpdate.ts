import type { AppItem, AppItemDraft, AppItemType, NoteKind, OpenWithCommand, TodoItem } from '../../../shared/types'
import { getPinyin, getFirstLetter } from './pinyin'

/** 编辑时的入参：草稿 + 目标 id。与新建共用一份字段定义。 */
export type AppUpdateInput = AppItemDraft

/** 只有这几种类型会带「路径」；文本与组合的 path 永远是空串。 */
export const APP_TYPE_HAS_PATH: Record<AppItemType, boolean> = {
  app: true,
  folder: true,
  url: true,
  steam: true,
  note: false,
  group: false
}

/**
 * 按类型挑出「只有这个类型才有的字段」。
 *
 * 返回的对象**只包含当前类型用得到的键**，调用方用展开覆盖即可。
 * 这样 `app → note → app` 来回切换不会留下上一轮的 `noteContent`，
 * 「组合 → 应用」也不会带着一份已经没人看的 `memberIds`。
 */
export function buildTypeFields(input: {
  type: AppItemType
  args?: string
  workingDir?: string
  browserId?: string | null
  openWith?: OpenWithCommand | null
  noteContent?: string
  noteKind?: NoteKind
  todoItems?: TodoItem[]
  memberIds?: string[]
  confirmBeforeLaunch?: boolean
}): Partial<AppItem> {
  const fields: Partial<AppItem> = {}
  switch (input.type) {
    case 'app':
      fields.args = input.args?.trim() || undefined
      fields.workingDir = input.workingDir?.trim() || undefined
      fields.openWith = input.openWith ?? null
      break
    case 'folder':
      /* 文件夹同样支持「用指定程序打开」——用编辑器打开项目目录是最常见的用法 */
      fields.openWith = input.openWith ?? null
      break
    case 'url':
      fields.browserId = input.browserId ?? null
      break
    case 'note':
      /* 形态（笔记 / 待办）与两份内容都写回，**不因为当前形态是待办就把
         `noteContent` 丢掉**——用户在「笔记」和「待办」之间切一下再切回来，
         原来的正文必须还在。丢弃只发生在「文本 → 其它类型」时（见 buildUpdatedApp）。 */
      fields.noteContent = input.noteContent ?? ''
      fields.noteKind = input.noteKind === 'todo' ? 'todo' : 'text'
      fields.todoItems = input.todoItems ?? []
      break
    case 'group':
      // 去重但保留顺序：成员顺序就是启动顺序
      fields.memberIds = [...new Set(input.memberIds ?? [])]
      fields.confirmBeforeLaunch = input.confirmBeforeLaunch === true
      break
    default:
      break
  }
  return fields
}

/**
 * 由「原应用 + 编辑结果」构造新的应用对象。
 *
 * 这里唯一容易踩的坑是**子分类归属**：子分类挂在父分类下（`subcategory.parentId`），
 * 编辑时换了分类却把旧子分类留着，应用就会变成
 * 「categoryId = 新分类」+「subcategoryId = 旧分类的子分类」这种不自洽状态。
 * 分组渲染（App.tsx 的 groupedApps）要求二者一致：
 *   · 它不在「未分组」里 —— subcategoryId 非空；
 *   · 它不在任何可见子分类里 —— 旧子分类的 parentId 不等于新分类。
 * 结果是切到新分类后**整个应用从网格中消失**（数据还在，用户会以为丢了）。
 *
 * 因此：换了分类就丢子分类；分类没变则保留，避免编辑名字/路径时把它踢出原分组。
 */
export function buildUpdatedApp(existing: AppItem, input: AppUpdateInput): AppItem {
  const pathChanged = existing.path !== input.path || existing.type !== input.type
  const next: AppItem = {
    ...existing,
    name: input.name,
    path: input.path,
    categoryId: input.categoryId,
    subcategoryId: input.categoryId === existing.categoryId ? existing.subcategoryId : null,
    type: input.type,
    pinyin: getPinyin(input.name),
    firstLetter: getFirstLetter(input.name),
    aliases: input.aliases ?? [],
    // 路径或类型变了才清空旧图标，否则保留原图避免无谓闪烁
    icon: pathChanged ? '' : existing.icon
  }
  /* 先删干净所有类型专属字段，再按当前类型写回。
     只「写回」不「删掉」的话，`文本 → 应用` 会留下 noteContent 这类残渣，
     数据文件越攒越脏，将来排查时还会误以为字段有含义。 */
  delete next.noteContent
  delete next.noteKind
  delete next.todoItems
  delete next.memberIds
  delete next.confirmBeforeLaunch
  delete next.args
  delete next.workingDir
  delete next.browserId
  delete next.openWith
  return { ...next, ...buildTypeFields(input) }
}

/** 由草稿构造全新的应用对象。id 由调用方给（hook 里用 crypto.randomUUID）。 */
export function buildNewApp(draft: AppItemDraft, id: string): AppItem {
  return {
    id,
    name: draft.name,
    path: draft.path,
    icon: draft.icon ?? '',
    categoryId: draft.categoryId,
    subcategoryId: null,
    pinyin: getPinyin(draft.name),
    firstLetter: getFirstLetter(draft.name),
    type: draft.type,
    aliases: draft.aliases ?? [],
    ...buildTypeFields(draft)
  }
}
