import { describe, expect, it } from 'vitest'
import { APPS_FOLDER_SCHEME, extractAumid, isAppsFolderTarget, isAumid, toAppsFolderTarget } from './appTargets'

const CALCULATOR = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
const STORE = 'Microsoft.WindowsStore_8wekyb3d8bbwe!App'

describe('isAumid', () => {
  it('接受规范的包族名 + 应用 ID', () => {
    expect(isAumid(CALCULATOR)).toBe(true)
    expect(isAumid(STORE)).toBe(true)
    expect(isAumid('Microsoft.Windows.Photos_8wekyb3d8bbwe!App')).toBe(true)
    expect(isAumid('{6D809377-6AF0-444B-8957-A3773F02200E}\\Microsoft\\Edge\\Application\\msedge.exe')).toBe(false)
  })

  it('拒绝桌面应用的路径型 AppID', () => {
    // Get-StartApps 对 Win32 应用返回的是路径形态，已被 .lnk 扫描覆盖
    expect(isAumid('C:\\Program Files\\App\\app.exe')).toBe(false)
    expect(isAumid('{GUID}\\app.exe')).toBe(false)
  })

  it('拒绝缺少 13 位发布者哈希或应用 ID 的写法', () => {
    expect(isAumid('Microsoft.WindowsCalculator!App')).toBe(false)
    expect(isAumid('Microsoft.WindowsCalculator_short!App')).toBe(false)
    expect(isAumid('Microsoft.WindowsCalculator_8wekyb3d8bbwe')).toBe(false)
    expect(isAumid('')).toBe(false)
  })

  it('拒绝非字符串', () => {
    expect(isAumid(null)).toBe(false)
    expect(isAumid(undefined)).toBe(false)
    expect(isAumid(42)).toBe(false)
    expect(isAumid({})).toBe(false)
  })

  it('容忍首尾空白', () => {
    expect(isAumid(`  ${CALCULATOR}  `)).toBe(true)
  })
})

describe('toAppsFolderTarget', () => {
  it('拼上 shell:AppsFolder\\ 前缀', () => {
    expect(toAppsFolderTarget(CALCULATOR)).toBe(`${APPS_FOLDER_SCHEME}${CALCULATOR}`)
  })

  it('先去掉 AUMID 的首尾空白', () => {
    expect(toAppsFolderTarget(` ${CALCULATOR} `)).toBe(`${APPS_FOLDER_SCHEME}${CALCULATOR}`)
  })
})

describe('isAppsFolderTarget', () => {
  it('识别前缀（大小写不敏感）', () => {
    expect(isAppsFolderTarget(toAppsFolderTarget(CALCULATOR))).toBe(true)
    expect(isAppsFolderTarget('SHELL:APPSFOLDER\\Foo')).toBe(true)
    expect(isAppsFolderTarget(' shell:AppsFolder\\Foo ')).toBe(true)
  })

  it('拒绝普通路径与无关协议', () => {
    expect(isAppsFolderTarget('C:\\Windows\\notepad.exe')).toBe(false)
    expect(isAppsFolderTarget('shell:startup')).toBe(false)
    expect(isAppsFolderTarget('https://example.com')).toBe(false)
    expect(isAppsFolderTarget(null)).toBe(false)
    expect(isAppsFolderTarget(undefined)).toBe(false)
  })
})

describe('extractAumid', () => {
  it('从目标里取回 AUMID', () => {
    expect(extractAumid(toAppsFolderTarget(CALCULATOR))).toBe(CALCULATOR)
  })

  it('前缀对但 AUMID 形态不对时返回 null', () => {
    expect(extractAumid(`${APPS_FOLDER_SCHEME}not-an-aumid`)).toBe(null)
    expect(extractAumid(`${APPS_FOLDER_SCHEME}`)).toBe(null)
  })

  it('不是 AppsFolder 目标时返回 null', () => {
    expect(extractAumid('C:\\Windows\\notepad.exe')).toBe(null)
    expect(extractAumid(123)).toBe(null)
  })
})
