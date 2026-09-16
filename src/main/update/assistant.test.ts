import { describe, expect, it, vi } from 'vitest'
import path from 'path'

// 助手模块会读 electron 的临时目录；这里替换掉整个模块，让它在纯 Node 下可测
vi.mock('electron', () => ({
  app: { getPath: () => 'mock-temp' }
}))

import { parseUpdateAssistantArgs } from './assistant'

const tempDir = path.resolve('mock-temp')
const installerInTemp = path.join(tempDir, 'tidy-desktop-update.exe')

function argvWith(overrides: Partial<Record<'installer' | 'waitPid' | 'installDir', string>> = {}) {
  const args = ['tidy-desktop.exe', '--tidy-update-install']
  const installer = overrides.installer ?? installerInTemp
  const waitPid = overrides.waitPid ?? '4321'
  const installDir = overrides.installDir ?? 'C:\\Apps\\tidy-desktop'
  if (installer !== '') args.push(`--tidy-installer=${installer}`)
  if (waitPid !== '') args.push(`--tidy-wait-pid=${waitPid}`)
  if (installDir !== '') args.push(`--tidy-install-dir=${installDir}`)
  return args
}

describe('parseUpdateAssistantArgs', () => {
  it('没有助手标记时返回 null（普通启动不受影响）', () => {
    expect(parseUpdateAssistantArgs(['tidy-desktop.exe'])).toBeNull()
    expect(parseUpdateAssistantArgs(['tidy-desktop.exe', '--some-other-flag'])).toBeNull()
  })

  it('参数齐全时正确解析', () => {
    expect(parseUpdateAssistantArgs(argvWith())).toEqual({
      installerPath: installerInTemp,
      waitPid: 4321,
      installDir: 'C:\\Apps\\tidy-desktop'
    })
  })

  it('拒绝临时目录之外的安装包路径', () => {
    // 防止这个开关被当成"用任意 exe 启动任意程序"的后门
    expect(parseUpdateAssistantArgs(argvWith({ installer: 'C:\\evil\\payload.exe' }))).toBeNull()
    expect(parseUpdateAssistantArgs(argvWith({ installer: path.join(tempDir, '..', 'evil.exe') }))).toBeNull()
  })

  it('拒绝非法或缺失的 PID', () => {
    expect(parseUpdateAssistantArgs(argvWith({ waitPid: 'abc' }))).toBeNull()
    expect(parseUpdateAssistantArgs(argvWith({ waitPid: '-1' }))).toBeNull()
    expect(parseUpdateAssistantArgs(argvWith({ waitPid: '0' }))).toBeNull()
    expect(parseUpdateAssistantArgs(argvWith({ waitPid: '' }))).toBeNull()
  })

  it('拒绝缺失的安装目录', () => {
    expect(parseUpdateAssistantArgs(argvWith({ installDir: '' }))).toBeNull()
  })

  it('拒绝缺失的安装包路径', () => {
    expect(parseUpdateAssistantArgs(argvWith({ installer: '' }))).toBeNull()
  })
})
