import { ipcMain, shell, dialog, clipboard, nativeImage } from 'electron'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { guardNativeDialog } from '../dialogGuard'
import { extractAumid, isAppsFolderTarget, toAppsFolderTarget } from '../../shared/appTargets'
import { formatWindowsArguments, splitCommandLine } from '../../shared/commandLine'
import { normalizeHttpUrl } from '../../shared/urls'
import { SERIAL_LAUNCH_GAP_MS, sanitizeGroupMembers, summarizeGroupLaunch } from '../groupLaunch'
import { LAUNCHABLE_EXTENSIONS, assertPath, assertSender, type PathGuardOptions } from '../ipcGuard'
import { resolveIncomingPath, expandIncomingEnvVars } from '../pathResolver'
import type { GroupLaunchMember, GroupLaunchMemberResult, GroupLaunchResult, OpenWithCommand } from '../../shared/types'

/**
 * 渲染层传来的路径统一入口：**先解析（展开 `%KEY%`、还原相对路径），再校验**。
 *
 * 顺序不能反——相对路径过不了 `assertPath` 的「必须绝对路径」这道关，
 * 反过来先校验就等于把便携路径直接拒掉，功能看着做了其实永远不生效。
 */
function resolveAndAssert(value: unknown, options?: PathGuardOptions): string | null {
  return assertPath(resolveIncomingPath(value), options)
}

/** 安全地将 PowerShell 命令编码为 Base64，避免注入 */
function encodePsCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Windows 剪贴板的"文件拖放列表"格式名 */
const CF_HDROP = 'CF_HDROP'

/**
 * 构造 CF_HDROP 需要的 DROPFILES 结构：
 *   DWORD pFiles(20) + POINT pt(8) + BOOL fNC(4) + BOOL fWide(4)
 * 后面紧跟 UTF-16LE 的路径列表，各路径以 \0 结尾，整体再补一个 \0 收尾。
 */
function buildFileDropBuffer(filePaths: string[]): Buffer {
  const HEADER_SIZE = 20
  const list = Buffer.from(filePaths.join('\0') + '\0\0', 'utf16le')
  const buffer = Buffer.alloc(HEADER_SIZE + list.length)
  buffer.writeUInt32LE(HEADER_SIZE, 0) // pFiles：文件名列表相对结构体的偏移
  buffer.writeInt32LE(0, 4)            // pt.x
  buffer.writeInt32LE(0, 8)            // pt.y
  buffer.writeUInt32LE(0, 12)          // fNC
  buffer.writeUInt32LE(1, 16)          // fWide：Unicode 路径
  list.copy(buffer, HEADER_SIZE)
  return buffer
}

/**
 * 确认剪贴板里确实存在"文件拖放"格式。
 * Windows 上 Chromium 可能把它登记成 CF_HDROP，也可能规范化成 FileNameW——
 * 只认前者会把成功误判成失败，每次都退回慢速的外部命令，等于白优化。
 */
function hasFileDropFormat(): boolean {
  return clipboard.availableFormats().some(f => /^(cf_hdrop|filenamew)$/i.test(f))
}

/** 原生写 CF_HDROP 失败时的兜底：异步跑 PowerShell，不用 execFileSync 阻塞主进程 */
function copyFileViaPowerShell(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $dropList = New-Object System.Collections.Specialized.StringCollection; $dropList.Add('${filePath.replace(/'/g, "''")}') | Out-Null; [System.Windows.Forms.Clipboard]::SetFileDropList($dropList)`
    execFile(
      'powershell',
      ['-NoProfile', '-EncodedCommand', encodePsCommand(psScript)],
      { windowsHide: true, timeout: 5000 },
      (error) => {
        if (error) {
          console.error('PowerShell clipboard fallback failed:', error)
          resolve(false)
          return
        }
        resolve(true)
      }
    )
  })
}

function isSafeWebUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isSafeSteamUrl(steamUrl: string): boolean {
  return /^steam:\/\/(?:launch\/\d+(?:\/\d+)?|rungameid\/\d+)$/i.test(steamUrl)
}

