import { isAppsFolderTarget, isAumid } from '../shared/appTargets'

/**
 * 「这个项目的启动目标还有效吗」——`validate-apps` 的判定核心。
 *
 * 抽成独立模块纯粹是为了能测：handler 本体挂在 `ipcMain` 上，
 * 单测里起不来；而这段判定偏偏是**会误删用户数据**的那种代码。
 *
 * ⚠️ 为什么不能一律 `fs.access(path)`：
 * `path` 字段是个"启动目标"，**只有 `app` / `folder` 才真的是磁盘路径**。
 * 其余类型各有各的形态，拿它们去 `fs.access` 必然失败：
 *
 *   · `url`   —— path 存的是网址本身（见渲染层 `launchAppTarget`）
 *   · `steam` —— path 是 `steam://...` 协议地址
 *   · `app`（商店 / UWP）—— path 是 `shell:AppsFolder\<AUMID>` 虚拟目录目标
 *   · `note` / `group` —— 根本没有路径，表单里恒为空串
 *     （见 `validation.ts` 的 `APP_TYPE_REQUIRES_PATH`）
 *
 * 于是每个网址项目、每个商店应用、每条笔记都会被报成"失效路径"，
 * 而「清理失效项 / 一键修复」拿到这份结果就直接把它们**删掉**。
 * 所以按类型分流，各自用自己形态的合法性校验。
 *
 * 返回三种结论而不是布尔值，是为了把"能当场判定"和"必须落盘实测"分开：
 * 只有 `needs-fs-check` 才该去碰文件系统。
 */
export type TargetVerdict = 'valid' | 'invalid' | 'needs-fs-check'

export function classifyAppTarget(pathValue: string, type: string): TargetVerdict {
  if (type === 'steam') {
    return /^steam:\/\//i.test(pathValue) ? 'valid' : 'invalid'
  }
  if (type === 'url') {
    /* 只校验"是不是一个带协议的地址"——能不能打开得看网络，这里不该管。
       注意不能拿这个正则去认 Windows 绝对路径：`C:\Tools` 里 `C:` 也匹配
       `^[a-z][a-z0-9+.-]*:`，所以这条分支必须**先按类型**限定住。 */
    return /^[a-z][a-z0-9+.-]*:/i.test(pathValue) ? 'valid' : 'invalid'
  }
  if (type === 'note' || type === 'group') {
    // 文本与组合没有路径，空路径不等于失效
    return 'valid'
  }
  if (isAppsFolderTarget(pathValue) || isAumid(pathValue)) {
    // 商店应用的虚拟目录目标：没有真实文件可查，形态合法即视为有效
    return 'valid'
  }
  if (!pathValue) return 'invalid'
  return 'needs-fs-check'
}
