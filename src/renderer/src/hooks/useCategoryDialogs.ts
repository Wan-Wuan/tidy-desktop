import { useState } from 'react'
import type { Category, Subcategory } from '../../../shared/types'
import {
  countCategoryApps,
  countSubcategoryApps
} from '../utils/categoryDeletion'
import type { CategoryContextMenu, CategoryEditDialog, CategoryDeleteDialog, CategoryContextMenuTarget } from '../components/CategoryOverlays'

/** 增删改分类/子分类的底层 handler 在 App.tsx 里比本 hook 后定义，直接用闭包会踩 TDZ。
 *  由 App 把最新实现写进这个 ref，弹窗提交时再读——和 leftDragActionsRef 同一套路。 */
export type CategoryCrudApi = {
  handleAddCategory?: (name: string, icon: string) => Promise<void>
  handleUpdateCategory?: (id: string, name: string, icon: string) => Promise<void>
  handleAddSubcategory?: (name: string, icon: string, parentId: string | null) => Promise<void>
  handleUpdateSubcategory?: (id: string, name: string, icon: string) => Promise<void>
}

/**
 * 分类右键菜单 + 分类/子分类编辑弹窗 + 删除确认弹窗，三套弹窗的全部状态与接线。
 *
 * 这些 handler 几乎只做「设置弹窗/菜单状态」和「调用底层 CRUD」，彼此独立，
 * 因此整体搬进本 hook。底层 CRUD（handleAddCategory 等）依赖更晚才出现的状态，
 * 经 crudApiRef 转发；其余依赖（categories / subcategories / appsRef / 各种 setter）
 * 已由 useAppData 等更上层提供，直接注入即可。
 */
export function useCategoryDialogs(options: {
  subcategories: Subcategory[]
  appsRef: React.MutableRefObject<import('../../../shared/types').AppItem[]>
  setActiveCategory: (id: string | null) => void
  activeCategoryRef: React.MutableRefObject<string | null>
  crudApiRef: React.MutableRefObject<CategoryCrudApi | null>
}) {
  const {
    subcategories,
    appsRef,
    setActiveCategory,
    activeCategoryRef,
    crudApiRef
  } = options

  const [categoryContextMenu, setCategoryContextMenu] = useState<CategoryContextMenu | null>(null)
  const [categoryEditDialog, setCategoryEditDialog] = useState<CategoryEditDialog | null>(null)
  const [categoryDeleteDialog, setCategoryDeleteDialog] = useState<CategoryDeleteDialog | null>(null)

  const openCategoryContextMenu = (e: React.MouseEvent, menu: CategoryContextMenuTarget) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 180
    const menuHeight = 220
    setCategoryContextMenu({
      ...menu,
      x: Math.min(e.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(e.clientY, window.innerHeight - menuHeight - 8)
    } as CategoryContextMenu)
  }

  const createCategoryFromMenu = () => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'create-category', title: '新建分类', name: '', icon: '📁' })
  }

  const renameCategoryFromMenu = (category: Category) => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'rename-category', title: '重命名分类', id: category.id, name: category.name, icon: category.icon })
  }

  const addSubcategoryFromMenu = (category: Category) => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'add-subcategory', title: '添加子分类', parentId: category.id, name: '', icon: '•' })
  }

  const deleteCategoryFromMenu = (category: Category) => {
    const childIds = subcategories.filter(sub => sub.parentId === category.id).map(sub => sub.id)
    setCategoryContextMenu(null)
    setCategoryDeleteDialog({
      type: 'category',
      id: category.id,
      name: category.name,
      appCount: countCategoryApps(appsRef.current, category.id, childIds)
    })
  }

  const renameSubcategoryFromMenu = (subcategory: Subcategory) => {
    setCategoryContextMenu(null)
    setCategoryEditDialog({ type: 'rename-subcategory', title: '重命名子分类', id: subcategory.id, name: subcategory.name, icon: subcategory.icon })
  }

  const deleteSubcategoryFromMenu = (subcategory: Subcategory) => {
    setCategoryContextMenu(null)
    setCategoryDeleteDialog({
      type: 'subcategory',
      id: subcategory.id,
      name: subcategory.name,
      appCount: countSubcategoryApps(appsRef.current, subcategory.id)
    })
  }

  const submitCategoryEditDialog = async () => {
    if (!categoryEditDialog) return
    const name = categoryEditDialog.name.trim()
    const icon = categoryEditDialog.icon.trim() || '•'
    if (!name) return

    if (categoryEditDialog.type === 'create-category') {
      await crudApiRef.current?.handleAddCategory?.(name, icon || '📁')
    } else if (categoryEditDialog.type === 'rename-category') {
      await crudApiRef.current?.handleUpdateCategory?.(categoryEditDialog.id, name, icon)
    } else if (categoryEditDialog.type === 'add-subcategory') {
      await crudApiRef.current?.handleAddSubcategory?.(name, icon, categoryEditDialog.parentId)
      // 新建子分类后自动切到它所在的主分类，顺手展开下拉
      setActiveCategory(categoryEditDialog.parentId)
      activeCategoryRef.current = categoryEditDialog.parentId
    } else {
      await crudApiRef.current?.handleUpdateSubcategory?.(categoryEditDialog.id, name, icon)
    }

    setCategoryEditDialog(null)
  }

  return {
    categoryContextMenu,
    setCategoryContextMenu,
    categoryEditDialog,
    setCategoryEditDialog,
    categoryDeleteDialog,
    setCategoryDeleteDialog,
    openCategoryContextMenu,
    createCategoryFromMenu,
    renameCategoryFromMenu,
    addSubcategoryFromMenu,
    deleteCategoryFromMenu,
    renameSubcategoryFromMenu,
    deleteSubcategoryFromMenu,
    submitCategoryEditDialog
  }
}
