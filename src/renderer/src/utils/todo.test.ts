import { describe, it, expect } from 'vitest'
import {
  createTodoItem,
  countTodos,
  toggleTodoItem,
  updateTodoText,
  removeTodoItem,
  clearCompletedTodos,
  formatTodosAsMarkdown,
  summarizeTodos
} from './todo'
import type { TodoItem } from '../../../shared/types'

const item = (id: string, text: string, done = false): TodoItem => ({ id, text, done })

describe('createTodoItem', () => {
  it('默认未完成，且自动分配 id', () => {
    const created = createTodoItem('买牛奶')
    expect(created.text).toBe('买牛奶')
    expect(created.done).toBe(false)
    expect(created.id).not.toBe('')
  })

  it('两次创建的 id 不同', () => {
    expect(createTodoItem('a').id).not.toBe(createTodoItem('a').id)
  })

  it('传入 id 时用传入的（测试需要确定性）', () => {
    expect(createTodoItem('a', 'fixed').id).toBe('fixed')
  })
})

describe('countTodos', () => {
  it('空列表返回 0/0', () => {
    expect(countTodos([])).toEqual({ total: 0, done: 0 })
  })

  it('统计完成数', () => {
    expect(countTodos([item('1', 'a', true), item('2', 'b'), item('3', 'c', true)]))
      .toEqual({ total: 3, done: 2 })
  })
})

describe('toggleTodoItem', () => {
  it('把未完成勾成完成', () => {
    const next = toggleTodoItem([item('1', 'a')], '1')
    expect(next[0].done).toBe(true)
  })

  it('再点一次取消完成', () => {
    const next = toggleTodoItem([item('1', 'a', true)], '1')
    expect(next[0].done).toBe(false)
  })

  it('只影响目标条目，其余原样', () => {
    const next = toggleTodoItem([item('1', 'a'), item('2', 'b')], '2')
    expect(next[0].done).toBe(false)
    expect(next[1].done).toBe(true)
  })

  it('id 不存在时原样返回，不抛错', () => {
    const list = [item('1', 'a')]
    expect(toggleTodoItem(list, 'nope')).toEqual(list)
  })

  it('不改动传入的数组（不可变）', () => {
    const list = [item('1', 'a')]
    toggleTodoItem(list, '1')
    expect(list[0].done).toBe(false)
  })
})

describe('updateTodoText', () => {
  it('改写指定条目的文字', () => {
    const next = updateTodoText([item('1', 'a'), item('2', 'b')], '2', '新文字')
    expect(next[1].text).toBe('新文字')
    expect(next[0].text).toBe('a')
  })

  it('允许改成空串——编辑器里清空输入框是要重打，不是要还原', () => {
    const next = updateTodoText([item('1', 'a')], '1', '')
    expect(next[0].text).toBe('')
  })

  it('id 不存在时原样返回', () => {
    expect(updateTodoText([item('1', 'a')], 'nope', 'x')).toEqual([item('1', 'a')])
  })
})

describe('removeTodoItem', () => {
  it('移除目标条目', () => {
    expect(removeTodoItem([item('1', 'a'), item('2', 'b')], '1')).toEqual([item('2', 'b')])
  })

  it('id 不存在时原样返回', () => {
    expect(removeTodoItem([item('1', 'a')], 'nope')).toHaveLength(1)
  })
})

describe('clearCompletedTodos', () => {
  it('只留下未完成的，顺序不变', () => {
    const next = clearCompletedTodos([
      item('1', 'a', true),
      item('2', 'b'),
      item('3', 'c', true),
      item('4', 'd')
    ])
    expect(next.map(i => i.id)).toEqual(['2', '4'])
  })

  it('没有已完成条目时不改动', () => {
    expect(clearCompletedTodos([item('1', 'a')])).toHaveLength(1)
  })
})

describe('formatTodosAsMarkdown', () => {
  it('输出 Markdown 任务列表，完成态用 x', () => {
    expect(formatTodosAsMarkdown([item('1', '买牛奶', true), item('2', '取快递')]))
      .toBe('- [x] 买牛奶\n- [ ] 取快递')
  })

  it('空列表输出空串', () => {
    expect(formatTodosAsMarkdown([])).toBe('')
  })
})

describe('summarizeTodos', () => {
  it('空列表给固定文案', () => {
    expect(summarizeTodos([])).toBe('空待办')
  })

  it('列出未完成的前三条', () => {
    const list = [item('1', 'a'), item('2', 'b'), item('3', 'c'), item('4', 'd')]
    expect(summarizeTodos(list)).toBe('0/4 已完成 · a、b、c')
  })

  it('全部完成时只显示进度', () => {
    expect(summarizeTodos([item('1', 'a', true), item('2', 'b', true)])).toBe('2/2 已完成')
  })
})
