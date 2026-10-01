// @vitest-environment jsdom
/* 右键菜单里「用系统默认方式打开」的显示条件与回调。
   配了「用指定程序打开」之后，用户仍然需要一条临时绕过的路——这条菜单项就是它。 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AppContextMenuOverlay } from './AppContextMenuOverlay'
import type { AppItem } from '../../../shared/types'

const NOTEPAD = 'C:\\Program Files\\Notepad++\\notepad++.exe'

function makeApp(overrides: Partial<AppItem> = {}): AppItem {
  return {
    id: 'app-1',
    name: '记事本',
    path: 'C:\\Windows\\system32\\notepad.exe',
    icon: '',
    categoryId: 'cat-1',
    subcategoryId: null,
    pinyin: 'jishiben',
    firstLetter: 'J',
    type: 'app',
    ...overrides
  }
}

type MenuProps = React.ComponentProps<typeof AppContextMenuOverlay>

function renderMenu(app: AppItem, overrides: Partial<MenuProps> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onOpenAsAdmin: vi.fn(),
    onOpenWithSystem: vi.fn(),
    onLocate: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyLink: vi.fn(),
    onOpenWithBrowser: vi.fn(),
    onMoveTo: vi.fn(),
    onHide: vi.fn(),
    onHideInFolder: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    collectionName: null,
    onRemoveFromCollection: vi.fn()
  }
  render(
    <AppContextMenuOverlay
      menu={{ app, x: 0, y: 0 }}
      categories={[]}
      subcategories={[]}
      browsers={[]}
      {...handlers}
      {...overrides}
    />
  )
  return handlers
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('用系统默认方式打开', () => {
  it('配了 openWith 时显示', () => {
    renderMenu(makeApp({ openWith: { command: NOTEPAD } }))
    expect(screen.getByRole('menuitem', { name: '用系统默认方式打开' })).toBeInTheDocument()
  })

  it('未配 openWith 时不显示', () => {
    renderMenu(makeApp())
    expect(screen.queryByRole('menuitem', { name: '用系统默认方式打开' })).not.toBeInTheDocument()
  })

  it('命令为空串也不显示（等价于没配）', () => {
    renderMenu(makeApp({ openWith: { command: '' } }))
    expect(screen.queryByRole('menuitem', { name: '用系统默认方式打开' })).not.toBeInTheDocument()
  })

  it('点击后先关菜单再回调', () => {
    const handlers = renderMenu(makeApp({ openWith: { command: NOTEPAD } }))
    fireEvent.click(screen.getByRole('menuitem', { name: '用系统默认方式打开' }))
    expect(handlers.onClose).toHaveBeenCalled()
    expect(handlers.onOpenWithSystem).toHaveBeenCalledWith(expect.objectContaining({ id: 'app-1' }))
  })

  it('folder 类型配了 openWith 也显示', () => {
    renderMenu(makeApp({ type: 'folder', path: 'D:\\proj', openWith: { command: NOTEPAD } }))
    expect(screen.getByRole('menuitem', { name: '用系统默认方式打开' })).toBeInTheDocument()
  })
})

describe('既有菜单项（回归）', () => {
  it('app 类型显示「以管理员身份运行」', () => {
    renderMenu(makeApp())
    expect(screen.getByRole('menuitem', { name: '以管理员身份运行' })).toBeInTheDocument()
  })

  it('folder 类型不显示「以管理员身份运行」', () => {
    renderMenu(makeApp({ type: 'folder', path: 'D:\\proj' }))
    expect(screen.queryByRole('menuitem', { name: '以管理员身份运行' })).not.toBeInTheDocument()
  })
})

/* 卡片被拖进收纳格之后，这是唯一的"放回去"出口：拖到别的收纳格只是换格子，
   删掉收纳格又会连格一起没。所以它的显示条件必须钉死。 */
describe('移出收纳格', () => {
  it('不在收纳格里时不显示', () => {
    renderMenu(makeApp())
    expect(screen.queryByRole('menuitem', { name: '移出收纳格' })).not.toBeInTheDocument()
  })

  it('在收纳格里时显示，并把格子名放进 title', () => {
    renderMenu(makeApp(), { collectionName: '常用工具' })
    expect(screen.getByRole('menuitem', { name: '移出收纳格' })).toHaveAttribute(
      'title',
      '移出收纳格「常用工具」'
    )
  })

  it('点击后先关菜单再回调', () => {
    const handlers = renderMenu(makeApp(), { collectionName: '常用工具' })
    fireEvent.click(screen.getByRole('menuitem', { name: '移出收纳格' }))
    expect(handlers.onClose).toHaveBeenCalled()
    expect(handlers.onRemoveFromCollection).toHaveBeenCalledWith(expect.objectContaining({ id: 'app-1' }))
  })
})
