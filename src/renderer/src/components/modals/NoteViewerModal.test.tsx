// @vitest-environment jsdom
/* 文本项目阅读面板：笔记形态与待办形态。
   重点验证待办的两件事——**点一下就能勾掉**（不必进编辑弹窗）、
   以及完成态在视觉与语义上都表达清楚（删除线 + aria-checked）。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { NoteViewerModal } from './NoteViewerModal'
import type { AppItem, TodoItem } from '../../../../shared/types'

function noteApp(overrides: Partial<AppItem> = {}): AppItem {
  return {
    id: 'n1',
    name: '报销流程',
    path: '',
    icon: '',
    categoryId: null,
    pinyin: '',
    firstLetter: '',
    type: 'note',
    ...overrides
  }
}

const todo = (id: string, text: string, done = false): TodoItem => ({ id, text, done })

function renderPanel(app: AppItem, handlers: {
  onToggleTodo?: (app: AppItem, id: string) => void
  onClearCompleted?: (app: AppItem) => void
} = {}) {
  const props = {
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onCopy: vi.fn(),
    onToggleTodo: handlers.onToggleTodo ?? vi.fn(),
    onClearCompleted: handlers.onClearCompleted ?? vi.fn()
  }
  render(<NoteViewerModal app={app} {...props} />)
  return props
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('笔记形态', () => {
  it('渲染正文', () => {
    renderPanel(noteApp({ noteContent: '1. 贴发票\n2. 找组长签字' }))
    expect(screen.getByText(/贴发票/)).toBeInTheDocument()
  })

  it('没有正文时给占位提示，且复制按钮不可用', () => {
    renderPanel(noteApp({ noteContent: '' }))
    expect(screen.getByText('（这条笔记还是空的）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /复制内容/ })).toBeDisabled()
  })

  it('缺省没有 noteKind 也当笔记处理（历史数据兼容）', () => {
    renderPanel(noteApp({ noteContent: '老数据' }))
    expect(screen.getByText('老数据')).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('待办形态', () => {
  const list = [todo('t1', '贴发票', true), todo('t2', '找组长签字'), todo('t3', '交到财务')]

  it('渲染全部条目', () => {
    renderPanel(noteApp({ noteKind: 'todo', todoItems: list }))
    expect(screen.getByRole('checkbox', { name: '贴发票' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '找组长签字' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '交到财务' })).toBeInTheDocument()
  })

  it('显示完成进度', () => {
    renderPanel(noteApp({ noteKind: 'todo', todoItems: list }))
    expect(screen.getByText('1/3 已完成')).toBeInTheDocument()
  })

  it('完成态在语义上是 checked，未完成是 unchecked', () => {
    renderPanel(noteApp({ noteKind: 'todo', todoItems: list }))
    expect(screen.getByRole('checkbox', { name: '贴发票' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '找组长签字' })).not.toBeChecked()
  })

  it('完成态有删除线', () => {
    renderPanel(noteApp({ noteKind: 'todo', todoItems: list }))
    const done = screen.getByText('贴发票')
    expect(done.className).toContain('line-through')
    expect(screen.getByText('找组长签字').className).not.toContain('line-through')
  })

  it('点勾选框把 app 与条目 id 一起交给上层落盘', () => {
    const onToggleTodo = vi.fn()
    const app = noteApp({ noteKind: 'todo', todoItems: list })
    renderPanel(app, { onToggleTodo })

    fireEvent.click(screen.getByRole('checkbox', { name: '找组长签字' }))
    expect(onToggleTodo).toHaveBeenCalledWith(app, 't2')
  })

  it('没有任何已完成条目时不出现「清除已完成」', () => {
    renderPanel(noteApp({ noteKind: 'todo', todoItems: [todo('t1', 'a'), todo('t2', 'b')] }))
    expect(screen.queryByRole('button', { name: '清除已完成' })).not.toBeInTheDocument()
  })

  it('有已完成条目时可一键清除', () => {
    const onClearCompleted = vi.fn()
    const app = noteApp({ noteKind: 'todo', todoItems: list })
    renderPanel(app, { onClearCompleted })

    fireEvent.click(screen.getByRole('button', { name: '清除已完成' }))
    expect(onClearCompleted).toHaveBeenCalledWith(app)
  })

  it('空待办给占位提示，且不显示进度行', () => {
    renderPanel(noteApp({ noteKind: 'todo', todoItems: [] }))
    expect(screen.getByText('暂无条目，点击「编辑」添加。')).toBeInTheDocument()
    expect(screen.queryByText(/已完成$/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /复制内容/ })).toBeDisabled()
  })

  it('缺 todoItems 字段时按空清单处理，不崩', () => {
    renderPanel(noteApp({ noteKind: 'todo' }))
    expect(screen.getByText('暂无条目，点击「编辑」添加。')).toBeInTheDocument()
  })
})

describe('通用交互', () => {
  it('「编辑」把当前 app 交回去', () => {
    const app = noteApp({ noteContent: 'x' })
    const props = renderPanel(app)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(props.onEdit).toHaveBeenCalledWith(app)
  })

  it('「复制内容」把当前 app 交回去', () => {
    const app = noteApp({ noteKind: 'todo', todoItems: [todo('t1', 'a')] })
    const props = renderPanel(app)
    fireEvent.click(screen.getByRole('button', { name: /复制内容/ }))
    expect(props.onCopy).toHaveBeenCalledWith(app)
  })

  it('关闭按钮触发 onClose', () => {
    const props = renderPanel(noteApp({ noteContent: 'x' }))
    fireEvent.click(screen.getByTitle('关闭'))
    expect(props.onClose).toHaveBeenCalled()
  })
})
