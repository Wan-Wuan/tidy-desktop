import type { UrlMetaError } from '../../../shared/types'

/**
 * 抓取失败原因 → 界面文案。
 *
 * 主进程只回结构化错误码，措辞在这里统一决定：
 * 「超时」和「打不开」对用户来说要采取的行动完全不同，不能笼统写成「获取失败」。
 */
export const URL_META_ERROR_TEXT: Record<UrlMetaError, string> = {
  'invalid-url': '网址格式不正确，请检查是否写全（例如 https://example.com）',
  disabled: '已在设置中关闭「自动获取网址信息」',
  timeout: '网站响应超时，请稍后重试或手动填写名称',
  'too-large': '页面过大，已跳过解析',
  'http-error': '网站返回错误状态（如 404、403）',
  network: '无法连接到该网站，请检查网络或网址',
  'empty-response': '网站未返回内容',
  'no-icon': '已获取标题，但该网站没有可用图标'
}

/** 取不到具体原因时的兜底文案。 */
export function describeUrlMetaError(error: UrlMetaError | null): string {
  if (!error) return '获取失败，请手动填写名称'
  return URL_META_ERROR_TEXT[error] ?? '获取失败，请手动填写名称'
}
