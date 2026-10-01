// @vitest-environment jsdom
/* 文本项目表单的「笔记 / 待办」两种形态。
   重点：① 形态切换后正文不丢；② 待办条目能增、删、改、勾，且提交时原样带下去。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AppDraftForm } from './AppDraftForm'
import type { AppItemDraft, Category } from '../../../../shared/types'

const categories: Category[] = [{ id: 'cat-1', name: '默认', icon: '', order: 0 }]

function renderForm(initial: Partial<AppItemDraft> = {}) {
  const onSubmit = vi.fn()
  render(
    <AppDraftForm
      initial={{ name: '报销流程', path: '', categoryId: 'cat-1', type: 'note', aliases: [], ...initial }}
      categories={categories}
      apps={[]}
      browsers={[]}
      urlMetaEnabled={false}
      submitLabel="保存"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />
  )
  return onSubmit
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: '保存' }))
const draftOf = (onSubmit: ReturnType<typeof vi.fn>): AppItemDraft =>
  onSubmit.mock.calls[onSubmit.mock.calls.length - 1][0] as AppItemDraft

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('形态切换', () => {
  it('缺省是「笔记」，显示正文输入框', () => {
    renderForm()
    expect(screen.getByPlaceholderText(/输入笔记内容/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ 添加条目' })).not.toBeInTheDocument()
  })

  it('切到「待办」显示条目编辑器', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '待办' }))
    expect(screen.getByRole('button', { name: '+ 添加条目' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/输入笔记内容/)).not.toBeInTheDocument()
  })

  it('noteKind === todo 的初始数据直接进待办形态', () => {
    renderForm({ noteKind: 'todo', todoItems: [{ id: 't1', text: '贴发票', done: false }] })
    expect(screen.getByDisplayValue('贴发票')).toBeInTheDocument()
  })

  it('笔记 → 待办 → 笔记，正文不丢', () => {
    renderForm()
    fireEvent.change(screen.getByPlaceholderText(/输入笔记内容/), { target: { value: '1. 贴发票' } })
    fireEvent.click(screen.getByRole('button', { name: '待办' }))
    fireEvent.click(screen.getByRole('button', { name: '笔记' }))
    expect(screen.getByPlaceholderText(/输入笔记内容/)).toHaveValue('1. 贴发票')
  })

  it('待办 → 笔记 → 待办，条目不丢', () => {
    renderForm({ noteKind: 'todo', todoItems: [{ id: 't1', text: '贴发票', done: false }] })
    fireEvent.click(screen.getByRole('button', { name: '笔记' }))
    fireEvent.click(screen.getByRole('button', { name: '待办' }))
    expect(screen.getByDisplayValue('贴发票')).toBeInTheDocument()
  })
})

describe('待办条目编辑', () => {
  it('「+ 添加条目」加一行空条目', () => {
    renderForm({ noteKind: 'todo' })
    expect(screen.queryByLabelText('待办条目 1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ 添加条目' }))
    expect(screen.getByLabelText('待办条目 1')).toBeInTheDocument()
  })

  it('输入文字后提交，条目原样带下去', () => {
    const onSubmit = renderForm({ noteKind: 'todo' })
    fireEvent.click(screen.getByRole('button', { name: '+ 添加条目' }))
    fireEvent.change(screen.getByLabelText('待办条目 1'), { target: { value: '贴发票' } })
    submit()

    const draft = draftOf(onSubmit)
    expect(draft.noteKind).toBe('todo')
    expect(draft.todoItems).toHaveLength(1)
    expect(draft.todoItems![0].text).toBe('贴发票')
    expect(draft.todoItems![0].done).toBe(false)
  })

  it('可以清空某一条的文字（不是把它还原成旧值）', () => {
    const onSubmit = renderForm({ noteKind: 'todo', todoItems: [{ id: 't1', text: '贴发票', done: false }] })
    fireEvent.change(screen.getByLabelText('待办条目 1'), { target: { value: '' } })
    expect(screen.getByLabelText('待办条目 1')).toHaveValue('')
    submit()
    expect(draftOf(onSubmit).todoItems![0].text).toBe('')
  })

  it('勾选后提交，done 为 true', () => {
    const onSubmit = renderForm({ noteKind: 'todo', todoItems: [{ id: 't1', text: '贴发票', done: false }] })
    fireEvent.click(screen.getByRole('checkbox', { name: '标记第 1 条完成' }))
    submit()
    expect(draftOf(onSubmit).todoItems![0].done).toBe(true)
  })

  it('「删除」移除对应条目', () => {
    const onSubmit = renderForm({
      noteKind: 'todo',
      todoItems: [
        { id: 't1', text: 'a', done: false },
        { id: 't2', text: 'b', done: false }
      ]
    })
    fireEvent.click(screen.getByRole('button', { name: '删除条目 1' }))
    submit()

    const items = draftOf(onSubmit).todoItems!
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('b')
  })

  it('显示完成进度', () => {
    renderForm({
      noteKind: 'todo',
      todoItems: [
        { id: 't1', text: 'a', done: true },
        { id: 't2', text: 'b', done: false }
      ]
    })
    expect(screen.getByText('（1/2 已完成）')).toBeInTheDocument()
  })
})

describe('提交内容', () => {
  it('笔记形态提交 noteKind = text', () => {
    const onSubmit = renderForm()
    fireEvent.change(screen.getByPlaceholderText(/输入笔记内容/), { target: { value: '正文' } })
    submit()

    const draft = draftOf(onSubmit)
    expect(draft.noteKind).toBe('text')
    expect(draft.noteContent).toBe('正文')
  })

  it('待办形态也把正文带上——切回笔记时内容还在', () => {
    const onSubmit = renderForm({ noteKind: 'todo', noteContent: '旧正文' })
    submit()
    expect(draftOf(onSubmit).noteContent).toBe('旧正文')
  })
})
