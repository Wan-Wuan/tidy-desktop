/**
 * 键盘事件的公共判定。
 *
 * 应用里同时存在三类快捷键，边界必须分清，否则会互相抢：
 *   1. **全局热键**（主进程 `globalShortcut`）：Ctrl+Alt+Space（主窗口）/ Ctrl+Alt+K（搜索），
 *      窗口失焦也生效；默认值以 `shared/defaults.ts` 为准，别在这里写死；
 *      ⚠️ 全局热键是**系统级独占**的，所以默认值一律用「双修饰键 + 字母」，
 *      避免把别的软件的常用快捷键抢走（搜索键曾是 Ctrl+K，见 `defaults.ts` 的说明）；
 *   2. **弹窗 / 菜单快捷键**：Esc 关闭、方向键在菜单内移动（见 useDialogA11y / menuA11y）；
 *   3. **主界面批量快捷键**：Ctrl+A 全选、Delete 删除选中（见 App.tsx）。
 *
 * 2 与 3 的边界靠「有弹窗时主界面整体让位」；
 * 3 与「文本编辑」的边界靠本模块的 `isEditableTarget`——
 * 焦点在输入框里时，Ctrl+A 该全选文字、Delete 该删字符，
 * 而不是跑去全选应用列表 / 删掉应用。
 */

/** 焦点是否落在可编辑元素上——此时快捷键必须让位给文本编辑。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true

  /* contenteditable 有两种写法（`contenteditable` 空串 与 `contenteditable="true"`），
     而且 jsdom 并不实现 isContentEditable，所以属性判断不能省。 */
  if (target.isContentEditable) return true
  const editable = target.getAttribute('contenteditable')
  return editable === '' || editable === 'true'
}

/** 是否按下了「命令键」（Windows/Linux 的 Ctrl，macOS 的 Cmd）。 */
export function hasCommandKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey
}

/** 主界面按键要执行的动作。 */
export type MainKeyAction =
  | { type: 'clear-selection' }
  | { type: 'hide-window' }
  | { type: 'select-all' }
  | { type: 'delete-selection' }

export interface MainKeyState {
  /** 有弹窗 / 右键菜单打开时，主界面的键盘操作整体让位 */
  overlayOpen: boolean
  hasSelection: boolean
  /** 当前可见（未隐藏、属于当前分类）的项目数，为 0 时不做全选 */
  visibleCount: number
}

/**
 * 主界面按键 → 动作的**唯一**判定入口。
 *
 * ⚠️ 这里的顺序就是逻辑，别重排，尤其别把 Esc 挪到 isEditableTarget 后面：
 *   1. 弹窗 / 菜单打开 → 全部让位（Esc 由 useDialogA11y 在捕获阶段处理）；
 *   2. **Esc 必须排在 isEditableTarget 之前**。Esc 不是「文本编辑键」，
 *      语义是「收起窗口 / 清空选择」，与焦点在不在输入框里无关。
 *      写反过一次：焦点停在底部多选工具条的 <select> 上（用户刚选完
 *      「移动到…」就是这状态）时，Esc 被 isEditableTarget 拦掉，
 *      表现成「Esc 失灵：选择清不掉、窗口也收不起来」；
 *   3. 只有 Ctrl+A / Delete 这类会和文本编辑撞车的键才需要让位。
 */
export function resolveMainKeyAction(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>,
  state: MainKeyState
): MainKeyAction | null {
  if (state.overlayOpen) return null

  if (event.key === 'Escape') {
    return state.hasSelection ? { type: 'clear-selection' } : { type: 'hide-window' }
  }

  if (isEditableTarget(event.target)) return null

  if (hasCommandKey(event) && !event.altKey && event.key.toLowerCase() === 'a') {
    return state.visibleCount > 0 ? { type: 'select-all' } : null
  }

  if (event.key === 'Delete' && state.hasSelection) return { type: 'delete-selection' }

  return null
}
