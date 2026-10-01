// @vitest-environment jsdom
/* 空分类状态里的「关联文件夹…」引导。
   这是关联文件夹最容易被发现的入口——用户正盯着空白，也还没养成右键分类的习惯。
   只在"有当前分类、且这个分类还没关联"时出现，其余情况保持原来的空状态文案。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AppGrid } from './AppGrid'
import type { Category } from '../../../shared/types'

const plain: Category = { id: 'cat-1', name: '开发', icon: '🛠️', order: 0 }
const linked: Category = {
  ...plain,
  linkFolder: { path: 'C:\\Projects', includeSubdirs: false, lastSyncAt: 0, hiddenPaths: [], order: [] }
}

const noop = () => {}

function renderGrid(activeCategoryObject: Category | null) {
  const onBindFolder = vi.fn()
  render(
    <AppGrid
      dropZoneRef={{ current: null }}
      handleContentScroll={noop}
      activeCategory={activeCategoryObject?.id ?? null}
      dragOverGroupSubId={null}
      groupedApps={[]}
      collectionGroups={[]}
      dragOverCollectionId={null}
      onToggleCollectionCollapse={noop}
      onRenameCollection={noop}
      onDeleteCollection={noop}
      config={null}
      draggedAppId={null}
      dragOverAppId={null}
      dropInsertAfter={null}
      selectedAppIdSet={new Set<string>()}
      cardOnOpen={noop}
      cardOnEdit={noop}
      cardOnDelete={noop}
      cardOnSendFile={noop}
      cardOnMouseDown={noop}
      cardOnContextMenu={noop}
      cardOnKeyDown={noop}
      filteredApps={[]}
      activeCategoryObject={activeCategoryObject}
      onBindFolder={onBindFolder}
    />
  )
  return onBindFolder
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('空分类的关联文件夹引导', () => {
  it('分类为空且未关联时，给出「关联文件夹…」按钮', () => {
    const onBindFolder = renderGrid(plain)
    const button = screen.getByRole('button', { name: '关联文件夹…' })
    fireEvent.click(button)
    expect(onBindFolder).toHaveBeenCalledWith(plain)
  })

  it('文案说的是「该分类暂无项目」，并同时保留手动添加的路子', () => {
    renderGrid(plain)
    expect(screen.getByText('该分类暂无项目')).toBeInTheDocument()
    expect(screen.getByText(/点击「添加应用」或「添加文件夹」手动添加/)).toBeInTheDocument()
  })

  it('已经关联了就不再劝——回到原来的空状态文案', () => {
    renderGrid(linked)
    expect(screen.queryByRole('button', { name: '关联文件夹…' })).toBeNull()
    expect(screen.getByText('暂无项目')).toBeInTheDocument()
  })

  it('「全部」视图没有具体分类，不该出现这个按钮', () => {
    renderGrid(null)
    expect(screen.queryByRole('button', { name: '关联文件夹…' })).toBeNull()
    expect(screen.getByText('暂无项目')).toBeInTheDocument()
  })
})
