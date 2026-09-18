// @vitest-environment jsdom
// 本文件用 jsdom 环境跑组件渲染测试（不污染其他测试默认的 node 环境）。
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
// 用 jest-dom 的 vitest 入口：它基于 vitest 的 expect 做 extend，
// 而不是依赖全局 expect（本项目 vitest 未开 globals），否则会报 "expect is not defined"。
import '@testing-library/jest-dom/vitest'
import { AppCard } from './AppCard'
import type { AppItem, UISettings } from '../../../shared/types'

// 用 vi.hoisted 把渲染计数器提到 vi.mock 工厂函数能访问的位置（否则工厂里引用未提升的变量会报错）。
// 思路：AppCard 每次真正进入 render 函数体都会调用 hasDisplayableIcon，
// 所以把这个调用记下来，就能精确判断「函数体有没有被重跑」——这正是 React.memo 要拦截的东西。
const counter = vi.hoisted(() => {
  let count = 0
  return {
    get: () => count,
    inc: () => {
      count++
    },
    reset: () => {
      count = 0
    }
  }
})

vi.mock('../utils/iconUtils', () => ({
  // 替换渲染期调用的图标可见性判断：保留原语义（data:image 且长度足够才算有图），
  // 同时每调用一次就 +1，作为 AppCard 实际渲染次数的探针。
  hasDisplayableIcon: (icon?: string | null) => {
    counter.inc()
    return Boolean(icon && typeof icon === 'string' && icon.startsWith('data:image/') && icon.length >= 200)
  }
}))

function makeApp(): AppItem {
  return {
    id: 'app-1',
    name: '记事本',
    path: 'C:\\Windows\\system32\\notepad.exe',
    icon: '', // 空图标 → hasDisplayableIcon 返回 false，渲染占位图标，不影响计数
    categoryId: 'cat-1',
    subcategoryId: undefined,
    pinyin: 'jishiben',
    firstLetter: 'J',
    type: 'app',
    aliases: undefined,
    launchCount: 0,
    lastOpenedAt: undefined,
    hidden: false
  }
}

/**
 * 直接用 AppCard 自己的 props 类型，避免手写一份容易和组件漂移的定义。
 * （先前用 Record<string, unknown> + `as never` 绕过类型检查，反而让 JSX spread 报错。）
 */
type AppCardProps = React.ComponentProps<typeof AppCard>

function makeProps(overrides: Partial<AppCardProps> = {}): AppCardProps {
  const app = makeApp()
  const ui: UISettings = {
    gridColumns: 6,
    cardSize: 'medium',
    showIcon: true,
    showName: true,
    borderRadius: 8,
    theme: 'aurora',
    layout: 'horizon-workspace',
    sidebarWidth: 240,
    accentColor: '',
    searchWidth: 600,
    searchVerticalRatio: 0.3,
    searchMaxResults: 6,
    sortMode: 'manual',
    searchTheme: 'dark',
    searchOpacity: 0.72,
    searchHintsVisible: true,
    toolbarIconOnly: true
  }
  // 同一次 makeProps 调用产出的函数引用保持稳定（第一个用例依赖这一点）。
  return {
    app,
    ui,
    isDragging: false,
    isDragOver: false,
    isSelected: false,
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onSendFile: vi.fn(),
    onMouseDown: vi.fn(),
    onContextMenu: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides
  } as AppCardProps
}

describe('AppCard React.memo 回归测试', () => {
  beforeEach(() => {
    counter.reset()
    cleanup()
  })

  it('props 引用不变时不应重复渲染（React.memo 生效）', () => {
    const props = makeProps()
    const { rerender } = render(<AppCard {...props} />)
    const afterFirstRender = counter.get()
    expect(afterFirstRender).toBe(1) // 首次渲染必然 +1
    // jest-dom 集成冒烟：渲染产物里确实存在这张卡片（验证 toBeInTheDocument 可用）
    expect(screen.getByRole('button', { name: /打开 记事本/ })).toBeInTheDocument()

    // 用完全相同的 props 引用再渲染一次：React.memo 应短路，函数体不再执行。
    rerender(<AppCard {...props} />)
    expect(counter.get()).toBe(afterFirstRender) // 没增加 = memo 真的拦住了重渲染
  })

  it('传入新的 onOpen 引用时应重新渲染（反向用例，证明测试不是假绿）', () => {
    const props = makeProps()
    const { rerender } = render(<AppCard {...props} />)
    const afterFirstRender = counter.get()
    expect(afterFirstRender).toBe(1)

    // 其它引用保持原样，只换掉 onOpen 的引用——React.memo 应检测到变化并重渲染。
    const props2 = { ...props, onOpen: vi.fn() }
    rerender(<AppCard {...props2} />)
    expect(counter.get()).toBe(afterFirstRender + 1) // 增加了 = 测试确实在监听 prop 变化
  })

  it('父组件重渲染但传给 AppCard 的 props 引用未变时，AppCard 不应重渲染', () => {
    // 在 Parent 之外创建 props，引用保持稳定；父组件因 tick 变化而重渲染，
    // 但传下去的 props 引用始终不变 → React.memo 应短路，AppCard 不再进入 render。
    const stableProps = makeProps()
    function Parent({ tick }: { tick: number }) {
      void tick // 消费 tick 让父组件确实重渲染
      return <AppCard {...stableProps} />
    }
    const { rerender } = render(<Parent tick={0} />)
    const afterFirst = counter.get()
    rerender(<Parent tick={1} />)
    rerender(<Parent tick={2} />)
    expect(counter.get()).toBe(afterFirst) // 父重渲染、props 引用不变 → AppCard 不重渲染
  })
})
