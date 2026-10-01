import { useCallback, useState } from 'react'
import type { UrlMetaError, UrlMetaResult } from '../../../shared/types'

export type UrlMetaStatus = 'idle' | 'loading' | 'done' | 'error'

export interface UrlMetaState {
  status: UrlMetaStatus
  title: string
  /** favicon 的 data URL；拿不到为 null，界面降级成域名头像 */
  icon: string | null
  error: UrlMetaError | null
}

const IDLE: UrlMetaState = { status: 'idle', title: '', icon: null, error: null }

/**
 * 网址元信息抓取（标题 + favicon）。
 *
 * 抽成 hook 而不是在弹窗里就地写一次 `await`：添加弹窗和编辑弹窗都要用，
 * 两处各自维护一套 loading / error 状态迟早会走偏（一处显示 spinner、
 * 另一处默默失败）。这里只管状态，措辞交给 `utils/urlMetaError`。
 *
 * 失败**不抛异常**——抓不到标题不是错误路径，用户手动填一个名字照样能存。
 */
export function useUrlMeta() {
  const [state, setState] = useState<UrlMetaState>(IDLE)
  /** 本次请求对应的地址，供界面回显「抓的是哪个链接」 */
  const [pendingUrl, setPendingUrl] = useState('')

  const fetchMeta = useCallback(async (url: string): Promise<UrlMetaResult | null> => {
    const trimmed = (url || '').trim()
    if (!trimmed) return null
    setPendingUrl(trimmed)
    setState({ status: 'loading', title: '', icon: null, error: null })
    try {
      const result = await window.electronAPI.fetchUrlMeta(trimmed)
      setState({
        status: result.ok ? 'done' : 'error',
        title: result.title,
        icon: result.icon,
        error: result.error
      })
      return result.ok ? result : null
    } catch {
      // IPC 本身炸了（主进程未注册通道等），当成网络类失败，不要往上抛
      setState({ status: 'error', title: '', icon: null, error: 'network' })
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState(IDLE)
    setPendingUrl('')
  }, [])

  return { ...state, pendingUrl, fetchMeta, reset }
}
