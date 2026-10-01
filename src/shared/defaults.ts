/**
 * 跨进程共用的默认值单点来源。
 *
 * 背景：同一个默认值此前硬编码在四个地方（主进程配置默认值、主进程的兜底字面量、
 * 设置页常量、键盘模块注释），改一处漏三处就会出现「主进程注册的是 A、
 * 设置页显示的是 B」这种最难排查的不一致。
 * 凡是主进程与渲染层都要用的默认值，一律放这里。
 */

/**
 * 默认主窗口热键。
 *
 * ⚠️ 曾经是 `Alt+Space`——它在 Windows 上是**系统保留组合**（窗口系统菜单），
 * `globalShortcut.register` 拿不到它，表现为「装上之后按了没反应」。
 *
 * 换 `Ctrl+Alt+Space` 的理由：
 *  · 不在 Windows 保留列表（保留的是 Alt+Space / Alt+Tab / Alt+Esc / Ctrl+Esc /
 *    Ctrl+Shift+Esc / Alt+F4 / Win+* 等），能真正注册上；
 *  · 主流应用极少占用——`Alt+Q` 被 Office 的「Tell me」占、`Ctrl+Shift+Space`
 *    被 Visual Studio 的「参数信息」占，都不合适；
 *  · 保留 Space 的肌肉记忆，老用户改键成本最低。
 */
export const DEFAULT_HOTKEY = 'Ctrl+Alt+Space'

/**
 * 默认快速搜索热键。
 *
 * ⚠️ 曾经是 `Ctrl+K`——这是个**缺陷级**的默认值，不是口味问题。
 *
 * 这个键走的是 `globalShortcut.register`（见 `main/index.ts` 的 `bindGlobalShortcuts`），
 * 也就是**系统级独占注册**，不是"搜索框里的本地键位"。后果是：装完本应用之后，
 * **全系统的 Ctrl+K 都被吞掉**——VS Code 的删除行、浏览器地址栏搜索、Word、
 * Slack、Gmail…… 而用户几乎不可能把这件事归因到启动器头上。
 *
 * 当初把主热键从 `Alt+Space` 改成 `Ctrl+Alt+Space` 用的正是这条判据
 * （"不能占用系统保留键 / 主流应用的高频键"），但**只改在了主热键上，搜索热键漏了**。
 *
 * 换 `Ctrl+Alt+K` 的理由：
 *  · 保留 `K` 的肌肉记忆，老用户改键成本最低；
 *  · 加上 `Ctrl+Alt` 双修饰键后，与任何主流应用的默认快捷键都不冲突
 *    （`Ctrl+K` 冲突、`Ctrl+Shift+K` 被 VS Code 占、`Alt+K` 被部分 IDE 占）。
 *
 * ⚠️ **任何"两键组合"（单修饰键 + 字母）都不适合做全局热键**——
 * 它们几乎一定已经在某个高频软件里被占用。改这个值之前请先按这条筛一遍。
 */
export const DEFAULT_SEARCH_HOTKEY = 'Ctrl+Alt+K'

/** 默认「暂停 / 恢复快捷键」为空——不启用快捷键暂停，只能从托盘 / 设置切换。 */
export const DEFAULT_PAUSE_HOTKEY = ''

/**
 * `Alt+Space` 这个组合本身。
 *
 * 它有两个身份，别混用：
 *  · 历史上它是默认主热键（见 `LEGACY_DEFAULT_HOTKEY`）；
 *  · 它同时是 Windows 的窗口系统菜单组合，主进程有一段 WM_SYSCOMMAND 钩子
 *    专门处理它（吞菜单 + 窗口聚焦时的本地兜底）。
 * 钩子那侧要判断的是「用户配的是不是这个组合」，与「默认值」无关，
 * 所以单独给一个常量，避免以后换默认值时把那段逻辑带歪。
 */
export const ALT_SPACE_HOTKEY = 'Alt+Space'

/**
 * 旧版本的默认主热键。
 * 只用于识别「从未自定义过」的老用户并做一次性迁移，不要拿它当默认值用。
 */
export const LEGACY_DEFAULT_HOTKEY = ALT_SPACE_HOTKEY

/**
 * 旧版本的默认搜索热键。
 *
 * 它的问题不是"注册不上"，而是**注册得上、于是把别人的键抢走了**——
 * `Ctrl+K` 在编辑器 / 浏览器 / 办公软件里都是高频键。详见 `DEFAULT_SEARCH_HOTKEY`。
 * 同样只用于识别老用户并做一次性迁移，不要拿它当默认值用。
 */
export const LEGACY_DEFAULT_SEARCH_HOTKEY = 'Ctrl+K'

/**
 * 主热键注册失败时的降级候选，按顺序尝试。
 *
 * 目的是根治「开箱即死」：宁可先用一个能用的组合并明确告知用户，
 * 也不要出现「注册失败 + 界面毫无反馈」的静默状态。
 */
