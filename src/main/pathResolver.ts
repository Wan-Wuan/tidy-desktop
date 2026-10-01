/**
 * 主进程侧的「项目路径」解析。
 *
 * `shared/pathResolve.ts` 只是一组纯函数；本模块负责把 `Config.envVars` /
 * `Config.portableRoot` 喂给它，让**所有从渲染层进来的路径**（启动、定位、
 * 复制到剪贴板、提取图标……）在真正落到文件系统之前统一展开环境变量、
 * 还原相对路径。
 *
 * 为什么收口在主进程而不是渲染层：
 *  · 路径的消费方全在主进程（`shell.openPath` / `spawn` / `fs`），只在这一层收口，
 *    渲染层就不可能漏掉某个调用点（此前 `extractIcon` / `openAppAsAdmin` 这类
 *    边角入口正是最容易漏的地方）；
 *  · 渲染层传下来的原始值保持不变，数据文件里存的仍是用户写下的那个形式。
 *
 * 缓存：`config.json` 不大，但图标回填这类循环会对同一批路径反复调用，
 * 没必要每次都读盘。这里缓存一份解析上下文，`save-config` 成功后失效。
 */

import { CONFIG_FILE, getDefaultConfig, readJsonFile } from './config'
import { expandEnvVars, resolveProjectPath, type PathResolveContext } from '../shared/pathResolve'
import type { Config } from '../shared/types'

let cachedContext: PathResolveContext | null = null

/** 配置变更（`save-config` 成功）后必须调用，否则会拿着旧的变量表解析路径 */
export function invalidatePathResolveContext(): void {
  cachedContext = null
}

/** 当前生效的解析上下文（envVars + portableRoot），带缓存 */
export function getPathResolveContext(): PathResolveContext {
  if (cachedContext) return cachedContext
  const config = readJsonFile<Config>(CONFIG_FILE, getDefaultConfig())
  cachedContext = {
    envVars: Array.isArray(config.envVars) ? config.envVars : [],
    portableRoot: config.portableRoot ?? null
  }
  return cachedContext
}

/**
 * 解析一个从渲染层传来的路径。
 *
 * @returns 解析后的路径；入参不是字符串、或解析结果为空串时返回 `null`
 *          （调用方应当直接拒绝，不要回退到未解析的原值）。
 */
export function resolveIncomingPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const { path } = resolveProjectPath(raw, getPathResolveContext())
  return path || null
}

/**
 * 展开**非路径字符串**里的 `%KEY%` 引用（目前只有「启动参数」用得上）。
 *
 * 与 `resolveIncomingPath` 的区别：这里**不做相对路径还原、不做绝对路径校验**——
 * 参数是任意字符串，套用路径那套规则只会把它改坏（比如把 `--out=build` 当成
 * 相对路径拼到便携根目录下）。只做变量展开这一件事。
 *
 * 未定义的变量原样保留（`expandEnvVars` 的既有语义），用户能一眼看出哪里没配对。
 */
export function expandIncomingEnvVars(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return ''
  return expandEnvVars(raw, getPathResolveContext().envVars).value
}