/**
 * 分离启动一个进程，并**真实反馈成败**。
 *
 * `spawn` 的失败是异步的（`'error'` 事件），不会 throw，所以不能直接 `return true`——
 * 那样"命令不存在""路径写错"都会被报成打开成功，用户看到的是"点了没反应但界面说成功了"。
 *
 * ⚠️ `shell: false`（spawn 的默认值，这里显式写出来以免将来被误改）：
 * 一旦交给 shell，参数里的 `&` `|` `>` `^` `%VAR%` 就会被解释成命令分隔符，
 * 用户填的"路径后内容"直接变成任意命令执行。参数必须以数组形式原样传给目标程序。
 *
 * `options.cwd` 是「起始位置」的唯一落点——`shell.openPath` 根本没法设工作目录。
 */
function launchDetached(command: string, args: string[], options: { cwd?: string } = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const child = spawn(command, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      // 未指定时不传该键：传 undefined 与传空串语义不同，后者会让 cwd 变成空路径
      ...(options.cwd ? { cwd: options.cwd } : {})
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      console.error('Failed to launch:', command, error)
      resolve(false)
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve(true)
    })
  })
}

/* ------------------------------------------------------------------ 启动参数 */

/** 「启动参数 / 起始位置」的清洗结果 */
interface LaunchExtras {
  /** 拆分后的参数数组（已经过 `%KEY%` 展开与 Windows 命令行拆分） */
  args: string[]
  /** 起始位置（绝对路径；无效则 undefined） */
  workingDir?: string
}

/** 能从 `spawn` 直接带参数启动的扩展名。`.bat`/`.cmd` 要 shell，`.lnk`/`.msc` 要 shell 解析 */
const SPAWNABLE_EXTENSIONS = ['.exe']

/**
 * 判断某个已解析的绝对路径能不能走 `spawn`（也就是能不能带启动参数）。
 *
 * 为什么不复用 `LAUNCHABLE_EXTENSIONS`：那份白名单是"允许被打开"，
 * 而这里是"允许被直接 exec"——`.lnk` 能打开但 `spawn` 不了，
 * 两者是不同的集合，混用会导致 `.lnk` 卡片配上参数后彻底打不开。
 */
function isSpawnableTarget(resolvedPath: string): boolean {
  const ext = path.extname(resolvedPath).toLowerCase()
  return SPAWNABLE_EXTENSIONS.includes(ext)
}

/**
 * 读取并清洗「启动参数 / 起始位置」。
 *
 * 参数先展开 `%KEY%`，再按 Windows 命令行规则拆成数组——
 * **绝不 `split(' ')`**：那样 `--title="a b"` 会被拆成两个参数。
 *
 * 入参刻意用结构类型而不是 `Record<string, unknown>`：这样组合成员（`GroupLaunchMember`）
 * 与 IPC 载荷（`Record<string, unknown>`）都能直接传进来，不必各处转换一遍。
 */
function readLaunchExtras(input: { args?: unknown; workingDir?: unknown }): LaunchExtras {
  const rawArgs = expandIncomingEnvVars(input.args)
  const args = rawArgs ? splitCommandLine(rawArgs) : []
  const rawCwd = expandIncomingEnvVars(input.workingDir).trim()
  /* 起始位置必须是已存在的目录：`spawn` 遇到不存在的 cwd 会直接报 ENOENT，
     而那会被当成"程序启动失败"，用户完全看不出真正原因在"起始位置"上。 */
  let workingDir: string | undefined
  if (rawCwd) {
    try {
      if (fs.statSync(rawCwd).isDirectory()) workingDir = rawCwd
      else console.warn('Ignored working dir (not a directory):', rawCwd)
    } catch {
      console.warn('Ignored working dir (not found):', rawCwd)
    }
  }
  return { args, workingDir }
}

/**
 * 「用指定程序打开」的**唯一**执行入口（单个启动与组合启动共用）。
 *
 * 路径与命令都走 `resolveAndAssert`：`%KEY%` 展开、相对路径还原、绝对路径校验、
 * 命令扩展名收窄到 `.exe`。参数以数组传入 `launchDetached`，**不经过任何 shell**。
 *
 * 失败时返回 false 而**不回落**到系统默认方式——用户明确指定过程序，
 * 偷偷换个程序打开只会让人以为点错了。想临时绕过走右键菜单的「用系统默认方式打开」。
 */
