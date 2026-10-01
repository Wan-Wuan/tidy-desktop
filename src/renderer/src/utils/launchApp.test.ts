// @vitest-environment jsdom
/* 「启动一个项目」的唯一分派点。
   重点：分派顺序（steam → url → openWith → folder → app），以及
   `args` / `workingDir` 必须真的传下去——它们曾经是只存不用的死配置。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { launchAppTarget, launchAppWithSystem, launchAppAsAdmin } from './launchApp'
import type { AppItem, Config } from '../../../shared/types'

const CODE = 'C:\\Tools\\code.exe'

function makeApi() {
  return {
    openApp: vi.fn().mockResolvedValue(true),
    openAppWith: vi.fn().mockResolvedValue(true),
    openAppAsAdmin: vi.fn().mockResolvedValue(true),
    openFolder: vi.fn().mockResolvedValue(true),
    openSteam: vi.fn().mockResolvedValue(true),
    openUrl: vi.fn().mockResolvedValue(true),
    openUrlWithBrowser: vi.fn().mockResolvedValue(true)
  }
}

let api: ReturnType<typeof makeApi>

function makeApp(overrides: Partial<AppItem> = {}): AppItem {
  return {
    id: 'a1',
    name: '示例',
    path: 'C:\\App\\demo.exe',
    icon: '',
    categoryId: 'cat-1',
    subcategoryId: null,
    pinyin: '',
    firstLetter: '',
    type: 'app',
    ...overrides
  }
}

const configWithBrowsers = {
  browsers: [{ id: 'chrome', name: 'Chrome', path: 'C:\\Chrome\\chrome.exe' }]
} as unknown as Config

beforeEach(() => {
  api = makeApi()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = api
})
afterEach(() => cleanup())

describe('分派顺序', () => {
  it('关联文件夹的「路径本身」伪条目按文件夹打开', async () => {
    await launchAppTarget(makeApp({ id: '__folder_path__', path: 'D:\\proj' }), null)
    expect(api.openFolder).toHaveBeenCalledWith('D:\\proj')
    expect(api.openApp).not.toHaveBeenCalled()
  })

  it('steam 走 openSteam', async () => {
    await launchAppTarget(makeApp({ type: 'steam', path: 'steam://rungameid/1' }), null)
    expect(api.openSteam).toHaveBeenCalledWith('steam://rungameid/1')
  })

  it('网址配了浏览器就用指定浏览器', async () => {
    await launchAppTarget(makeApp({ type: 'url', path: 'https://a.com', browserId: 'chrome' }), configWithBrowsers)
    expect(api.openUrlWithBrowser).toHaveBeenCalledWith({
      url: 'https://a.com',
      browserPath: 'C:\\Chrome\\chrome.exe'
    })
  })

  it('网址没配浏览器（或指向已删除的条目）回落系统默认', async () => {
    await launchAppTarget(makeApp({ type: 'url', path: 'https://a.com', browserId: 'gone' }), configWithBrowsers)
    expect(api.openUrl).toHaveBeenCalledWith('https://a.com')
    expect(api.openUrlWithBrowser).not.toHaveBeenCalled()
  })

  it('openWith 优先于 folder——文件夹也能用指定程序打开', async () => {
    await launchAppTarget(makeApp({ type: 'folder', path: 'D:\\proj', openWith: { command: CODE } }), null)
    expect(api.openAppWith).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:\\proj', command: CODE }))
    expect(api.openFolder).not.toHaveBeenCalled()
  })

  it('文件夹没配 openWith 才走 openFolder', async () => {
    await launchAppTarget(makeApp({ type: 'folder', path: 'D:\\proj' }), null)
    expect(api.openFolder).toHaveBeenCalledWith('D:\\proj')
  })

  it('普通应用走 openApp', async () => {
    await launchAppTarget(makeApp(), null)
    expect(api.openApp).toHaveBeenCalledWith({ path: 'C:\\App\\demo.exe', args: undefined, workingDir: undefined })
  })
})

describe('启动参数 / 起始位置', () => {
  it('launchAppTarget 把 args 与 workingDir 带下去', async () => {
    await launchAppTarget(makeApp({ args: '--profile=work', workingDir: 'D:\\proj' }), null)
    expect(api.openApp).toHaveBeenCalledWith({
      path: 'C:\\App\\demo.exe',
      args: '--profile=work',
      workingDir: 'D:\\proj'
    })
  })

  it('「用系统默认方式打开」只忽略 openWith，不丢 args', async () => {
    await launchAppWithSystem(makeApp({
      args: '--profile=work',
      workingDir: 'D:\\proj',
      openWith: { command: CODE }
    }))
    expect(api.openAppWith).not.toHaveBeenCalled()
    expect(api.openApp).toHaveBeenCalledWith({
      path: 'C:\\App\\demo.exe',
      args: '--profile=work',
      workingDir: 'D:\\proj'
    })
  })

  it('「用系统默认方式打开」对文件夹走 openFolder', async () => {
    await launchAppWithSystem(makeApp({ type: 'folder', path: 'D:\\proj', openWith: { command: CODE } }))
    expect(api.openFolder).toHaveBeenCalledWith('D:\\proj')
  })

  it('提权启动同样带上 args 与 workingDir（权限差异不该顺带丢掉参数）', async () => {
    await launchAppAsAdmin(makeApp({ args: '-v', workingDir: 'D:\\proj' }))
    expect(api.openAppAsAdmin).toHaveBeenCalledWith({
      path: 'C:\\App\\demo.exe',
      args: '-v',
      workingDir: 'D:\\proj'
    })
  })
})
