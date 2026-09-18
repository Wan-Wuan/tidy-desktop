import { useCallback, useEffect, useRef } from 'react'

/**
 * 把「每次渲染都会重新创建的函数」包装成**标识稳定**的版本。
 *
 * 为什么需要它：`React.memo` 靠 props 的引用是否相等来决定跳过重渲染。像
 * `AppCard` 这样被 memo 包裹、又在网格里成百个实例的组件，只要传进去的回调
 * 每次渲染都是新引用，memo 就完全失效——拖拽时 dragover 每秒触发几十次，
 * 每次 setState 都会让所有卡片全量重渲染。
 *
 * 为什么不直接用 `useCallback`：需要提前写出完整依赖。而这里的回调依赖链很长
 * （`handleCardClick` → `handleOpenApp` / `groupedApps` / `selectedAppIds`；
 * `handleCardDrop` → `handleReorderApp` → `config.ui.sortMode` …），依赖里既有
 * 普通函数，也有 state 和 useMemo 的产物。逐个补依赖既容易漏，也会因为上游
 * 函数自身不稳定而继续失效。
 *
 * 这里换成另一种做法：**壳的标识永远不变，实现通过 ref 每次渲染刷新**。
 * 于是 memo 能生效，同时触发时调用的永远是最新那份实现，不会出现闭包过期。
 *
 * 前提：仅用于事件回调。事件在渲染与 effect 之后才触发，所以读到的必然是
 * 当次渲染写入的最新实现；若在渲染期间同步调用则不适用。
 */
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn)

  useEffect(() => {
    ref.current = fn
  })

  // 依赖数组必须为空：壳的标识一旦变化，memo 就白做了。
  // 这里不需要 eslint-disable——闭包只引用 ref（不受 exhaustive-deps 管辖）。
  return useCallback(((...args: Parameters<T>): ReturnType<T> => ref.current(...args)) as T, [])
}