export const HOTKEY_FALLBACKS = ['Ctrl+Alt+Q', 'Ctrl+Shift+Space'] as const

/**
 * 计算主热键的候选序列：期望值优先，其后是降级候选（去重、忽略大小写）。
 *
 * @param preferred 配置里期望的热键
 * @param allowFallback false 时只返回期望值本身。
 *   **用户在设置里主动改键的场景必须传 false**——否则「用户刚设的键没注册上，
 *   却被悄悄换成了另一个键」，他会以为设置没生效，比直接报错更让人困惑。
 */
export function getHotkeyCandidates(preferred: string, allowFallback = true): string[] {
  const list: string[] = allowFallback ? [preferred, ...HOTKEY_FALLBACKS] : [preferred]
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const raw of list) {
    const key = (raw || '').trim()
    if (!key) continue
    const lower = key.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    candidates.push(key)
  }
  return candidates
}

/**
 * 是否属于「旧默认热键」——用于判断该不该做一次性迁移。
 * 刻意只匹配这一个字面量：用户手动改成的其它组合一律不动。
 */
export function isLegacyDefaultHotkey(value: string | undefined | null): boolean {
  return (value || '').trim().toLowerCase() === LEGACY_DEFAULT_HOTKEY.toLowerCase()
}

/** 一次性迁移的判定结果。 */
export interface HotkeyMigrationPlan {
  /** 要写回的新热键；null 表示热键本身不用改（只补迁移标记） */
  nextHotkey: string | null
  /** 是否真的替换了热键（用于决定要不要提示用户） */
  migrated: boolean
}

/**
 * 决定一次配置读取之后热键该怎么处理。
 *
 * 抽成纯函数是为了能直接单测——真正落盘的 `migrateLegacyHotkeyDefault()`
 * 在 `main/config.ts`，那里顶层 import 了 electron，单测跑不起来。
 *
 * @returns null 表示什么都不用做（已迁移过）；否则调用方需要写回配置并打上迁移标记
 */
export function planHotkeyDefaultMigration(input: {
  hotkey?: string | null
  hotkeyDefaultMigrated?: boolean
}): HotkeyMigrationPlan | null {
  // 已经迁移过：即使 hotkey 又被设回 Alt+Space 也不动——那是用户自己选的
  if (input.hotkeyDefaultMigrated === true) return null

  const current = (input.hotkey || '').trim()
  if (!current) {
    // 老配置缺字段：补上新默认值，避免落到「空热键」上
    return { nextHotkey: DEFAULT_HOTKEY, migrated: false }
  }
  if (isLegacyDefaultHotkey(current)) {
    return { nextHotkey: DEFAULT_HOTKEY, migrated: true }
  }
  // 用户自定义过：只补标记，热键保持原样
  return { nextHotkey: null, migrated: false }
}

/**
 * 是否属于「旧默认搜索热键」——同样只匹配这一个字面量。
 */
export function isLegacyDefaultSearchHotkey(value: string | undefined | null): boolean {
  return (value || '').trim().toLowerCase() === LEGACY_DEFAULT_SEARCH_HOTKEY.toLowerCase()
}

/** 搜索热键一次性迁移的判定结果。 */
export interface SearchHotkeyMigrationPlan {
  /** 要写回的新搜索热键；null 表示不用改（只补迁移标记） */
  nextSearchHotkey: string | null
  /** 是否真的替换了（用于决定要不要提示用户） */
  migrated: boolean
}

/**
 * 决定一次配置读取之后**搜索热键**该怎么处理。
 *
 * 与主热键那份是同一套判定，但必须分成两个函数、两个标记：
 *  · 两个键的迁移时机、失败原因完全不同（主热键是"注册不上"，搜索热键是"抢了别人的键"）；
 *  · 共用一个标记会导致「只迁移了一个」时另一个永远不再被检查。
 *
 * ⚠️ 缺省补齐时用的是 `migrated: false`：没有旧值被换掉，不该弹「你的快捷键被改了」。
 */
export function planSearchHotkeyDefaultMigration(input: {
  searchHotkey?: string | null
  searchHotkeyDefaultMigrated?: boolean
}): SearchHotkeyMigrationPlan | null {
  // 已迁移过：即使又被设回 Ctrl+K 也不动——那是用户自己选的
  if (input.searchHotkeyDefaultMigrated === true) return null

  const current = (input.searchHotkey || '').trim()
  if (!current) {
    return { nextSearchHotkey: DEFAULT_SEARCH_HOTKEY, migrated: false }
  }
  if (isLegacyDefaultSearchHotkey(current)) {
    return { nextSearchHotkey: DEFAULT_SEARCH_HOTKEY, migrated: true }
  }
  return { nextSearchHotkey: null, migrated: false }
}
