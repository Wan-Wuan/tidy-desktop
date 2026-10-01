import type { TodoItem } from '../../../shared/types'

/**
 * 待办条目的纯逻辑。
 *
 * 全部是「传入旧数组、返回新数组」的不可变操作——调用方拿到结果直接丢给
 * `mutateApps` 落盘，不在这一层碰任何 React 状态或 IPC。
 */

/** 生成条目 id。正常环境走 `crypto.randomUUID`，测试与旧环境回落到时间戳 + 随机串 */
function newTodoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 新建一条待办。
 * `id` 只在测试里传——生产代码留空，让每条自动拿到唯一 id。
 */
export function createTodoItem(text: string, id?: string): TodoItem {
  return { id: id ?? newTodoId(), text, done: false }
}

export interface TodoProgress {
  total: number
  done: number
}

/** 统计完成进度。空列表返回 `{ total: 0, done: 0 }` */
export function countTodos(items: readonly TodoItem[]): TodoProgress {
  let done = 0
  for (const item of items) {
    if (item.done) done += 1
  }
  return { total: items.length, done }
}

/** 勾选 / 取消勾选。找不到 id 时原样返回（不抛错，避免界面因此崩掉） */
export function toggleTodoItem(items: readonly TodoItem[], id: string): TodoItem[] {
  return items.map(item => (item.id === id ? { ...item, done: !item.done } : item))
}

/**
 * 改某一条的文字。
 *
 * ⚠️ **允许改成空串**——编辑器里用户清空输入框是要重打，不是要还原。
 * 真到落盘时，`validation.sanitizeTodoItems` 会把空文本条目丢掉，
 * 所以"清空某条"最终等价于删除它，不会在数据里留下空壳。
 */
export function updateTodoText(items: readonly TodoItem[], id: string, text: string): TodoItem[] {
  return items.map(item => (item.id === id ? { ...item, text } : item))
}

export function removeTodoItem(items: readonly TodoItem[], id: string): TodoItem[] {
  return items.filter(item => item.id !== id)
}

/** 清掉所有已完成条目，未完成的保持原顺序 */
export function clearCompletedTodos(items: readonly TodoItem[]): TodoItem[] {
  return items.filter(item => !item.done)
}

/**
 * 导出成 Markdown 任务列表。
 * 选这个格式是因为它**粘到哪里都能看懂，而且还能被再解析回来**——
 * 复制成纯文本列表就丢了完成状态，复制成 JSON 又没人看得懂。
 */
export function formatTodosAsMarkdown(items: readonly TodoItem[]): string {
  return items.map(item => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n')
}

/** 卡片悬停提示用的一行摘要：进度 + 最多前 3 条未完成 */
export function summarizeTodos(items: readonly TodoItem[]): string {
  if (items.length === 0) return '空待办'
  const { total, done } = countTodos(items)
  const pending = items.filter(item => !item.done).slice(0, 3).map(item => item.text)
  const head = `${done}/${total} 已完成`
  return pending.length > 0 ? `${head} · ${pending.join('、')}` : head
}
