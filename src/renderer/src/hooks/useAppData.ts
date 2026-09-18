import { useEffect, useRef, useState } from 'react'
import type {
  AppItem,
  Category,
  Config,
  Subcategory
} from '../../../shared/types'

/**
 * 集中管理应用数据的五组状态，以及它们对应的 ref 镜像。
 *
 * 为什么把 ref 镜像也放进来：原 App.tsx 里 `appsRef` / `categoriesRef` /
 * `activeCategoryRef` 大约有三四十处「setState 之后立刻手动 `xxxRef.current = ...`」
 * 的双写，目的就是让异步操作（await IPC）之前拿到的数据是最新的。
 * 把同步逻辑收进本 hook 的内部 effect，调用方（App.tsx 的各 handler）就只管
 * `appsRef.current = updatedApps` 这一处写 ref，剩下的镜像交给这里统一维护，
 * 避免哪次漏写导致「await 之后读到的还是旧数据」。
 *
 * 返回值的命名刻意与 App.tsx 原局部变量保持一致，这样搬出来的 handler 函数体
 * 一行都不用改——它们继续按原名字引用 `config` / `apps` / `appsRef` 等。
 */
export function useAppData() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apps, setApps] = useState<AppItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // ref 镜像：异步落盘 / 跨子分类拖拽换 DOM 时，handler 里直接读 ref 拿「最新」数据。
  const appsRef = useRef<AppItem[]>([])
  const categoriesRef = useRef<Category[]>([])
  const activeCategoryRef = useRef<string | null>(null)

  // 数据变化后立即刷新镜像，保证任何 await 之前读到的都是当前渲染态。
  useEffect(() => {
    appsRef.current = apps
  }, [apps])

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  useEffect(() => {
    activeCategoryRef.current = activeCategory
  }, [activeCategory])

  return {
    config,
    setConfig,
    apps,
    setApps,
    appsRef,
    categories,
    setCategories,
    categoriesRef,
    subcategories,
    setSubcategories,
    activeCategory,
    setActiveCategory,
    activeCategoryRef
  }
}
