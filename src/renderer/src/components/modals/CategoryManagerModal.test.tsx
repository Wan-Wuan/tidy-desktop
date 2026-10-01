// @vitest-environment jsdom
/* 「管理分类」弹窗。
   这个组件一度只写好了却没有渲染点——分类外观（P2-3）与「关联文件夹」都做在里面，
   等于整块功能不可达。本文件同时守住两件事：
     ① 关联文件夹的三种操作（选择 / 立即同步 / 更换 / 解除）真的接上了回调；
     ② 它作为唯一入口被接线之后，原有的添加 / 编辑 / 删除没有被改坏。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CategoryManagerModal } from './CategoryManagerModal'
import type { Category } from '../../../../shared/types'

const linked: Category = {
  id: 'cat-linked',
  name: '开发',
  icon: '🛠️',
  order: 0,
  linkFolder: { path: 'C:\\Projects\\work', includeSubdirs: false, lastSyncAt: 0, hiddenPaths: [], order: [] }
}
const plain: Category = { id: 'cat-plain', name: '游戏', icon: '🎮', order: 1 }

function renderModal(categories: Category[]) {
  const handlers = {
    onClose: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onBindFolder: vi.fn(),
    onResyncFolder: vi.fn(),
    onUnbindFolder: vi.fn(),
    onSetIncludeSubdirs: vi.fn()
  }
  render(<CategoryManagerModal categories={categories} {...handlers} />)
  return handlers
}

/** 点某个分类那一行的「编辑」，进入编辑态 */
const editRow = (name: string) => {
  const row = screen.getByText(name).closest('div')!.parentElement as HTMLElement
  fireEvent.click(Array.from(row.querySelectorAll('button')).find(b => b.textContent === '编辑')!)
}

beforeEach(() => {
  cleanup()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { confirm: vi.fn(async () => true) }
  })
})
afterEach(() => cleanup())

describe('关联文件夹 · 未关联的分类', () => {
  it('编辑态里给出「选择文件夹…」，点了就调 onBindFolder', () => {
    const h = renderModal([plain])
    editRow('游戏')
    const button = screen.getByRole('button', { name: '选择文件夹…' })
    fireEvent.click(button)
    expect(h.onBindFolder).toHaveBeenCalledWith(plain)
  })

  it('未关联时不显示「立即同步 / 更换 / 解除」——没有东西可同步', () => {
    renderModal([plain])
    editRow('游戏')
    expect(screen.queryByRole('button', { name: '立即同步' })).toBeNull()
    expect(screen.queryByRole('button', { name: '解除' })).toBeNull()
  })

  it('未关联时也没有「含子文件夹」——还没目录可选', () => {
    renderModal([plain])
    editRow('游戏')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('关联文件夹 · 已关联的分类', () => {
  it('编辑态显示当前目录，并给出同步 / 更换 / 解除', () => {
    renderModal([linked])
    editRow('开发')
    expect(screen.getByText('C:\\Projects\\work')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即同步' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更换' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解除' })).toBeInTheDocument()
  })

  it('三个按钮各自接到对应的回调', () => {
    const h = renderModal([linked])
    editRow('开发')
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }))
    fireEvent.click(screen.getByRole('button', { name: '更换' }))
    fireEvent.click(screen.getByRole('button', { name: '解除' }))
    expect(h.onResyncFolder).toHaveBeenCalledWith(linked)
    expect(h.onBindFolder).toHaveBeenCalledWith(linked)
    expect(h.onUnbindFolder).toHaveBeenCalledWith(linked)
  })

  it('非编辑态也留一个角标，扫一眼就知道哪些分类跟着目录走', () => {
    renderModal([linked, plain])
    /* 角标是 aria-label="已关联文件夹" 的图标，只有已关联的那个分类有 */
    expect(screen.getAllByLabelText('已关联文件夹')).toHaveLength(1)
  })

  /* 绑定时不再问「要不要含子文件夹」——默认只显示本层。
     想改的人在这里勾一下，改完立刻重扫（不需要重新选目录）。 */
  it('「含子文件夹」反映当前值，勾选后回调 true', () => {
    const h = renderModal([linked])
    editRow('开发')
    const box = screen.getByRole('checkbox', { name: '含子文件夹' })
    expect(box).not.toBeChecked()
    fireEvent.click(box)
    expect(h.onSetIncludeSubdirs).toHaveBeenCalledWith(linked, true)
  })

  it('已勾选时复选框是选中态，取消勾选回调 false', () => {
    const h = renderModal([{ ...linked, linkFolder: { ...linked.linkFolder!, includeSubdirs: true } }])
    editRow('开发')
    const box = screen.getByRole('checkbox', { name: '含子文件夹' })
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(h.onSetIncludeSubdirs).toHaveBeenCalledWith(expect.objectContaining({ id: 'cat-linked' }), false)
  })
})

describe('原有能力没被改坏', () => {
  it('编辑分类时把名称 / 图标 / 外观一起提交', () => {
    const h = renderModal([plain])
    editRow('游戏')
    fireEvent.change(screen.getByDisplayValue('游戏'), { target: { value: '单机游戏' } })
    const numbers = screen.getAllByRole('spinbutton')
    fireEvent.change(numbers[0], { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(h.onUpdate).toHaveBeenCalledWith('cat-plain', '单机游戏', '🎮', {
      fontSize: 15,
      itemHeight: undefined,
      iconSize: undefined
    })
  })

  it('外观输入框留空 = 用默认，提交 undefined 而不是 0', () => {
    const h = renderModal([plain])
    editRow('游戏')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(h.onUpdate).toHaveBeenCalledWith('cat-plain', '游戏', '🎮', {
      fontSize: undefined,
      itemHeight: undefined,
      iconSize: undefined
    })
  })

  it('删除要过确认框，确认后才回调', async () => {
    const h = renderModal([plain])
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await vi.waitFor(() => expect(h.onDelete).toHaveBeenCalledWith('cat-plain'))
  })

  it('添加新分类', () => {
    const h = renderModal([])
    fireEvent.change(screen.getByPlaceholderText('分类名称'), { target: { value: '素材' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(h.onAdd).toHaveBeenCalledWith('素材', expect.any(String))
  })
})
