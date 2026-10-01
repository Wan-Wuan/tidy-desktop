import { describe, expect, it } from 'vitest'
import { isTrustedReleaseAssetUrl, pickInstallerAsset, type ReleaseAsset } from './assets'

const gh = (name: string) => `https://github.com/Wan-Wuan/tidy-desktop/releases/download/v2.9.3/${name}`
const gitee = (name: string) => `https://gitee.com/wanwuan/tidy_desktop/releases/download/v2.9.3/${name}`

const asset = (name: string, url: string): ReleaseAsset => ({ name, browser_download_url: url, size: 100 })

describe('isTrustedReleaseAssetUrl', () => {
  it('认自家仓库的 GitHub / Gitee 发布地址', () => {
    expect(isTrustedReleaseAssetUrl(gh('a.exe'), 'github')).toBe(true)
    expect(isTrustedReleaseAssetUrl(gitee('a.exe'), 'gitee')).toBe(true)
  })

  it('渠道与域名必须对应，不能交叉', () => {
    expect(isTrustedReleaseAssetUrl(gh('a.exe'), 'gitee')).toBe(false)
    expect(isTrustedReleaseAssetUrl(gitee('a.exe'), 'github')).toBe(false)
  })

  it('非 https 一律拒绝', () => {
    expect(isTrustedReleaseAssetUrl('http://github.com/Wan-Wuan/tidy-desktop/releases/download/v1/a.exe', 'github'))
      .toBe(false)
  })

  it('别家仓库 / 别的路径拒绝', () => {
    expect(isTrustedReleaseAssetUrl('https://github.com/evil/tidy-desktop/releases/download/v1/a.exe', 'github'))
      .toBe(false)
    expect(isTrustedReleaseAssetUrl('https://github.com/Wan-Wuan/tidy-desktop/raw/main/a.exe', 'github'))
      .toBe(false)
  })

  it('不是合法 URL 时不抛异常', () => {
    expect(isTrustedReleaseAssetUrl('not a url', 'github')).toBe(false)
  })
})

describe('pickInstallerAsset', () => {
  it('同一个 release 里同时有安装版与便携版时，挑安装版', () => {
    /* 这是加便携版打包目标之后最容易踩的坑：便携版是自解压单文件，
       装不了、也无法自替换，被当成安装包下下来只会更新失败。 */
    const picked = pickInstallerAsset([
      asset('tidy-desktop-Portable-2.9.3.exe', gh('tidy-desktop-Portable-2.9.3.exe')),
      asset('tidy-desktop-Setup-2.9.3.exe', gh('tidy-desktop-Setup-2.9.3.exe'))
    ], 'github')
    expect(picked?.name).toBe('tidy-desktop-Setup-2.9.3.exe')
  })

  it('便携版排在前面也不受影响', () => {
    const picked = pickInstallerAsset([
      asset('tidy-desktop-Setup-2.9.3.exe', gh('tidy-desktop-Setup-2.9.3.exe')),
      asset('tidy-desktop-Portable-2.9.3.exe', gh('tidy-desktop-Portable-2.9.3.exe'))
    ], 'github')
    expect(picked?.name).toBe('tidy-desktop-Setup-2.9.3.exe')
  })

  it('只有便携版时仍退回任意 exe——不能把老用户挡在更新之外', () => {
    const picked = pickInstallerAsset([asset('tidy-desktop-2.9.2.exe', gh('tidy-desktop-2.9.2.exe'))], 'github')
    expect(picked?.name).toBe('tidy-desktop-2.9.2.exe')
  })

  it('忽略 blockmap 与 .sha256 之类的非 exe 资产', () => {
    const picked = pickInstallerAsset([
      asset('tidy-desktop-Setup-2.9.3.exe.blockmap', gh('tidy-desktop-Setup-2.9.3.exe.blockmap')),
      asset('tidy-desktop-Setup-2.9.3.exe.sha256', gh('tidy-desktop-Setup-2.9.3.exe.sha256')),
      asset('tidy-desktop-Setup-2.9.3.exe', gh('tidy-desktop-Setup-2.9.3.exe'))
    ], 'github')
    expect(picked?.name).toBe('tidy-desktop-Setup-2.9.3.exe')
  })

  it('不受信任来源的资产直接忽略', () => {
    const picked = pickInstallerAsset([
      asset('tidy-desktop-Setup-2.9.3.exe', 'https://evil.com/Wan-Wuan/tidy-desktop/releases/download/v1/x.exe')
    ], 'github')
    expect(picked).toBeNull()
  })

  it('没有可用资产时返回 null', () => {
    expect(pickInstallerAsset([], 'github')).toBeNull()
    expect(pickInstallerAsset([asset('notes.txt', gh('notes.txt'))], 'github')).toBeNull()
  })
})
