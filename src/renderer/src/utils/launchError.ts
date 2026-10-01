/**
 * 组合启动的失败原因 → 界面文案。
 *
 * 主进程只回错误码或系统原始错误文本；这里负责把错误码翻成人话。
 * 认不出来的（系统直接抛的文本）原样透传——总比笼统写「启动失败」有用。
 */
export function describeLaunchError(error: string | null): string {
  if (!error) return '启动失败'
  switch (error) {
    case 'invalid-path':
      return '路径无效，或文件已不存在'
    case 'invalid-url':
      return '网址格式不正确'
    case 'unsupported-type':
      return '该类型不支持在组合中启动'
    case 'missing-target':
      return '找不到对应目标'
    default:
      return error
  }
}
