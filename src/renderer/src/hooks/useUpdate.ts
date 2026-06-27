import { useState, useEffect, useCallback, useRef } from 'react'
import type { UpdateInfo, UpdateProgress } from '../../../shared/electron.d'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing'

interface UseUpdateReturn {
  state: UpdateState
  version?: string
  progress?: UpdateProgress
  error?: string
  releaseNotes?: string
  currentVersion: string

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
  const [currentVersion, setCurrentVersion] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>()
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
  const startDownloadInternal = useCallback(async (url?: string) => {
    if (mountedRef.current) {
      setState('downloading')
      setProgress(undefined)
      setError(undefined)
    }

    try {
      const result = await window.electronAPI.downloadUpdate(url)
      if (!mountedRef.current) return

      if (result.success && result.filePath) {
        setState('downloaded')
      } else {
        setState('idle')
        setError(result.error || 'Download failed')
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('idle')
        setError(err.message)
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

      if (info.available) {
        setVersion(info.version)
        setDownloadUrl(info.downloadUrl)
        setReleaseNotes(info.releaseNotes)
        setState('available')
      } else {
        setState('idle')
        if (info.error) setError(info.error)
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState('idle')
        setError(err.message)
      }
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    await checkForUpdateInternal()
  }, [checkForUpdateInternal])

  const startDownload = useCallback(async () => {
    await startDownloadInternal(downloadUrl)
  }, [startDownloadInternal, downloadUrl])

  const confirmInstall = useCallback(async () => {
    if (mountedRef.current) setState('installing')
    try {
      await window.electronAPI.installUpdate('')
    } catch (err: any) {
      if (mountedRef.current) {
        setState('downloaded')
        setError(err.message)
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
    currentVersion,
    checkForUpdate,
    startDownload,
    confirmInstall,
    dismissUpdate
  }
}
