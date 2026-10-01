/**
 * 发布物（release asset）的挑选规则。
 *
 * 抽成独立模块是为了能被单测直接盯住——这里出错的后果很隐蔽：
 * 挑错了资产，更新器会把一个**不能安装的 exe** 当成安装包下下来、交给助手进程执行，
 * 用户看到的是"更新失败"或更糟的"更新后程序打不开"。
 */

export type UpdateChannel = 'gitee' | 'github'

export interface ReleaseAsset {
  name?: string
  browser_download_url?: string
  size?: number
  digest?: string
}

/** 安装包的命名标记（`electron-builder.yml` 的 `artifactName`） */
const INSTALLER_MARKER = '-Setup-'

/**
 * 资产下载地址是否来自**受信任的发布渠道**。
 *
 * 只认自家仓库的 releases/download 路径：更新链路会把这个地址的内容下下来执行，
 * 少一层校验就等于"任何能改 API 响应的人都能让我们执行任意程序"。
 */
export function isTrustedReleaseAssetUrl(rawUrl: string, source: UpdateChannel): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    if (source === 'github') {
      return url.hostname === 'github.com' &&
        url.pathname.startsWith('/Wan-Wuan/tidy-desktop/releases/download/')
    }
    return url.hostname === 'gitee.com' &&
      url.pathname.startsWith('/wanwuan/tidy_desktop/releases/download/')
  } catch {
    return false
  }
}

/**
 * 从一批发布物里挑出**安装包**。
 *
 * ⚠️ 必须优先挑 `-Setup-` 那个。同一个 release 里现在同时挂着
 * `tidy-desktop-Setup-x.y.z.exe`（NSIS 安装包）与 `tidy-desktop-Portable-x.y.z.exe`
 * （免安装版自解压单文件），而**便携版不能当安装包用**——它装不了、也无法自替换。
 * 只按"第一个 .exe"挑，就会在加了便携版之后把更新链路挑到便携版上。
 *
 * 找不到 `-Setup-` 时退回"任意 .exe"：历史版本可能用过别的命名规则，
 * 不能因为加了一条新规则就把老用户挡在更新之外。
 */
export function pickInstallerAsset(assets: ReleaseAsset[], source: UpdateChannel): ReleaseAsset | null {
  const candidates = assets.filter(asset =>
    Boolean(asset.name) &&
    asset.name!.endsWith('.exe') &&
    !asset.name!.includes('blockmap') &&
    Boolean(asset.browser_download_url) &&
    isTrustedReleaseAssetUrl(asset.browser_download_url!, source)
  )
  return candidates.find(asset => asset.name!.includes(INSTALLER_MARKER)) ?? candidates[0] ?? null
}
