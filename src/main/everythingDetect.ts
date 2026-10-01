import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

/**
 * Everything 本机检测。
 *
 * 目标：让「用端口连本机现有的 Everything」**开箱即用**，而不是要求用户自己去
 * Everything 里翻出端口号再手填到设置里。
 *
 * ⚠️ 两条踩过的坑，改这个文件前必读：
 *
 * ① **ini 可能在安装目录，而不是 %APPDATA%**。Everything 默认把设置存
 *    `%APPDATA%\Everything\Everything.ini`，但用户若关掉「Store settings and data in
 *    %APPDATA%\Everything」，或用了绿色版，活动 ini 就在 **exe 同目录**。
 *    此时 %APPDATA% 里可能残留一份**很久以前的旧 ini**（实测：安装目录那份
 *    `http_server_enabled=1`，%APPDATA% 那份还停在一年前的 `=0`）。
 *    所以必须把所有候选 ini 都读出来，**按 mtime 从新到旧**逐键取值。
 * ② **Everything 运行期不一定立刻把设置写回 ini**，磁盘上的 `enabled` 可能是旧值。
 *    因此搜索侧还保留一层「按候选端口实际探测」的兜底（见 handler 的 pickEverythingPort）。
 *
 * 另外：起子进程（reg / tasklist）一律**异步**，且只服务设置页展示；
 * 搜索热路径不得同步阻塞主进程（那是搜索框唤出卡顿的根因）。
 */

export interface EverythingIniSettings {
  httpServerEnabled?: boolean
  httpServerPort?: number
  allowHttpServer?: boolean
  username?: string
  password?: string
}

/** 端口层信息：只依赖 ini 文件，不需要任何子进程。 */
export interface EverythingPortInfo {
  /** 是否装了 Everything（找到 ini 或 exe） */
  installed: boolean
  /** ini 里 HTTP 服务是否已启用（**可能滞后于 Everything 运行时的真实状态**） */
  httpEnabled: boolean
  /** HTTP 服务端口（ini 未给出时为 undefined） */
  port?: number
  username?: string
  password?: string
  /** 命中的 ini 路径（诊断用） */
  iniPath?: string
}

/** 完整信息：在端口层之上补「进程是否在运行 / exe 路径」，供设置页展示。 */
export interface EverythingDetection extends EverythingPortInfo {
  running: boolean
  exePath?: string
}

/**
 * 解析 Everything.ini 文本，只取我们关心的键。
 * 纯函数，便于单测；不碰文件系统。
 */
export function parseEverythingIni(text: string): EverythingIniSettings {
  const out: EverythingIniSettings = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).trim()
    switch (key) {
      case 'http_server_enabled':
        out.httpServerEnabled = value === '1'
        break
      case 'http_server_port': {
        const n = Number(value)
        if (Number.isFinite(n) && n > 0 && n <= 65535) out.httpServerPort = Math.round(n)
        break
      }
      case 'allow_http_server':
        out.allowHttpServer = value !== '0'
        break
      case 'http_server_username':
        out.username = value
        break
      case 'http_server_password':
        out.password = value
        break
    }
  }
  return out
}

/** Everything 未显式配置端口时的默认端口。 */
export const EVERYTHING_DEFAULT_HTTP_PORT = 80

/** 从 ini 合并结果推导端口：仅在 HTTP 服务已启用时有意义；启用但没写 port 时按默认 80。 */
export function portFromIni(settings: EverythingIniSettings): number | undefined {
  if (settings.httpServerEnabled !== true) return undefined
  return settings.httpServerPort ?? EVERYTHING_DEFAULT_HTTP_PORT
}

/** 判断 ini 是否表明 HTTP 服务已启用。 */
export function httpEnabledFromIni(settings: EverythingIniSettings): boolean {
  return settings.httpServerEnabled === true && settings.allowHttpServer !== false
}

/**
 * 计算实际应连接的 Everything 端口。纯函数。
 * **显式配置优先**；两者都没有则返回 0。
 * ⚠️ 这只是「首选端口」，真正能不能连由 handler 的探测决定（ini 可能滞后）。
 */
export function resolveEverythingPort(
  explicitPort: number,
  detection: EverythingPortInfo | null | undefined
): number {
  if (explicitPort > 0) return explicitPort
  if (detection?.httpEnabled && detection.port && detection.port > 0) return detection.port
  return 0
}

