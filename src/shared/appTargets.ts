/**
 * 「应用标识型」启动目标。
 *
 * Microsoft Store / UWP 应用没有可以直接执行的文件路径，Windows 给它们的唯一
 * 稳定标识是 AUMID（Application User Model ID，形如
 * `Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`），而它能被 `explorer.exe`
 * 通过 `shell:AppsFolder\<AUMID>` 这个虚拟目录协议拉起。
 *
 * 所以扫描结果里这类项目的 path / targetPath 会写成 `shell:AppsFolder\...`。
 * 它既不是绝对路径、也没有扩展名，会一路撞上 `assertPath` 的两道校验；
 * 而「这算不算一个可启动目标」的判断在主进程启动分支和渲染层都要用，
 * 抽成独立模块才能保证只有一份定义（放在 `utils.ts` 会和文件类型白名单混在一起）。
 */

export const APPS_FOLDER_SCHEME = 'shell:AppsFolder\\'

/**
 * AUMID 的稳定形态：`<包族名>_<13 位发布者哈希>!<应用 ID>`。
 *
 * 只认这一种形态是有意为之——`Get-StartApps` 的输出里，桌面应用的 AppID 是
 * `{GUID}\path\to\app.exe` 这类路径形式，它们已经被 .lnk 扫描覆盖了，
 * 放进来只会在导入列表里制造重复项。
 */
const AUMID_PATTERN = /^[\w.-]+_[a-z0-9]{13}!\S+$/

/** 是否是一条规范形态的 AUMID。 */
export function isAumid(value: unknown): value is string {
  return typeof value === 'string' && AUMID_PATTERN.test(value.trim())
}

/** 把 AUMID 拼成可交给 explorer.exe 的虚拟目录目标。 */
export function toAppsFolderTarget(aumid: string): string {
  return `${APPS_FOLDER_SCHEME}${aumid.trim()}`
}

/** 是否是一个 `shell:AppsFolder\...` 形式的启动目标。 */
export function isAppsFolderTarget(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().toLowerCase().startsWith(APPS_FOLDER_SCHEME.toLowerCase())
  )
}

/** 从 `shell:AppsFolder\<AUMID>` 取回 AUMID；形态不对时返回 null。 */
export function extractAumid(value: unknown): string | null {
  if (!isAppsFolderTarget(value)) return null
  const aumid = value.trim().slice(APPS_FOLDER_SCHEME.length)
  return isAumid(aumid) ? aumid : null
}
