import type { AppItem } from '../../../shared/types'

/**
 * 计算拖拽重排后的新数组（不修改入参）。
 *
 * 关键点：先在「移除 source 之前的数组」上记录 source / target，再复制一份并 splice 掉
 * source，然后**在移除 source 之后的数组上重新定位 target** 得到插入位。这样无论 source
 * 原本在 target 之前还是之后，插入位都不会差一位（source 在前时若用旧下标会整体错开一格）。
 *
 * 若 source / target 不存在，或两者为同一应用，返回 null 表示无需改动。
 * nextSubcategoryId 由调用方根据落点算好传入：拖到哪个子分类旁边就归入那个子分类。
 */
export function computeReorder(
  apps: AppItem[],
  sourceId: string,
  targetId: string,
  insertAfter: boolean,
  nextSubcategoryId: string | null
): AppItem[] | null {
  const sourceIndex = apps.findIndex(a => a.id === sourceId)
  const targetIndex = apps.findIndex(a => a.id === targetId)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null

  const source = apps[sourceIndex]
  const updated = [...apps]
  updated.splice(sourceIndex, 1)
  // 移除 source 后重新定位 target，避免 source 在前时插错一位
  const insertAt = updated.findIndex(a => a.id === targetId)
  if (insertAt === -1) return null
  updated.splice(insertAfter ? insertAt + 1 : insertAt, 0, {
    ...source,
    subcategoryId: nextSubcategoryId
  })
  return updated
}

/**
 * 指针落在目标的右半边吗？——「落点 → 插入到目标前还是后」的判定规则。
 *
 * 单独抽成纯函数是为了能被测试锁住：这条规则以前由 HTML5 分组处理器算进一个 ref，
 * 统一切到左键自绘引擎时没人再接它，于是不管拖到卡片哪一半都按「插到前面」处理，
 * 表现为「拖到卡片右边，卡片却落到左边」。规则本身很短，但它是落点准确性的全部依据，
 * 值得有测试兜着。
 *
 * 取三个数值而不是 DOMRect，便于测试，也避免耦合 DOM 类型。
 */
export function isPointerPastMidpoint(left: number, width: number, x: number): boolean {
  return x > left + width / 2
}