async function launchWithCommand(rawPath: unknown, openWith: OpenWithCommand): Promise<boolean> {
  const target = resolveAndAssert(rawPath, { mustExist: false })
  if (!target) {
    console.warn('Rejected open-with target:', rawPath)
    return false
  }
  const command = resolveAndAssert(openWith.command, { extensions: ['.exe'] })
  if (!command) {
    console.warn('Rejected open-with command:', openWith.command)
    return false
  }
  const before = splitCommandLine(openWith.argsBefore || '')
  const after = splitCommandLine(openWith.argsAfter || '')
  return launchDetached(command, [...before, target, ...after])
}

/**
 * 通过 `shell:AppsFolder\<AUMID>` 拉起 Microsoft Store / UWP 应用。
 *
 * 交给 explorer.exe 处理——只有它认识这个虚拟目录协议：
 * `shell.openPath` 只接受真实文件路径，`shell.openExternal` 又会拦掉非 http(s) 协议。
 * explorer.exe 拉起目标后自己就退出了，不 detach 也不会留下常驻进程。
 */
function launchAppsFolderTarget(target: string): boolean {
  const aumid = extractAumid(target)
  if (!aumid) return false
  try {
    execFile('explorer.exe', [toAppsFolderTarget(aumid)], { windowsHide: true })
    return true
  } catch (error) {
    console.error('Failed to launch AppsFolder target:', error)
    return false
  }
}

/**
 * 打开一个「可执行目标」：普通程序走 shell.openPath，Store 应用走 AppsFolder 协议。
 * 返回失败原因而不是抛异常——单个启动与组合启动都要用到，组合启动还要把原因汇总给用户。
 *
 * 配了「启动参数 / 起始位置」时改走 `spawn`（`shell.openPath` 既不能传参也不能设 cwd）。
 * 只有 `.exe` 走得了这条路，其余扩展名会退回 `shell.openPath` 并记一条警告——
 * 界面侧同样按这个规则提示，正常路径下用户看不到这条警告。
 */
async function openAppTarget(
  rawPath: unknown,
  extras: LaunchExtras = { args: [] }
): Promise<{ ok: boolean; error: string | null }> {
  const wantsExtras = extras.args.length > 0 || Boolean(extras.workingDir)

  /* AppsFolder 协议要先于路径解析判断：`shell:AppsFolder\xxx` 不是文件系统路径，
     一旦被当成相对路径拼到 portableRoot 下就彻底跑飞了。 */
  if (isAppsFolderTarget(rawPath)) {
    if (wantsExtras) {
      // Store 应用由 explorer 代拉起，没有 argv 可传——说清楚，别让参数静默失效
      console.warn('Launch args are not supported for AppsFolder targets:', rawPath)
    }
    return launchAppsFolderTarget(rawPath) ? { ok: true, error: null } : { ok: false, error: 'launch-failed' }
  }
  const safePath = resolveAndAssert(rawPath, { extensions: LAUNCHABLE_EXTENSIONS })
  if (!safePath) return { ok: false, error: 'invalid-path' }

  if (wantsExtras) {
    if (isSpawnableTarget(safePath)) {
      const launched = await launchDetached(safePath, extras.args, { cwd: extras.workingDir })
      return launched ? { ok: true, error: null } : { ok: false, error: 'launch-failed' }
    }
    console.warn('Launch args ignored for non-spawnable target:', safePath)
  }

  const error = await shell.openPath(safePath)
  return error ? { ok: false, error } : { ok: true, error: null }
}

/* ------------------------------------------------------------------ 组合启动 */

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 按类型分派单个成员。任何失败都收敛成 `{ ok: false, error }`，不中断整批。 */
async function launchGroupMember(member: GroupLaunchMember): Promise<GroupLaunchMemberResult> {
  const base = { id: member.id, name: member.name, path: member.path }
  const fail = (error: string): GroupLaunchMemberResult => ({ ...base, ok: false, error })
  const succeed = (): GroupLaunchMemberResult => ({ ...base, ok: true, error: null })

  switch (member.type) {
    case 'folder': {
      /* 文件夹同样可能配了「用指定程序打开」（用编辑器打开项目目录是最常见的用法），
         所以先看 openWith；没配才回落到"用资源管理器打开"。 */
      if (member.openWith?.command) {
        return (await launchWithCommand(member.path, member.openWith)) ? succeed() : fail('launch-failed')
      }
      const safePath = resolveAndAssert(member.path)
      if (!safePath) return fail('invalid-path')
      const error = await shell.openPath(safePath)
      return error ? fail(error) : succeed()
    }
    case 'steam': {
      if (!isSafeSteamUrl(member.path)) return fail('invalid-url')
      await shell.openExternal(member.path)
      return succeed()
    }
    case 'url': {
      const url = normalizeHttpUrl(member.path)
      if (!url) return fail('invalid-url')
      await shell.openExternal(url)
      return succeed()
    }
    case 'note':
    case 'group':
      /* 笔记还没有"打开"这个动作（P3-1），组合里再套组合则会无限展开。
         两者都明确报错，让用户在结果面板里看到，而不是静默少开一个。 */
      return fail('unsupported-type')
    default: {
      /* app 类型：openWith 优先，否则带上「启动参数 / 起始位置」走默认打开方式 */
      if (member.openWith?.command) {
        return (await launchWithCommand(member.path, member.openWith)) ? succeed() : fail('launch-failed')
      }
      const result = await openAppTarget(member.path, readLaunchExtras(member))
      return result.ok ? succeed() : fail(result.error ?? 'launch-failed')
    }
  }
}