/**
 * 候选端口列表（按尝试顺序，去重）。纯函数。
 *
 * ini 里写了端口但 `enabled` 尚未落盘（Everything 还在运行）时，`resolveEverythingPort`
 * 会给 0；此时靠这份候选表逐个探测兜底。只放「Everything 常见端口」，不撒大网，
 * 且探测端会校验返回结构，避免把恰好占用该端口的其它服务误认成 Everything。
 */
export function candidatePorts(
  explicitPort: number,
  info: EverythingPortInfo | null | undefined
): number[] {
  const out: number[] = []
  const push = (p?: number): void => {
    if (p && p > 0 && p <= 65535 && !out.includes(p)) out.push(p)
  }
  if (explicitPort > 0) {
    push(explicitPort)
    return out
  }
  push(info?.port)
  push(EVERYTHING_DEFAULT_HTTP_PORT)
  push(8080)
  return out
}

/** 可能的 Everything 安装目录（纯猜路径，不查注册表，因此无子进程开销）。 */
function guessInstallDirs(): string[] {
  const dirs: string[] = []
  const pf = process.env.ProgramFiles
  const pf86 = process.env['ProgramFiles(x86)']
  const localAppData = process.env.LOCALAPPDATA
  if (pf) dirs.push(path.join(pf, 'Everything'))
  if (pf86) dirs.push(path.join(pf86, 'Everything'))
  if (localAppData) dirs.push(path.join(localAppData, 'Programs', 'Everything'))
  return dirs
}

/** 不查注册表就能想到的 ini 路径。 */
function cheapIniPaths(): string[] {
  const out: string[] = []
  const appData = process.env.APPDATA
  const localAppData = process.env.LOCALAPPDATA
  const programData = process.env.ProgramData
  if (appData) out.push(path.join(appData, 'Everything', 'Everything.ini'))
  if (localAppData) out.push(path.join(localAppData, 'Everything', 'Everything.ini'))
  if (programData) out.push(path.join(programData, 'Everything', 'Everything.ini'))
  for (const dir of guessInstallDirs()) out.push(path.join(dir, 'Everything.ini'))
  return out
}

function readIniFile(file: string): EverythingIniSettings | null {
  try {
    return parseEverythingIni(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 把多份 ini 合并成一份有效设置。**纯函数**，便于单测。
 *
 * 规则：按 mtime 从新到旧，**逐键取第一个有定义的值**。
 * 为什么不能只看第一份：Everything 的 ini 可能在安装目录（关掉「存到 %APPDATA%」或绿色版），
 * 此时 %APPDATA% 里常残留一份**很旧的** ini。实测踩过：安装目录那份 `http_server_enabled=1`，
 * %APPDATA% 那份还停在一年前的 `=0`，只看 %APPDATA% 就会误判成「HTTP 服务未启用」。
 */
export function mergeIniCandidates(
  found: { file: string; mtime: number; settings: EverythingIniSettings }[]
): { settings: EverythingIniSettings; iniPath?: string } {
  if (found.length === 0) return { settings: {} }
  const sorted = [...found].sort((a, b) => b.mtime - a.mtime)
  const merged: EverythingIniSettings = {}
  const assign = <K extends keyof EverythingIniSettings>(key: K): void => {
    for (const f of sorted) {
      if (merged[key] === undefined && f.settings[key] !== undefined) {
        merged[key] = f.settings[key]
        return
      }
    }
  }
  assign('httpServerEnabled')
  assign('httpServerPort')
  assign('allowHttpServer')
  assign('username')
  assign('password')
  return { settings: merged, iniPath: sorted[0].file }
}

/**
 * 读取所有存在的 ini，按 mtime 从新到旧逐键取值，
 * 保证取到的是 Everything 当前真正在用的那份设置。
 */
function readIniMerged(paths: string[]): { settings: EverythingIniSettings; iniPath?: string } {
  const found: { file: string; mtime: number; settings: EverythingIniSettings }[] = []
  for (const file of paths) {
    let mtime = 0
    try {
      mtime = fs.statSync(file).mtimeMs
    } catch {
      continue
    }
    const settings = readIniFile(file)
    if (settings) found.push({ file, mtime, settings })
  }
  return mergeIniCandidates(found)
}

/* ── 安装目录（注册表）：异步、长缓存，只用于补齐 ini 候选路径与 exe 诊断 ── */

function execFileAsync(file: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf-8', timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) reject(err)
      else resolve(String(stdout))
    })
  })
}

