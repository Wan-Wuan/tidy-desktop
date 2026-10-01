import { useState, useEffect, useCallback, useRef } from 'react'
import type { UpdateProgress } from '../../../shared/electron.d'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'

interface UseUpdateReturn {
  state: UpdateState
  version?: string
  progress?: UpdateProgress
  error?: string
  releaseNotes?: string
  source?: 'gitee' | 'github'
  currentVersion: string
  /** 便携版：不能自动更新，界面要走「打开发布页手动下载」那条路 */
  portable: boolean
  /** 发布页地址（便携版用） */
  releaseUrl?: string

  checkForUpdate: () => Promise<void>
  startDownload: () => void
  confirmInstall: () => Promise<void>
  dismissUpdate: () => void
}

export function useUpdate(): UseUpdateReturn {
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState<string | undefined>()
  const [progress, setProgress] = useState<UpdateProgress | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>()
  const [source, setSource] = useState<'gitee' | 'github' | undefined>()
  const [currentVersion, setCurrentVersion] = useState('')
  const [portable, setPortable] = useState(false)
  const [releaseUrl, setReleaseUrl] = useState<string | undefined>()
  const mountedRef = useRef(true)

  // Load current version on mount
  useEffect(() => {
    window.electronAPI.getVersion().then(v => {
      if (mountedRef.current) setCurrentVersion(v)
    }).catch(() => {})
  }, [])

  // Auto-check for updates on mount
  useEffect(() => {
    checkForUpdateInternal()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Progress listener
  useEffect(() => {
    const unsub = window.electronAPI.onUpdateProgress((data) => {
      if (mountedRef.current) setProgress(data)
    })
    return unsub
  }, [])

  // startDownloadInternal must be declared before checkForUpdateInternal
  // because checkForUpdateInternal depends on it
  const startDownloadInternal = useCallback(async () => {
    if (mountedRef.current) {
      setState('downloading')
      setProgress(undefined)
      setError(undefined)
    }

    try {
      const result = await window.electronAPI.downloadUpdate()
      if (!mountedRef.current) return

      if (result.success && result.filePath) {
        setState('downloaded')
      } else {
        setState('idle')
        setError(result.error || '下载失败，请稍后重试。')
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('idle')
        setError(err?.message || '下载失败，请稍后重试。')
      }
    }
  }, [])

  const checkForUpdateInternal = useCallback(async () => {
    if (mountedRef.current) {
      setState('checking')
      setError(undefined)
    }
    try {
      const info = await window.electronAPI.checkForUpdate()
      if (!mountedRef.current) return

      setPortable(info.portable === true)
      setReleaseUrl(info.releaseUrl)
      if (info.available) {
        setVersion(info.version)
        setReleaseNotes(info.releaseNotes)
        setSource(info.source)
        setState(info.downloaded ? 'downloaded' : 'available')
      } else {
        setState('idle')
        if (info.error) setError(info.error)
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('idle')
        setError(err?.message || '检查更新失败，请稍后重试。')
      }
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    await checkForUpdateInternal()
  }, [checkForUpdateInternal])

  const startDownload = useCallback(async () => {
    await startDownloadInternal()
  }, [startDownloadInternal])

  const confirmInstall = useCallback(async () => {
    if (mountedRef.current) setState('installing')
    try {
      // 不传路径：主进程会回退到当前下载缓存里的更新包（getUpdateFilePath()）
      const success = await window.electronAPI.installUpdate()
      if (!success && mountedRef.current) {
        setState('downloaded')
        setError('安装失败，请稍后重试。')
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('downloaded')
        setError(err?.message || '安装失败，请稍后重试。')
      }
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    if (mountedRef.current) {
      setState('idle')
      setError(undefined)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  return {
    state,
    version,
    progress,
    error,
    releaseNotes,
    source,
    currentVersion,
    portable,
    releaseUrl,
    checkForUpdate,
    startDownload,
    confirmInstall,
    dismissUpdate
  }
}
