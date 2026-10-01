export interface UpdateInfo {
  available: boolean
  downloaded?: boolean
  version?: string
  downloadUrl?: string
  source?: 'gitee' | 'github'
  releaseNotes?: string
  error?: string
  /**
   * 当前运行的是**便携版**。
   *
   * 便携版不能自动更新：更新链路是把 NSIS 安装包交给助手进程执行，
   * 而便携版是"正在运行的那个 exe 自己"，装不了也自替换不了。
   * 界面据此改成"去发布页手动下载替换"，而不是给一个点了必然失败的按钮。
   */
  portable?: boolean
  /** 发布页地址（便携版手动下载用） */
  releaseUrl?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface InstallResult {
  success: boolean
  error?: string
}
