/**
 * 项目路径解析：环境变量（`%KEY%`）与相对路径（便携路径）。
 *
 * ⚠️ 刻意不依赖 `node:path`——本模块同时被主进程与渲染层引用，
 * 渲染层（Vite）拿不到 Node 内置模块。全部用字符串处理实现。
 * 本项目只支持 Windows，因此分隔符统一按 `\` 处理。
 */

/** 路径解析的上下文，来自 `Config.envVars` / `Config.portableRoot` */
export interface PathResolveContext {
  /** 环境变量表 */
  envVars?: { key: string; value: string }[] | null
  /**
   * 相对路径的基准目录。
   * 调用方应保证它已解析成绝对路径（主进程通常回退到应用数据目录）。
   */
  portableRoot?: string | null
}

export type PathResolveError = 'empty' | 'no-portable-root' | null

export interface PathResolveResult {
  /** 解析后的路径；无法解析时为空串 */
  path: string
  /** 结果是否由「相对路径 + 基准目录」拼出来 */
  usedRelative: boolean
  /** 实际参与替换的环境变量名（去重，保留原大小写） */
  usedEnvKeys: string[]
  /** 引用了但没有定义的环境变量名。只提示，不阻断——路径本身可能仍然可用 */
  missingEnvKeys: string[]
  /** 硬错误；`missing-env` 不算错误，走 missingEnvKeys 表达 */
  error: PathResolveError
}

/** `%KEY%` 形式的环境变量引用。KEY 只允许字母数字下划线 */
const ENV_REF_PATTERN = /%([A-Za-z_][A-Za-z0-9_]*)%/g

/**
 * 展开层数上限。
 * 变量值里可以再引用别的变量（`A=%B%\x`），但必须防住循环引用
 * （`A=%B%` / `B=%A%`）——超过这个层数就原样停下。
 */
const MAX_EXPANSION_PASSES = 5

