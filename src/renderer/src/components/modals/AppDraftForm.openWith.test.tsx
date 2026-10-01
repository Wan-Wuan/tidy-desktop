// @vitest-environment jsdom
/* 「用指定程序打开（可选）」编辑器。
   重点：① 只有 app / folder 才出现这个折叠区；② 命令、路径前参数、路径后内容
   三段能存下去；③ 命令为空时提交成 null（走系统默认方式）；
   ④ 命令行预览把路径夹在中间，顺序不能错。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AppDraftForm } from './AppDraftForm'
import type { AppItemDraft, Category } from '../../../../shared/types'

const categories: Category[] = [{ id: 'cat-1', name: '默认', icon: '', order: 0 }]
const NOTEPAD = 'C:\\Program Files\\Notepad++\\notepad++.exe'
/** 不含空格、不会被预览加引号的命令——用来单独验证参数拼接顺序 */
const TOOL = 'C:\\Tools\\tool.exe'

function renderForm(initial: Partial<AppItemDraft> = {}) {
  const onSubmit = vi.fn()
  render(
    <AppDraftForm
      initial={{ name: 'index.ts', path: 'D:\\proj\\index.ts', categoryId: 'cat-1', type: 'app', aliases: [], ...initial }}
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
/** 展开「用指定程序打开」折叠区（<details> 默认收起，jsdom 下内容仍在 DOM 里，直接取即可） */
const openWithSection = () => screen.getByText('用指定程序打开（可选）')

beforeEach(() => {
  cleanup()
  ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
    selectFile: vi.fn().mockResolvedValue(NOTEPAD)
  }
})
afterEach(() => cleanup())

describe('可见性', () => {
  it('app 类型显示折叠区', () => {
    renderForm({ type: 'app' })
    expect(openWithSection()).toBeInTheDocument()
  })

  it('folder 类型也显示', () => {
    renderForm({ type: 'folder', path: 'D:\\proj' })
    expect(openWithSection()).toBeInTheDocument()
  })

  it('note 类型不显示', () => {
    renderForm({ type: 'note', path: '' })
    expect(screen.queryByText('用指定程序打开（可选）')).not.toBeInTheDocument()
  })

  it('url 类型不显示', () => {
    renderForm({ type: 'url', path: 'https://example.com' })
    expect(screen.queryByText('用指定程序打开（可选）')).not.toBeInTheDocument()
  })

  it('未指定程序时提示走系统默认方式', () => {
    renderForm()
    expect(screen.getByText('未指定，将使用系统默认方式打开')).toBeInTheDocument()
  })
})

describe('选择程序', () => {
  it('选中后填入命令并显示「已指定」', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '选择程序' }))
    await waitFor(() => expect(screen.getByText(NOTEPAD)).toBeInTheDocument())
    expect(screen.getByText('已指定')).toBeInTheDocument()
  })

  it('取消选择（返回 null）不改动命令', async () => {
    ;(window.electronAPI.selectFile as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '选择程序' }))
    await waitFor(() => expect(window.electronAPI.selectFile).toHaveBeenCalled())
    expect(screen.getByText('未指定，将使用系统默认方式打开')).toBeInTheDocument()
  })

  it('「清除」把命令清空', async () => {
    renderForm({ openWith: { command: NOTEPAD } })
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
    expect(screen.getByText('未指定，将使用系统默认方式打开')).toBeInTheDocument()
  })
})

describe('命令行预览', () => {
  it('路径夹在中间：程序 → 前参数 → 项目路径 → 后内容', () => {
    renderForm({
      path: 'D:\\proj\\index.ts',
      openWith: { command: TOOL, argsBefore: '-n', argsAfter: '-nosession' }
    })
    expect(screen.getByText(`${TOOL} -n D:\\proj\\index.ts -nosession`)).toBeInTheDocument()
  })

  it('未填路径时用占位符占位', () => {
    renderForm({ path: '', openWith: { command: TOOL, argsBefore: '-n' } })
    expect(screen.getByText(`${TOOL} -n ⟨项目路径⟩`)).toBeInTheDocument()
  })

  it('含空格的路径用双引号包起来', () => {
    renderForm({ path: 'D:\\my proj\\a.ts', openWith: { command: TOOL } })
    expect(screen.getByText(`${TOOL} "D:\\my proj\\a.ts"`)).toBeInTheDocument()
  })

  it('含空格的程序路径同样被加引号', () => {
    renderForm({ path: 'D:\\proj\\index.ts', openWith: { command: NOTEPAD } })
    expect(screen.getByText(`"${NOTEPAD}" D:\\proj\\index.ts`)).toBeInTheDocument()
  })

  it('没配程序时不显示预览', () => {
    renderForm()
    expect(screen.queryByText('实际执行的命令')).not.toBeInTheDocument()
  })
})

describe('提交', () => {
  it('三段原样带下去', () => {
    const onSubmit = renderForm({
      openWith: { command: NOTEPAD, argsBefore: '-n', argsAfter: '-nosession' }
    })
    submit()
    expect(draftOf(onSubmit).openWith).toEqual({
      command: NOTEPAD,
      argsBefore: '-n',
      argsAfter: '-nosession'
    })
  })

  it('未指定程序时 openWith 为 null', () => {
    const onSubmit = renderForm()
    submit()
    expect(draftOf(onSubmit).openWith).toBeNull()
  })

  it('清除后提交 openWith 为 null', () => {
    const onSubmit = renderForm({ openWith: { command: NOTEPAD } })
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
    submit()
    expect(draftOf(onSubmit).openWith).toBeNull()
  })

  it('note 类型提交 openWith 为 null', () => {
    const onSubmit = renderForm({
      type: 'note',
      path: '',
      openWith: { command: NOTEPAD }
    })
    submit()
    expect(draftOf(onSubmit).openWith).toBeNull()
  })
})
