import { isPointerPastMidpoint } from './reorder'

/**
 * 拖拽落点判定的纯函数部分。
 *
 * 为什么单独放一个文件：这部分决定了「拖到哪儿、松手后落到哪儿」，是拖拽里最需要
 * 确定性的地方，却又最容易在重构中被动到——上两次落点问题（子分类差一位、应用
 * 卡片的左右半边意图在迁移中丢失）都出在这条链路上。抽出来是为了能被测试锁住，
 * 也为了让 useDragAndDrop 里剩下的部分只负责时序与副作用。
 */

export type DropTarget =
  | { type: 'app'; id: string }
  | { type: 'category'; id: string }
  | { type: 'subcategory'; id: string }
  | { type: 'subcategory-drop'; id: string }

/**
 * 从命中的 DOM 元素向上找最近的落点载体。
 *
 * 用属性而不是组件树来判断落点，是因为判定发生在 mousemove 里，只能拿到
 * elementFromPoint 返回的元素；往上找的层数要够（图标、文字、徽章可能套好几层），
 * 但也要有限，避免误命中外层容器。
 */
export function findDropTarget(el: Element | null): DropTarget | null {
  if (!el) return null
  let node: Element | null = el
  for (let i = 0; i < 5 && node; i++) {
    if (node.hasAttribute?.('data-app-id')) return { type: 'app', id: node.getAttribute('data-app-id')! }
    if (node.hasAttribute?.('data-category-id')) return { type: 'category', id: node.getAttribute('data-category-id')! }
    if (node.hasAttribute?.('data-subcategory-id')) return { type: 'subcategory', id: node.getAttribute('data-subcategory-id')! }
    // 网格里的子分类分组区（拖拽也能往里归类）
    if (node.hasAttribute?.('data-subcategory-drop')) return { type: 'subcategory-drop', id: node.getAttribute('data-subcategory-drop')! }
    node = node.parentElement
  }
  return null
}

/**
 * 指针是否已经离开窗口可视区域。
 *
 * 用途是区分同一个左键拖拽的两种意图：全程在窗口内 = 归类；拖出窗口 = 交给外部应用
 * 发送/上传（切换成系统原生拖拽）。参数取结构类型而不是 MouseEvent，便于测试。
 */
export function isPointerOutsideWindow(e: { clientX: number; clientY: number }): boolean {
  return e.clientX <= 0 || e.clientY <= 0 ||
    e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
}

/** 落点是否在这张应用卡片（data-app-id）的右半边 —— 决定插到目标前还是后 */
export function isPastCardMidpoint(el: Element | null, x: number): boolean {
  const card = el?.closest('[data-app-id]')
  if (!card) return false
  const rect = card.getBoundingClientRect()
  return isPointerPastMidpoint(rect.left, rect.width, x)
}
