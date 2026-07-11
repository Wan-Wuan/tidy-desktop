export interface UpdateInfo {
  available: boolean
  downloaded?: boolean
  version?: string
  downloadUrl?: string
  source?: 'gitee' | 'github'
  releaseNotes?: string
  error?: string
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
