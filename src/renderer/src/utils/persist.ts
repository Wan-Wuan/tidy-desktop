import type { AppItem, Category, Config, Subcategory } from '../../../shared/types'

/**
 * 数据落盘的统一封装。
 *
 * 为什么必须有这一层：主进程的 saveApps / saveCategories / saveConfig 都返回
 * `Promise<boolean>`，并且**用 `return false` 表达失败**（例如数据文件损坏时
 * `isDataFileCorrupted` 守卫直接 return false，而不是抛异常）。
 * 渲染层若只 `await` 不看返回值，就等于把所有失败静默吞掉——UI 已经乐观更新，
 * 数据却没落盘，用户下次启动才发现这次的排序 / 归类 / 删除全丢了。
 *
 * 这里统一检查返回值、兜住 IPC 异常（未捕获的 rejection 会污染控制台且无人处理），
 * 并把失败通过注入的 notifier 告知用户。
 *
 * 为什么 notifier 是注入而不是直接引用组件：本模块被多个 hook 与组件共用，
 * 而提示 UI（轻提示 ToastStack）只有 App 层持有。App 挂载时注入实现，卸载时归还，
 * 未注入时静默失败但依然返回真实结果，调用方（如撤销流程）可据此决定后续动作。
 */

type PersistNotifier = (message: string) => void

let notifier: PersistNotifier | null = null

/** 由 App 层在挂载时注入轻提示实现；卸载时传 null 归还，避免指向已卸载组件。 */
export function setPersistNotifier(fn: PersistNotifier | null): void {
  notifier = fn
}

function reportFailure(hint: string): false {
  notifier?.(`保存${hint}失败，本次改动可能未持久化`)
  return false
}

/** 落盘应用数据。返回是否成功（false 时已通过 notifier 提示）。 */
export async function persistApps(apps: AppItem[], hint = '应用数据'): Promise<boolean> {
  try {
    const ok = await window.electronAPI.saveApps({ apps })
    return ok ? true : reportFailure(hint)
  } catch {
    return reportFailure(hint)
  }
}

/** 落盘分类 + 子分类。返回是否成功（false 时已通过 notifier 提示）。 */
export async function persistCategories(
  categories: Category[],
  subcategories: Subcategory[],
  hint = '分类数据'
): Promise<boolean> {
  try {
    const ok = await window.electronAPI.saveCategories({ categories, subcategories })
    return ok ? true : reportFailure(hint)
  } catch {
    return reportFailure(hint)
  }
}

/** 落盘配置。返回是否成功（false 时已通过 notifier 提示）。 */
export async function persistConfig(config: Config, hint = '设置'): Promise<boolean> {
  try {
    const ok = await window.electronAPI.saveConfig(config)
    return ok ? true : reportFailure(hint)
  } catch {
    return reportFailure(hint)
  }
}
