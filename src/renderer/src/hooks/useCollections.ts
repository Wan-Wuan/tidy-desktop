import { useCallback, useEffect, useRef, useState } from 'react'
import type { Collection } from '../../../shared/types'
import { persistCollections } from '../utils/persist'

const DEFAULT_ICON = '🗂'

/**
 * 收纳格。
 *
 * 收纳格只影响「在哪里显示」，**不改项目的分类归属**——所以它操作的是
 * `collections.json`，从不碰 `apps.json`。这也意味着「把项目拖进收纳格」
 * 不需要走 `useAppCrud` 的 `commitApps`，两边数据完全解耦。
 */
export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([])
  const collectionsRef = useRef<Collection[]>([])

  useEffect(() => {
    collectionsRef.current = collections
  }, [collections])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await window.electronAPI.getCollections()
        if (!cancelled) setCollections(Array.isArray(data?.collections) ? data.collections : [])
      } catch {
        // 读不到就当空：用户新建一个即可，不该因此弹错
      }
    })()
    return () => { cancelled = true }
  }, [])

  /** 落盘 + 双写 state/ref 的唯一入口，与 useAppCrud 的 commitApps 同构。 */
  const commit = useCallback(async (next: Collection[], hint: string) => {
    collectionsRef.current = next
    setCollections(next)
    return persistCollections(next, hint)
  }, [])

  const createCollection = useCallback(async (name: string, categoryId: string | null): Promise<Collection> => {
    const current = collectionsRef.current
    const created: Collection = {
      id: crypto.randomUUID(),
      name: name.trim() || `收纳格 ${current.length + 1}`,
      icon: DEFAULT_ICON,
      categoryId,
      memberIds: [],
      collapsed: false,
      order: current.reduce((max, item) => Math.max(max, item.order), -1) + 1
    }
    await commit([...current, created], '新建收纳格')
    return created
  }, [commit])

  const renameCollection = useCallback(async (id: string, name: string, icon?: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await commit(
      collectionsRef.current.map(item => (item.id === id
        ? { ...item, name: trimmed, icon: icon ?? item.icon }
        : item)),
      '重命名收纳格'
    )
  }, [commit])

  const deleteCollection = useCallback(async (id: string) => {
    // 只删容器，不动成员项目——收纳格本来就是"额外的一层视图"
    await commit(collectionsRef.current.filter(item => item.id !== id), '删除收纳格')
  }, [commit])

  const toggleCollapsed = useCallback(async (id: string) => {
    await commit(
      collectionsRef.current.map(item => (item.id === id ? { ...item, collapsed: !item.collapsed } : item)),
      '折叠收纳格'
    )
  }, [commit])

  const setCollectionCategory = useCallback(async (id: string, categoryId: string | null) => {
    await commit(
      collectionsRef.current.map(item => (item.id === id ? { ...item, categoryId } : item)),
      '收纳格分类'
    )
  }, [commit])

  /**
   * 把项目放进收纳格。
   * 一个项目**同时只属于一个收纳格**——否则同一张卡片会在两个容器里各画一份，
   * 用户改完一个另一个不跟着变，只会让人觉得"数据坏了"。
   */
  const addAppsToCollection = useCallback(async (collectionId: string, appIds: string[]) => {
    if (appIds.length === 0) return
    const adding = new Set(appIds)
    await commit(
      collectionsRef.current.map(item => {
        if (item.id === collectionId) {
          const merged = [...item.memberIds]
          for (const id of appIds) if (!merged.includes(id)) merged.push(id)
          return { ...item, memberIds: merged }
        }
        // 从其它收纳格里摘掉，保证唯一归属
        if (item.memberIds.some(id => adding.has(id))) {
          return { ...item, memberIds: item.memberIds.filter(id => !adding.has(id)) }
        }
        return item
      }),
      '加入收纳格'
    )
  }, [commit])

  /** 把项目从所有收纳格里摘掉（拖出去 / 删除项目时调用） */
  const removeAppsFromCollections = useCallback(async (appIds: string[]) => {
    if (appIds.length === 0) return
    const removing = new Set(appIds)
    const hasAny = collectionsRef.current.some(item => item.memberIds.some(id => removing.has(id)))
    if (!hasAny) return
    await commit(
      collectionsRef.current.map(item => (item.memberIds.some(id => removing.has(id))
        ? { ...item, memberIds: item.memberIds.filter(id => !removing.has(id)) }
        : item)),
      '移出收纳格'
    )
  }, [commit])

  /** 项目被删除时清掉它在收纳格里的残留 id，避免出现永远点不动的空位 */
  const pruneMissingMembers = useCallback(async (existingAppIds: string[]) => {
    const known = new Set(existingAppIds)
    const next = collectionsRef.current.map(item => {
      const kept = item.memberIds.filter(id => known.has(id))
      return kept.length === item.memberIds.length ? item : { ...item, memberIds: kept }
    })
    if (next.every((item, index) => item === collectionsRef.current[index])) return
    await commit(next, '清理收纳格')
  }, [commit])

  return {
    collections,
    collectionsRef,
    createCollection,
    renameCollection,
    deleteCollection,
    toggleCollapsed,
    setCollectionCategory,
    addAppsToCollection,
    removeAppsFromCollections,
    pruneMissingMembers
  }
}
