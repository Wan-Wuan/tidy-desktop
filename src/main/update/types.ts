export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'

export interface UpdateInfo {
  available: boolean
  version?: string
  downloadUrl?: string
  releaseNotes?: string
  error?: string
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface DownloadResult {
  success: boolean
  filePath?: string
  error?: string
}

export interface InstallResult {
  success: boolean
  error?: string
}

export interface UpdateStatus {
  state: UpdateState
  version?: string
  progress?: DownloadProgress
  error?: string
  releaseNotes?: string
}
