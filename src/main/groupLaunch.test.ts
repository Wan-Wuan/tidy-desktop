import { describe, expect, it } from 'vitest'
import { MAX_GROUP_MEMBERS, sanitizeGroupMembers, summarizeGroupLaunch } from './groupLaunch'
import type { GroupLaunchMemberResult } from '../shared/types'

const member = (path: string, extra: Record<string, unknown> = {}) => ({ id: 'a', name: 'A', path, ...extra })

const result = (ok: boolean, error: string | null = null): GroupLaunchMemberResult => ({
  id: 'x',
  name: 'X',
  path: 'C:\\a.exe',
  ok,
  error
})

describe('sanitizeGroupMembers', () => {
  it('保留合法成员，并把「启动参数 / 起始位置 / 用指定程序打开」一并带上', () => {
    /* 这三样必须跟着成员走：同一个项目在网格里点、在组合里启动，
       行为不一致是用户最难理解的一类问题。 */
    const members = sanitizeGroupMembers([
      { id: '1', name: '微信', path: 'C:\\WeChat.exe', type: 'app' },
      { id: '2', name: '文档', path: 'C:\\Docs', type: 'folder' }
    ])
    expect(members).toEqual([
      {
        id: '1', name: '微信', path: 'C:\\WeChat.exe', type: 'app',
        args: '', workingDir: '', openWith: null
      },
      {
        id: '2', name: '文档', path: 'C:\\Docs', type: 'folder',
        args: '', workingDir: '', openWith: null
      }
    ])
  })

  it('缺字段的成员补空值，不产生 undefined', () => {
    const members = sanitizeGroupMembers([{ id: '1', name: '微信', path: 'C:\\WeChat.exe' }])
    expect(members[0].args).toBe('')
    expect(members[0].workingDir).toBe('')
    expect(members[0].openWith).toBeNull()
  })

  it('openWith 缺命令时收敛成 null，而不是一个空对象', () => {
    const members = sanitizeGroupMembers([
      { id: '1', name: 'a', path: 'C:\\a.exe', openWith: { argsBefore: '-n' } },
      { id: '2', name: 'b', path: 'C:\\b.exe', openWith: { command: '  ' } }
    ])
    expect(members[0].openWith).toBeNull()
    expect(members[1].openWith).toBeNull()
  })

  it('超长的参数与起始位置被截断', () => {
    const members = sanitizeGroupMembers([{
      id: '1', name: 'a', path: 'C:\\a.exe',
      args: 'x'.repeat(5000),
      workingDir: 'y'.repeat(5000)
    }])
    expect(members[0].args!.length).toBe(2048)
    expect(members[0].workingDir!.length).toBe(1024)
  })

  it('丢掉没有 path 或 path 不是字符串的条目', () => {
    const members = sanitizeGroupMembers([
      { id: '1', name: '空路径', path: '' },
      { id: '2', name: '缺路径' },
      { id: '3', name: '数字路径', path: 42 },
      null,
      'not-an-object',
      { id: '4', name: '好的', path: 'C:\\ok.exe' }
    ])
    expect(members).toHaveLength(1)
    expect(members[0].name).toBe('好的')
  })

  it('非数组输入返回空数组', () => {
    expect(sanitizeGroupMembers(null)).toEqual([])
    expect(sanitizeGroupMembers(undefined)).toEqual([])
    expect(sanitizeGroupMembers({ members: [] })).toEqual([])
    expect(sanitizeGroupMembers('members')).toEqual([])
  })

  it('截断超长字段', () => {
    const members = sanitizeGroupMembers([{
      id: 'i'.repeat(500),
      name: 'n'.repeat(500),
      path: `C:\\${'p'.repeat(9000)}`,
      type: 'app'
    }])
    expect(members[0].id).toHaveLength(160)
    expect(members[0].name).toHaveLength(200)
    expect(members[0].path).toHaveLength(4096)
  })

  it('去掉 path 首尾空白', () => {
    expect(sanitizeGroupMembers([member('  C:\\a.exe  ')])[0].path).toBe('C:\\a.exe')
  })

  it('未知 type 降级为 undefined（由分派逻辑按普通程序处理）', () => {
    expect(sanitizeGroupMembers([member('C:\\a.exe', { type: 'evil' })])[0].type).toBeUndefined()
    expect(sanitizeGroupMembers([member('C:\\a.exe', { type: 42 })])[0].type).toBeUndefined()
    expect(sanitizeGroupMembers([member('C:\\a.exe', { type: 'group' })])[0].type).toBe('group')
  })

  it('数量超过上限时截断', () => {
    const many = Array.from({ length: MAX_GROUP_MEMBERS + 20 }, (_, index) => member(`C:\\app${index}.exe`))
    expect(sanitizeGroupMembers(many)).toHaveLength(MAX_GROUP_MEMBERS)
  })

  it('id / name 缺失时留空串而不是 undefined', () => {
    const members = sanitizeGroupMembers([{ path: 'C:\\a.exe' }])
    expect(members[0].id).toBe('')
    expect(members[0].name).toBe('')
  })
})

describe('summarizeGroupLaunch', () => {
  it('全员成功时 ok 为 true', () => {
    const summary = summarizeGroupLaunch([result(true), result(true)])
    expect(summary).toEqual({ ok: true, launched: 2, failed: 0, results: expect.any(Array) })
  })

  it('有失败成员时 ok 为 false，但已成功的数量照实统计', () => {
    const summary = summarizeGroupLaunch([result(true), result(false, 'invalid-path'), result(true)])
    expect(summary.ok).toBe(false)
    expect(summary.launched).toBe(2)
    expect(summary.failed).toBe(1)
  })

  it('空结果不算成功——否则界面会显示"全部启动成功 0 个"', () => {
    expect(summarizeGroupLaunch([]).ok).toBe(false)
  })

  it('结果明细原样带回，顺序不变', () => {
    const first = result(true)
    const second = result(false, 'invalid-url')
    expect(summarizeGroupLaunch([first, second]).results).toEqual([first, second])
  })
})
