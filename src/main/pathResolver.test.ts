import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* 路径解析层要读 `config.json`，而 config.ts 通过 electron 拿 userData 目录。
   整块替换掉 electron，让它在纯 Node 下可测——与 update/assistant.test.ts 同一手法。 */
vi.mock('electron', () => ({
  app: { getPath: () => 'mock-electron-userdata' }
}))

import { getPathResolveContext, invalidatePathResolveContext, resolveIncomingPath } from './pathResolver'

const MOCK_ROOT = path.resolve('mock-electron-userdata')
const DATA_DIR = path.join(MOCK_ROOT, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

function writeConfig(value: Record<string, unknown>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(value), 'utf-8')
  invalidatePathResolveContext()
}

beforeEach(() => {
  fs.rmSync(MOCK_ROOT, { recursive: true, force: true })
  invalidatePathResolveContext()
})

afterEach(() => {
  fs.rmSync(MOCK_ROOT, { recursive: true, force: true })
  invalidatePathResolveContext()
})

describe('getPathResolveContext', () => {
  it('没有配置文件时给出空上下文', () => {
    expect(getPathResolveContext()).toEqual({ envVars: [], portableRoot: null })
  })

  it('读出 envVars 与 portableRoot', () => {
    writeConfig({
      envVars: [{ key: 'SUB', value: 'apps' }],
      portableRoot: 'D:\\Portable'
    })
    expect(getPathResolveContext()).toEqual({
      envVars: [{ key: 'SUB', value: 'apps' }],
      portableRoot: 'D:\\Portable'
    })
  })

  it('缓存：配置变了但没失效时仍用旧值，失效后立刻生效', () => {
    writeConfig({ portableRoot: 'D:\\First' })
    expect(getPathResolveContext().portableRoot).toBe('D:\\First')

    // 直接改盘上的文件（不调 invalidate）→ 缓存仍返回旧值
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ portableRoot: 'D:\\Second' }), 'utf-8')
    expect(getPathResolveContext().portableRoot).toBe('D:\\First')

    invalidatePathResolveContext()
    expect(getPathResolveContext().portableRoot).toBe('D:\\Second')
  })
})

describe('resolveIncomingPath', () => {
  it('绝对路径原样返回', () => {
    expect(resolveIncomingPath('C:\\Windows\\notepad.exe')).toBe('C:\\Windows\\notepad.exe')
  })

  it('展开 %VAR% 后与便携根目录拼接', () => {
    writeConfig({
      envVars: [{ key: 'SUB', value: 'apps' }],
      portableRoot: 'D:\\Portable'
    })
    expect(resolveIncomingPath('%SUB%\\tool.exe')).toBe('D:\\Portable\\apps\\tool.exe')
  })

  it('环境变量本身是绝对路径时不再拼接', () => {
    writeConfig({
      envVars: [{ key: 'ROOT', value: 'E:\\Tools' }],
      portableRoot: 'D:\\Portable'
    })
    expect(resolveIncomingPath('%ROOT%\\tool.exe')).toBe('E:\\Tools\\tool.exe')
  })

  it('没有 portableRoot 时相对路径保持原样（交由 assertPath 拒绝）', () => {
    writeConfig({ portableRoot: null })
    expect(resolveIncomingPath('apps\\tool.exe')).toBe('apps\\tool.exe')
  })

  it('非字符串与空串返回 null', () => {
    expect(resolveIncomingPath(null)).toBeNull()
    expect(resolveIncomingPath(123)).toBeNull()
    expect(resolveIncomingPath(undefined)).toBeNull()
    expect(resolveIncomingPath('')).toBeNull()
    expect(resolveIncomingPath('   ')).toBeNull()
  })
})