async function launchGroupMembersSerially(members: GroupLaunchMember[]): Promise<GroupLaunchMemberResult[]> {
  const results: GroupLaunchMemberResult[] = []
  for (const [index, member] of members.entries()) {
    results.push(await launchGroupMember(member))
    if (index < members.length - 1) await delay(SERIAL_LAUNCH_GAP_MS)
  }
  return results
}

export function registerAppHandlers() {
  /**
   * 打开一个「应用」项目。
   *
   * 入参是**对象**而不是裸路径字符串：P3 之后同一个项目还带着「启动参数 / 起始位置」，
   * 用位置参数传下去会变成 `open-app(path, args, workingDir)` 这种谁都不敢改的签名
   * （与 `open-app-with` 的载荷形状也保持一致）。
   */
  ipcMain.handle('open-app', async (event, payload: unknown) => {
    if (!assertSender(event)) return false
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const result = await openAppTarget(record.path, readLaunchExtras(record))
    if (!result.ok && result.error !== 'invalid-path') {
      console.error('Failed to open app:', result.error)
    }
    return result.ok
  })

  /**
   * 组合启动：逐个启动成员并汇总结果。
   * 单个成员失败**不中断**整批——用户点一次"全开"，能开的都该开起来，
   * 失败的条目由渲染层在结果面板里列出来。
   */
  ipcMain.handle('launch-group', async (event, payload: unknown): Promise<GroupLaunchResult> => {
    const empty: GroupLaunchResult = { ok: false, launched: 0, failed: 0, results: [] }
    if (!assertSender(event)) return empty

    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const members = sanitizeGroupMembers(record.members)
    if (members.length === 0) return empty

    const results = record.serial === true
      ? await launchGroupMembersSerially(members)
      : await Promise.all(members.map(member => launchGroupMember(member)))

    return summarizeGroupLaunch(results)
  })

  ipcMain.handle('show-item-in-folder', async (event, appPath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = resolveAndAssert(appPath)
    if (!safePath) return false
    try {
      shell.showItemInFolder(safePath)
      return true
    } catch (error) {
      console.error('Failed to show item in folder:', error)
      return false
    }
  })

  ipcMain.handle('open-containing-folder', async (event, appPath: unknown) => {
    // 允许路径不存在：调用方会在目标消失时退回到打开其父目录
    const safePath = resolveAndAssert(appPath, { mustExist: false })
    if (!assertSender(event) || !safePath) return false
    try {
      if (fs.existsSync(safePath)) {
        const stat = fs.statSync(safePath)
        const folderPath = stat.isDirectory() ? safePath : path.dirname(safePath)
        const error = await shell.openPath(folderPath)
        return !error
      }
      const folderPath = path.dirname(safePath)
      const error = await shell.openPath(folderPath)
      return !error
    } catch (error) {
      console.error('Failed to open containing folder:', error)
      return false
    }
  })

  ipcMain.handle('open-app-as-admin', async (event, payload: unknown) => {
    // 这是全项目权限最高的入口（会弹 UAC 提权执行），白名单收紧到可执行文件
    if (!assertSender(event)) return false
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const safePath = resolveAndAssert(record.path, { extensions: LAUNCHABLE_EXTENSIONS })
    if (!safePath) {
      console.warn('Rejected admin launch for non-launchable path:', record.path)
      return false
    }
    try {
      /* 这里不得不拼一次字符串：`Start-Process` 只接受字符串参数，
         没有"数组 + shell:false"那条路可走。所以每个插值都必须先变成
         **完整的单引号 PowerShell 字面量**（内部 `'` 翻倍），
         否则用户填的参数就能越出引号、变成 PowerShell 代码。

         参数走 `formatWindowsArguments` 做"再引用"：`Start-Process -ArgumentList`
         接到的字符串会被原样拼到子进程命令行上，不重新引用的话
         `--title=a b` 到子进程那里就成了两个参数。 */
      const { args, workingDir } = readLaunchExtras(record)
      const psLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`
      const scriptParts = [`Start-Process -FilePath ${psLiteral(safePath)} -Verb RunAs`]
      if (args.length > 0) scriptParts.push(`-ArgumentList ${psLiteral(formatWindowsArguments(args))}`)
      if (workingDir) scriptParts.push(`-WorkingDirectory ${psLiteral(workingDir)}`)
      execFile('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        scriptParts.join(' ')
      ], { windowsHide: true })
      return true
    } catch (error) {
      console.error('Failed to open app as admin:', error)
      return false
    }
  })

  ipcMain.handle('open-folder', async (event, folderPath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = resolveAndAssert(folderPath)
    if (!safePath) return false
    const error = await shell.openPath(safePath)
    if (error) {
      console.error('Failed to open folder:', error)
      return false
    }
    return true
  })

  /**
   * 打开本机文件搜索命中的任意文件/目录。
   * 与 open-app 不同：open-app 只放行可执行扩展名（ LAUNCHABLE_EXTENSIONS ），
   * 而文件搜索结果可能是 .txt / .docx / 目录等——这些都要能直接打开。
   * 因此这里只做"绝对路径 + 必须存在"的底线校验，不限制扩展名。
   */
  ipcMain.handle('open-path', async (event, filePath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = assertPath(filePath, { absolute: true, mustExist: true })
    if (!safePath) return false
    try {
      const error = await shell.openPath(safePath)
      if (error) {
        console.error('Failed to open path:', error)
        return false
      }
      return true
    } catch (error) {
      console.error('Failed to open path:', error)
      return false
    }
  })

  ipcMain.handle('open-url', async (event, url: string) => {
    if (!assertSender(event)) return false
    try {
      if (!isSafeWebUrl(url)) {
        console.warn('Rejected unsafe URL:', url)
        return false
      }
      await shell.openExternal(url)
      return true
    } catch (error) {
      console.error('Failed to open URL:', error)
      return false
    }
  })

  /**
   * 用指定浏览器打开网址（配置里的 `Config.browsers`）。
   *
   * Windows 没有「用某个 exe 打开这个 URL」的系统 API，只能自己 spawn 浏览器进程，
   * 所以两条输入都必须卡死：URL 过 http/https 白名单，浏览器路径必须真实存在
   * 且以 `.exe` 结尾。少卡一条，这个通道就等价于「渲染层可以执行任意程序」。
   */
  ipcMain.handle('open-url-with-browser', async (event, payload: unknown) => {
    if (!assertSender(event)) return false
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const url = typeof record.url === 'string' ? record.url : ''
    const browserPath = typeof record.browserPath === 'string' ? record.browserPath : ''
    if (!isSafeWebUrl(url)) {
      console.warn('Rejected unsafe URL:', url)
      return false
    }
    if (!/\.exe$/i.test(browserPath) || !fs.existsSync(browserPath)) {
      console.warn('Rejected browser path:', browserPath)
      return false
    }
    return launchDetached(browserPath, [url])
  })

  ipcMain.handle('open-steam', async (event, steamUrl: string) => {
    if (!assertSender(event)) return false
    try {
      if (!isSafeSteamUrl(steamUrl)) {
        console.warn('Rejected unsafe Steam URL:', steamUrl)
        return false
      }
      await shell.openExternal(steamUrl)
      return true
    } catch (error) {
      console.error('Failed to open Steam URL:', error)
      return false
    }
  })

  /**
   * 用指定程序打开一个本地项目（P3-2 文件项目命令行工具）。
   *
   * 命令行形状固定为 `[命令] [路径前参数] [项目路径] [路径后内容]`——
   * 路径夹在中间，两头都能放选项，覆盖 `code --goto <file>` 与
   * `tool -n <file> -nosession` 两种常见惯例。
   *
   * 两条输入必须分别卡死：
   *   · **命令**：真实存在、且**必须是 `.exe`**。这里刻意不用 `LAUNCHABLE_EXTENSIONS`
   *     （它含 `.bat` / `.cmd` / `.lnk`）——那些交给 `spawn` 是跑不起来的，
   *     要跑就得套一层 `cmd.exe /c`，等于把刚刚排除掉的 shell 又请回来。
   *     用户真想跑脚本，可以把命令指向 `cmd.exe`、参数里写 `/c "xxx.bat"`：
   *     这样 shell 是**用户显式选择**的，不是我们偷偷加的。
   *   · **目标路径**：走 `resolveAndAssert`，展开 `%KEY%` 并还原便携路径。
   * 参数本身无法白名单（是用户可控的任意字符串），安全边界靠 `launchDetached`
   * 的 `shell: false` + 数组传参来保证。
   */
  ipcMain.handle('open-app-with', async (event, payload: unknown) => {
    if (!assertSender(event)) return false
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    return launchWithCommand(record.path, {
      command: typeof record.command === 'string' ? record.command : '',
      argsBefore: typeof record.argsBefore === 'string' ? record.argsBefore : '',
      argsAfter: typeof record.argsAfter === 'string' ? record.argsAfter : ''
    })
  })

  ipcMain.handle('select-folder', async (event) => {
    if (!assertSender(event)) return null
    try {
      const result = await guardNativeDialog(() => dialog.showOpenDialog({
        properties: ['openDirectory']
      }))
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    } catch (error) {
      console.error('Failed to select folder:', error)
      return null
    }
  })

  ipcMain.handle('run-quick-action', async (event, command: unknown) => {
    // 这个入口能关机/重启/锁屏，来源必须校验
    if (!assertSender(event)) return false
    try {
      if (command === 'shutdown' || command === 'restart') {
        const actionLabel = command === 'shutdown' ? '关机' : '重启'
        const result = await guardNativeDialog(() => dialog.showMessageBox({
          type: 'warning',
          buttons: ['取消', `确认${actionLabel}`],
          defaultId: 0,
          cancelId: 0,
          message: `确定要立即${actionLabel}电脑吗？`,
          detail: '未保存的工作可能会丢失。'
        }))
        if (result.response !== 1) return false
      }
      switch (command) {
        case 'shutdown':
          spawn('shutdown.exe', ['/s', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'restart':
          spawn('shutdown.exe', ['/r', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'lock':
          execFile('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true })
          return true
        case 'settings':
          await shell.openExternal('ms-settings:')
          return true
        case 'calculator':
          spawn('calc.exe', [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'notepad':
          spawn('notepad.exe', [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
          return true
        case 'clipboard':
          execFile('explorer.exe', ['ms-clipboard:'], { windowsHide: true })
          return true
        default:
          return false
      }
    } catch (error) {
      console.error('Failed to run quick action:', error)
      return false
    }
  })

  ipcMain.handle('copy-file-to-clipboard', async (event, filePath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = resolveAndAssert(filePath)
    if (!safePath) return false
    try {
      // 直接写 Windows 的 CF_HDROP：不用起 PowerShell，主进程也不会被阻塞。
      // 以前走 execFileSync 拉起 powershell，冷启动几百毫秒且会卡住整个界面。
      clipboard.writeBuffer(CF_HDROP, buildFileDropBuffer([safePath]))
      if (hasFileDropFormat()) return true
      return await copyFileViaPowerShell(safePath)
    } catch (error) {
      console.error('Failed to copy file to clipboard:', error)
      return false
    }
  })

  ipcMain.handle('copy-image-to-clipboard', async (event, filePath: unknown) => {
    if (!assertSender(event)) return false
    const safePath = resolveAndAssert(filePath)
    if (!safePath) return false
    try {
      const image = nativeImage.createFromPath(safePath)
      if (!image.isEmpty()) {
        clipboard.writeImage(image)
        return true
      }
      // 解码不了的矢量图（SVG 等）退化为复制文件本身，至少还能粘贴出去
      clipboard.writeBuffer(CF_HDROP, buildFileDropBuffer([safePath]))
      return hasFileDropFormat()
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error)
      return false
    }
  })
}