let installDirsCache: { at: number; value: string[] } | null = null
const INSTALL_DIRS_TTL_MS = 5 * 60 * 1000

async function resolveInstallDirs(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  if (installDirsCache && Date.now() - installDirsCache.at < INSTALL_DIRS_TTL_MS) {
    return installDirsCache.value
  }
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Everything',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Everything',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Everything'
  ]
  // 并行查，避免三个键串行叠加延迟
  const outputs = await Promise.all(
    keys.map((key) =>
      execFileAsync('reg', ['query', key, '/v', 'InstallLocation'], 1200).catch(() => '')
    )
  )
  const dirs: string[] = []
  for (const out of outputs) {
    const m = out.match(/InstallLocation\s+REG_[A-Z_]+\s+(.+)/i)
    if (m && m[1].trim()) dirs.push(m[1].trim())
  }
  installDirsCache = { at: Date.now(), value: dirs }
  return dirs
}

/** 全部候选 ini 路径（含注册表给出的安装目录）。 */
async function allIniPaths(): Promise<string[]> {
  const installDirs = await resolveInstallDirs()
  return [...cheapIniPaths(), ...installDirs.map((d) => path.join(d, 'Everything.ini'))]
}

async function findEverythingExe(): Promise<string | undefined> {
  const dirs = [...guessInstallDirs(), ...(await resolveInstallDirs())]
  for (const dir of dirs) {
    const exe = path.join(dir, 'Everything.exe')
    if (fs.existsSync(exe)) return exe
  }
  return undefined
}

async function isEverythingRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const out = await execFileAsync('tasklist', ['/NH', '/FI', 'IMAGENAME eq Everything.exe'], 1500)
    return /everything\.exe/i.test(out)
  } catch {
    return false
  }
}

/* ── 对外接口 ─────────────────────────────────────────────────────────── */

const PORT_CACHE_TTL_MS = 5000
let portCache: { at: number; value: EverythingPortInfo } | null = null

/**
 * 读 ini 得到端口信息（异步：首次会查一次注册表以定位安装目录，之后走缓存）。
 * 5s 结果缓存；`force` 时忽略缓存。
 */
export async function detectEverythingPort(force = false): Promise<EverythingPortInfo> {
  if (!force && portCache && Date.now() - portCache.at < PORT_CACHE_TTL_MS) return portCache.value
  const paths = await allIniPaths()
  const { settings, iniPath } = readIniMerged(paths)
  const port = portFromIni(settings)
  const exeDirs = [...guessInstallDirs(), ...(await resolveInstallDirs())]
  const installed = iniPath !== undefined || exeDirs.some((d) => fs.existsSync(path.join(d, 'Everything.exe')))
  const value: EverythingPortInfo = {
    installed,
    httpEnabled: installed && httpEnabledFromIni(settings) && port !== undefined,
    port,
    username: settings.username,
    password: settings.password,
    iniPath
  }
  portCache = { at: Date.now(), value }
  return value
}

/** 丢弃检测缓存（设置页点「重新检测」时强制重算）。 */
export function invalidateEverythingDetection(): void {
  portCache = null
  installDirsCache = null
}

/**
 * 完整检测（含进程状态 / exe 路径）。**仅供设置页使用**：内部会起 `reg` / `tasklist`。
 * 全部异步，不会阻塞主进程。
 */
export async function detectEverything(force = false): Promise<EverythingDetection> {
  if (force) {
    portCache = null
    installDirsCache = null
  }
  const portInfo = await detectEverythingPort(force)
  const [running, exePath] = await Promise.all([isEverythingRunning(), findEverythingExe()])
  return {
    ...portInfo,
    installed: portInfo.installed || exePath !== undefined,
    running,
    exePath
  }
}

/**
 * 启动时预热：把注册表查询 / ini 读取提前做完，避免用户第一次搜索时才现查。
 * fire-and-forget，失败静默。
 */
export function warmEverythingDetection(): void {
  void detectEverythingPort(true).catch(() => { /* 预热失败不影响功能 */ })
}
