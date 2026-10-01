import type {
  AppItemType,
  GroupLaunchMember,
  GroupLaunchMemberResult,
  GroupLaunchResult,
  OpenWithCommand
} from '../shared/types'

/**
 * 组合启动的纯逻辑。
 *
 * 实际拉起程序的部分留在 `handlers/appHandlers.ts`（依赖 electron 的 shell），
 * 这里只放「入参清洗」与「结果汇总」——这两块是纯函数，也是最容易出错的地方
 * （少截断一个字段就是一条越界写入，漏统计一个失败就是给用户看了假进度），
 * 抽出来才能被单元测试盯住。
 */

/** 成员数量上限：再多就不像"一次开一组"，更像误操作 */
export const MAX_GROUP_MEMBERS = 50
/** 串行启动时每个成员之间的间隔，避免一批程序同时抢磁盘 */
export const SERIAL_LAUNCH_GAP_MS = 250

const MAX_PATH_LENGTH = 4096
const MAX_ID_LENGTH = 160
const MAX_NAME_LENGTH = 200
const MAX_ARGS_LENGTH = 2048
const MAX_WORKING_DIR_LENGTH = 1024

const VALID_TYPES = new Set<AppItemType>(['app', 'folder', 'steam', 'url', 'note', 'group'])

/**
 * 清洗成员上带的「用指定程序打开」。
 * 命令为空即视为没配（与 `sanitizeOpenWith` 同一语义），返回 null 而不是空对象。
 */
function sanitizeMemberOpenWith(value: unknown): OpenWithCommand | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const command = typeof record.command === 'string' ? record.command.trim().slice(0, MAX_PATH_LENGTH) : ''
  if (!command) return null
  return {
    command,
    argsBefore: typeof record.argsBefore === 'string' ? record.argsBefore.slice(0, MAX_ARGS_LENGTH) : '',
    argsAfter: typeof record.argsAfter === 'string' ? record.argsAfter.slice(0, MAX_ARGS_LENGTH) : ''
  }
}

/**
 * 严格校验渲染层传来的成员列表。
 * 字段超长一律截断，数量超限直接丢弃多余部分——组合启动会真的去执行这些路径，
 * 不能有任何"界面上没有、但被顺带执行了"的条目。
 */
export function sanitizeGroupMembers(input: unknown): GroupLaunchMember[] {
  if (!Array.isArray(input)) return []
  const members: GroupLaunchMember[] = []
  for (const raw of input.slice(0, MAX_GROUP_MEMBERS)) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const target = typeof record.path === 'string' ? record.path.trim().slice(0, MAX_PATH_LENGTH) : ''
    if (!target) continue
    members.push({
      id: typeof record.id === 'string' ? record.id.slice(0, MAX_ID_LENGTH) : '',
      name: typeof record.name === 'string' ? record.name.slice(0, MAX_NAME_LENGTH) : '',
      path: target,
      type: typeof record.type === 'string' && VALID_TYPES.has(record.type as AppItemType)
        ? record.type as AppItemType
        : undefined,
      args: typeof record.args === 'string' ? record.args.slice(0, MAX_ARGS_LENGTH) : '',
      workingDir: typeof record.workingDir === 'string'
        ? record.workingDir.slice(0, MAX_WORKING_DIR_LENGTH)
        : '',
      openWith: sanitizeMemberOpenWith(record.openWith)
    })
  }
  return members
}

/** 汇总成员结果。`ok` 只在全员成功时为 true——只要有失败，界面就该把明细摊开给用户看。 */
export function summarizeGroupLaunch(results: GroupLaunchMemberResult[]): GroupLaunchResult {
  const launched = results.filter(item => item.ok).length
  return {
    ok: results.length > 0 && launched === results.length,
    launched,
    failed: results.length - launched,
    results
  }
}
