import type { AppItem, Config } from '../../../shared/types'
import { resolveUrlBrowser } from './urlBrowser'

/**
 * 「启动一个项目」的**唯一分派点**。
 *
 * 抽出来的原因很实在：同一个项目有三个启动入口——主窗口卡片、搜索窗结果、
 * 组合启动成员——分派规则一旦各写一份，就必然出现"在某处能开、在另一处行为不同"。
 * 这不是假设：P3-2 加「用指定程序打开」时只改了主窗口那条路，
 * 搜索窗点同一个卡片会**忽略 openWith**，行为静默不一致。
 *
 * 所以规则只留这一份：`steam → url（可能指定浏览器）→ openWith → folder → app`。
 * 主进程侧的组合启动走 `appHandlers.launchGroupMember`，两条链路的判断顺序保持一致。
 *
 * 只负责"开起来"，不记启动统计——调用方拿到返回值后自己决定要不要计数
 * （打开失败不该计入，否则会污染智能启动与搜索排序）。
 */
export async function launchAppTarget(app: AppItem, config: Config | null): Promise<boolean> {
  /* 关联文件夹里的「路径本身」伪条目：它没有真实项目记录，直接按文件夹打开 */
  if (app.id === '__folder_path__') return window.electronAPI.openFolder(app.path)

  if (app.type === 'steam') return window.electronAPI.openSteam(app.path)

  if (app.type === 'url') {
    /* 网址优先走「指定浏览器」：项目里存了 browserId 就用它，否则交给系统默认浏览器。
       browserId 可能指向一个已被删掉的浏览器条目，`resolveUrlBrowser` 会返回 null
       让我们静默回落——用户的意图是「打开这个网址」，不是「打开那个浏览器」。 */
    const browser = resolveUrlBrowser(app.browserId, config?.browsers)
    return browser
      ? window.electronAPI.openUrlWithBrowser({ url: app.path, browserPath: browser.path })
      : window.electronAPI.openUrl(app.path)
  }

  /* 配了「用指定程序打开」就用它（文件夹也适用，所以排在 folder 分支之前）。
     命令失效时（程序被卸载 / 挪走）**不静默回落**到系统默认方式——
     用户明确指定过用哪个程序，偷偷换个程序打开只会让人以为点错了。 */
  if (app.openWith?.command) {
    return window.electronAPI.openAppWith({
      path: app.path,
      command: app.openWith.command,
      argsBefore: app.openWith.argsBefore,
      argsAfter: app.openWith.argsAfter
    })
  }

  if (app.type === 'folder') return window.electronAPI.openFolder(app.path)

  return window.electronAPI.openApp({
    path: app.path,
    args: app.args,
    workingDir: app.workingDir
  })
}

/**
 * 忽略「用指定程序打开」，强制走系统关联程序。
 *
 * 右键菜单的「用系统默认方式打开」用它——配了指定程序之后仍然需要一条临时绕过的路。
 * ⚠️ 只忽略「用哪个程序」，「启动参数 / 起始位置」照常生效：
 * 那是另一条轴，用户没说要丢掉它们。
 */
export async function launchAppWithSystem(app: AppItem): Promise<boolean> {
  if (app.type === 'folder') return window.electronAPI.openFolder(app.path)
  return window.electronAPI.openApp({
    path: app.path,
    args: app.args,
    workingDir: app.workingDir
  })
}

/**
 * 以管理员身份运行。
 *
 * 「启动参数 / 起始位置」同样带下去：管理员启动是**权限**上的差异，
 * 不是"另一套启动方式"，参数在这里静默失效同样是用户无法解释的行为。
 */
export async function launchAppAsAdmin(app: AppItem): Promise<boolean> {
  return window.electronAPI.openAppAsAdmin({
    path: app.path,
    args: app.args,
    workingDir: app.workingDir
  })
}