/** 统一分隔符为 Windows 风格，便于比较与拼接 */
function normalizeSeparators(value: string): string {
  return value.replace(/\//g, '\\')
}

/** 去掉结尾的分隔符（保留根：`C:\` 不能变成 `C:`） */
function stripTrailingSeparator(value: string): string {
  const trimmed = value.replace(/\\+$/, '')
  return /^[A-Za-z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed
}

/** 绝对路径判定：盘符（`C:\` / `C:/`）或 UNC（`\\server`） */
export function isAbsolutePath(value: string): boolean {
  const v = (value || '').trim()
  if (!v) return false
  if (/^[A-Za-z]:[\\/]/.test(v)) return true
  if (v.startsWith('\\\\')) return true
  return false
}

/** 相对路径判定：非空且不是绝对路径 */
export function isRelativePath(value: string): boolean {
  const v = (value || '').trim()
  return v !== '' && !isAbsolutePath(v)
}

/**
 * 展开路径里的 `%KEY%` 引用。
 *
 * 未定义的变量**原样保留**并记入 `missingEnvKeys`：界面据此提示
 * 「引用了未定义的变量」，但不会把路径改成空串——用户可能只是想先写占位。
 */
export function expandEnvVars(
  input: string,
  envVars?: { key: string; value: string }[] | null
): { value: string; usedKeys: string[]; missingKeys: string[] } {
  const table = new Map<string, string>()
  for (const entry of envVars || []) {
    if (!entry || typeof entry.key !== 'string') continue
    const key = entry.key.trim().toLowerCase()
    if (!key) continue
    table.set(key, typeof entry.value === 'string' ? entry.value : '')
  }

  const usedKeys: string[] = []
  const missingKeys: string[] = []
  let value = input

  for (let pass = 0; pass < MAX_EXPANSION_PASSES; pass++) {
    let substituted = false
    value = value.replace(ENV_REF_PATTERN, (match, rawKey: string) => {
      const resolved = table.get(rawKey.toLowerCase())
      if (resolved === undefined) {
        if (!missingKeys.includes(rawKey)) missingKeys.push(rawKey)
        return match
      }
      substituted = true
      if (!usedKeys.includes(rawKey)) usedKeys.push(rawKey)
      return resolved
    })
    // 这一轮没有任何替换，说明剩下的要么是未定义变量、要么已经展开完
    if (!substituted) break
  }

  return { value, usedKeys, missingKeys }
}

/**
 * 把绝对路径转成相对于 `root` 的路径。
 *
 * @returns 不在 root 之下（含跨盘）时返回 null
 */
export function toRelativePath(absPath: string, root: string | null | undefined): string | null {
  const base = stripTrailingSeparator(normalizeSeparators((root || '').trim()))
  const target = normalizeSeparators((absPath || '').trim())
  if (!base || !target) return null
  if (!isAbsolutePath(base) || !isAbsolutePath(target)) return null

  // 跨盘无法用相对路径表达
  if (target.slice(0, 2).toLowerCase() !== base.slice(0, 2).toLowerCase()) return null

  const lowerTarget = target.toLowerCase()
  const lowerBase = base.toLowerCase()
  if (lowerTarget === lowerBase) return '.'
  /* 必须匹配到「基准目录 + 分隔符」，否则 `C:\app2` 会被 `C:\app` 误判成子路径，
     相对化之后变成 `2\...`，路径直接跑飞。 */
  if (!lowerTarget.startsWith(lowerBase.endsWith('\\') ? lowerBase : `${lowerBase}\\`)) return null

  return target.slice(base.length + 1)
}

/** 把相对路径挂到基准目录下 */
export function joinPath(base: string, relative: string): string {
  const b = stripTrailingSeparator(normalizeSeparators((base || '').trim()))
  const r = normalizeSeparators((relative || '').trim()).replace(/^\\+/, '')
  if (!b) return r
  if (!r) return b
  return b.endsWith('\\') ? `${b}${r}` : `${b}\\${r}`
}

/**
 * 解析项目路径：先展开环境变量，再按需与基准目录拼接。
 *
 * 供「启动项目」「校验路径是否存在」等所有读路径的地方使用。
 */
export function resolveProjectPath(input: string, context: PathResolveContext = {}): PathResolveResult {
  const raw = (input || '').trim()
  if (!raw) {
    return { path: '', usedRelative: false, usedEnvKeys: [], missingEnvKeys: [], error: 'empty' }
  }

  const expanded = expandEnvVars(raw, context.envVars)
  const value = expanded.value.trim()
  const base = {
    usedEnvKeys: expanded.usedKeys,
    missingEnvKeys: expanded.missingKeys
  }

  if (!value) {
    return { path: '', usedRelative: false, ...base, error: 'empty' }
  }

  if (isAbsolutePath(value)) {
    return { path: value, usedRelative: false, ...base, error: null }
  }

  const root = (context.portableRoot || '').trim()
  if (!root) {
    // 没有基准目录就没法还原相对路径。原样返回并标记，交给调用方决定怎么提示
    return { path: value, usedRelative: true, ...base, error: 'no-portable-root' }
  }

  return { path: joinPath(root, value), usedRelative: true, ...base, error: null }
}

/**
 * 写入路径时的反向操作：能相对化就存相对路径（便携），否则存绝对路径。
 *
 * 只在 `preferRelative` 为 true 时尝试相对化；默认 false 表示保持原有行为，
 * 避免升级后老用户的绝对路径被批量改写。
 */
export function toPortablePath(
  absPath: string,
  context: PathResolveContext & { preferRelative?: boolean } = {}
): { path: string; relative: boolean } {
  const raw = (absPath || '').trim()
  if (!raw) return { path: '', relative: false }
  if (context.preferRelative !== true) return { path: raw, relative: false }
  const relative = toRelativePath(raw, context.portableRoot)
  return relative ? { path: relative, relative: true } : { path: raw, relative: false }
}
