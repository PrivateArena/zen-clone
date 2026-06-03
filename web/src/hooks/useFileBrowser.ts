import { useState, useMemo, useEffect, useCallback } from 'react'
import type { Remote, RcloneFile } from '../types'

export interface BackgroundTask {
  id: string
  name: string
  op: 'copy' | 'cut' | 'delete' | 'mkdir'
  status: 'running' | 'completed' | 'failed'
  progress: number
  speed?: string
  eta?: string
  error?: string
  timestamp: Date
}

// --- Formatting helpers ---
const fmtSpeed = (bps: number): string => {
  if (bps <= 0) return ''
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let v = bps, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}
const fmtETA = (secs: number): string => {
  if (secs <= 0 || !isFinite(secs)) return ''
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

interface UseFileBrowserProps {
  remotes: Remote[]
  selectedRemote: string
  setSelectedRemote: (val: string) => void
  currentPath: string
  setCurrentPath: (val: string) => void
  files: RcloneFile[]
  loadingFiles: boolean
  fetchFiles: (remote: string, path: string) => Promise<void>
  pathHistory: string[]
  setPathHistory: (val: string[]) => void
  projectRoot: string
  fuseSupported: boolean
  fuseDetails: string
  onQuickMount: (fs: string, mountPoint: string) => Promise<void>
}

export const useFileBrowser = ({
  selectedRemote,
  currentPath,
  setCurrentPath,
  files,
  fetchFiles,
  pathHistory,
  setPathHistory,
  projectRoot,
  onQuickMount
}: UseFileBrowserProps) => {
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false
  })

  // Operation Loader States (used for inline single blocking actions e.g. rename, mkdir, etc.)
  const [operationLoading, setOperationLoading] = useState<boolean>(false)
  const [operationLabel, setOperationLabel] = useState<string>('Operation in progress...')

  // Background Tasks State
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([])
  const [showTasksPanel, setShowTasksPanel] = useState<boolean>(false)

  // File Manager Modals State
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false)
  const [deleteTargets, setDeleteTargets] = useState<RcloneFile[]>([])

  const [showRenameModal, setShowRenameModal] = useState<boolean>(false)
  const [renameNewName, setRenameNewName] = useState<string>('')

  const [showNewFolderModal, setShowNewFolderModal] = useState<boolean>(false)
  const [newFolderName, setNewFolderName] = useState<string>('')

  const [showPasteConfirm, setShowPasteConfirm] = useState<boolean>(false)

  // Selected item state for focus & keyboard shortcuts
  const [selectedFiles, setSelectedFiles] = useState<RcloneFile[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // Clipboard State
  const [clipboard, setClipboard] = useState<{
    op: 'copy' | 'cut'
    files: RcloneFile[]
    sourcePath: string
    sourceRemoteName: string
  } | null>(null)

  // Quick Mount Modal State
  const [showQuickMountModal, setShowQuickMountModal] = useState<boolean>(false)
  const [mountTargetFolder, setMountTargetFolder] = useState<string>('')
  const [mountLocalPath, setMountLocalPath] = useState<string>('')
  const [mounting, setMounting] = useState<boolean>(false)
  const [quickMountError, setQuickMountError] = useState<string>('')

  // Sync Modal State
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false)
  const [syncTargetFolder, setSyncTargetFolder] = useState<string>('')

  // Local Picker State
  const [showLocalPicker, setShowLocalPicker] = useState<boolean>(false)
  const [pickerMode, setPickerMode] = useState<'file' | 'folder' | 'both'>('folder')

  // Sort State
  const [sortCol, setSortCol] = useState<'name' | 'size' | 'modified' | 'type'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSortChange = (col: 'name' | 'size' | 'modified' | 'type') => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // Memoized and sorted file list: Folders first, then sorted by active column
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.IsDir && !b.IsDir) return -1
      if (!a.IsDir && b.IsDir) return 1
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortCol) {
        case 'size':     return ((a.Size || 0) - (b.Size || 0)) * dir
        case 'modified': return (new Date(a.ModTime).getTime() - new Date(b.ModTime).getTime()) * dir
        case 'type':     return (a.MimeType || '').localeCompare(b.MimeType || '') * dir
        default:         return a.Name.localeCompare(b.Name, undefined, { numeric: true, sensitivity: 'base' }) * dir
      }
    })
  }, [files, sortCol, sortDir])

  const onBrowseLocalDirectory = () => {
    setPickerMode('folder')
    setShowLocalPicker(true)
  }

  const triggerUploadPicker = (type: 'file' | 'folder') => {
    setPickerMode(type)
    setShowLocalPicker(true)
  }

  // Poll a rclone job/status + core/stats for real progress
  const pollJobProgress = (jobId: number, taskId: string) => {
    const iv = setInterval(async () => {
      try {
        const [sRes, stRes] = await Promise.all([
          fetch('/api/rclone/job/status', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobid: jobId })
          }),
          fetch('/api/rclone/core/stats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: `job/${jobId}` })
          })
        ])
        const statusData = await sRes.json()
        const statsData = stRes.ok ? await stRes.json() : null

        if (statsData) {
          const { bytes = 0, totalBytes = 0, speed = 0 } = statsData
          const pct = totalBytes > 0 ? Math.min(Math.round((bytes / totalBytes) * 100), 99) : undefined
          const speedStr = fmtSpeed(speed)
          const eta = totalBytes > 0 && speed > 0 ? fmtETA((totalBytes - bytes) / speed) : undefined
          setBackgroundTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, ...(pct !== undefined ? { progress: pct } : {}), speed: speedStr || undefined, eta } : t
          ))
        }

        if (statusData.finished) {
          clearInterval(iv)
          if (statusData.success !== false) {
            setBackgroundTasks(prev => prev.map(t =>
              t.id === taskId ? { ...t, status: 'completed', progress: 100, speed: undefined, eta: undefined } : t
            ))
            refreshCurrent()
          } else {
            setBackgroundTasks(prev => prev.map(t =>
              t.id === taskId ? { ...t, status: 'failed', error: statusData.error || 'Job failed' } : t
            ))
          }
        }
      } catch { clearInterval(iv) }
    }, 1000)
  }

  const startBackgroundTask = async (
    name: string,
    op: 'copy' | 'cut' | 'delete' | 'mkdir',
    taskFn: () => Promise<number | null | void>
  ) => {
    const taskId = Math.random().toString(36).substring(2, 9)
    setBackgroundTasks(prev => [{ id: taskId, name, op, status: 'running', progress: 5, timestamp: new Date() }, ...prev])
    setShowTasksPanel(true)

    // Fake pulse only until we get the first response
    const fakeIv = setInterval(() => {
      setBackgroundTasks(prev => prev.map(t =>
        t.id === taskId && t.status === 'running' ? { ...t, progress: Math.min(t.progress + 5, 30) } : t
      ))
    }, 600)

    try {
      const jobId = await taskFn()
      clearInterval(fakeIv)
      if (jobId) {
        // Real polling takes over
        pollJobProgress(jobId, taskId)
      } else {
        // Synchronous operation: mark done immediately
        setBackgroundTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'completed', progress: 100 } : t
        ))
        refreshCurrent()
      }
    } catch (err: any) {
      clearInterval(fakeIv)
      setBackgroundTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'failed', progress: 0, error: err.message || 'Unknown error' } : t
      ))
    }
  }

  const handleLocalSelect = async (path: string, isDir: boolean) => {
    if (showQuickMountModal) {
      // Logic for mount browse
      setMountLocalPath(path)
      return
    }

    // Logic for background upload
    const targetFolder = (selectedFiles.length === 1 && selectedFiles[0].IsDir) ? selectedFiles[0].Name : ''
    const relativeTarget = currentPath ? (targetFolder ? `${currentPath}/${targetFolder}` : currentPath) : targetFolder

    const taskName = `Upload ${isDir ? 'folder' : 'file'} "${path.split(/[\\/]/).pop()}"`

    startBackgroundTask(taskName, 'copy', async () => {
      if (isDir) {
        const res = await fetch(`/api/rclone/sync/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ srcFs: path, dstFs: `${selectedRemote}:${relativeTarget}` })
        })
        if (!res.ok) throw new Error('Failed to start folder sync job')
        const data = await res.json()
        return data.jobid as number | null
      } else {
        const separator = path.includes('\\') ? '\\' : '/'
        const parts = path.split(separator)
        const fileName = parts.pop() || ''
        const parentPath = parts.join(separator) || (separator === '/' ? '/' : parts[0])
        const res = await fetch(`/api/rclone/operations/copyfile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ srcFs: parentPath, srcRemote: fileName, dstFs: `${selectedRemote}:${relativeTarget}`, dstRemote: fileName })
        })
        if (!res.ok) throw new Error('Failed to start file copy job')
        return null
      }
    })
  }

  // Navigation helpers
  const enterDirectory = useCallback((folderName: string) => {
    const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(nextPath)
    setSelectedFiles([])
    setLastSelectedIndex(null)
  }, [currentPath, pathHistory, setPathHistory, setCurrentPath, setSelectedFiles, setLastSelectedIndex])

  const navigateUp = useCallback(() => {
    const history = [...pathHistory]
    const prevPath = history.pop() || ''
    setPathHistory(history)
    setCurrentPath(prevPath)
    setSelectedFiles([])
    setLastSelectedIndex(null)
  }, [pathHistory, setPathHistory, setCurrentPath, setSelectedFiles, setLastSelectedIndex])

  const refreshCurrent = useCallback(() => {
    if (selectedRemote) {
      fetchFiles(selectedRemote, currentPath)
    }
  }, [selectedRemote, currentPath, fetchFiles])

  const executeQuickMount = async () => {
    setMounting(true)
    setQuickMountError('')
    const targetFs = `${selectedRemote}:${currentPath ? currentPath + '/' : ''}${mountTargetFolder}`
    try {
      await onQuickMount(targetFs, mountLocalPath)
      setShowQuickMountModal(false)
    } catch (err: any) {
      setQuickMountError(err.message || 'Failed to mount virtual drive')
    } finally {
      setMounting(false)
    }
  }

  const handleRowClick = useCallback((e: React.MouseEvent, file: RcloneFile, index: number) => {
    e.stopPropagation()

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      // Toggle selection
      setSelectedFiles(prev => {
        const exists = prev.some(f => f.Name === file.Name)
        if (exists) {
          return prev.filter(f => f.Name !== file.Name)
        } else {
          return [...prev, file]
        }
      })
      setLastSelectedIndex(index)
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      e.preventDefault()
      // Select range
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const range = sortedFiles.slice(start, end + 1)
      setSelectedFiles(range)
    } else {
      // Normal click: exclusive select
      setSelectedFiles([file])
      setLastSelectedIndex(index)
    }
  }, [lastSelectedIndex, sortedFiles, setSelectedFiles, setLastSelectedIndex])

  const handleContextMenu = useCallback((e: React.MouseEvent, file: RcloneFile | null) => {
    e.preventDefault()
    e.stopPropagation()

    if (file) {
      const isAlreadySelected = selectedFiles.some(f => f.Name === file.Name)
      if (!isAlreadySelected) {
        setSelectedFiles([file])
        const index = sortedFiles.findIndex(f => f.Name === file.Name)
        setLastSelectedIndex(index !== -1 ? index : null)
      }
    } else {
      setSelectedFiles([])
      setLastSelectedIndex(null)
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true
    })
  }, [selectedFiles, sortedFiles, setSelectedFiles, setLastSelectedIndex, setContextMenu])

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    setSelectedFiles([])
    setLastSelectedIndex(null)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true
    })
  }, [setSelectedFiles, setLastSelectedIndex, setContextMenu])

  const handleRowDoubleClick = useCallback((file: RcloneFile) => {
    if (file.IsDir) enterDirectory(file.Name)
  }, [enterDirectory])

  // Clipboard actions
  const handleCopy = (files: RcloneFile[]) => {
    if (files.length === 0) return
    setClipboard({
      op: 'copy',
      files,
      sourcePath: currentPath,
      sourceRemoteName: selectedRemote
    })
  }

  const handleCut = (files: RcloneFile[]) => {
    if (files.length === 0) return
    setClipboard({
      op: 'cut',
      files,
      sourcePath: currentPath,
      sourceRemoteName: selectedRemote
    })
  }

  const handlePaste = () => {
    if (!clipboard) return

    // Check if source and destination paths are identical
    const isSamePath = clipboard.sourceRemoteName === selectedRemote && clipboard.sourcePath === currentPath
    if (isSamePath) {
      alert("Cannot paste items to the same location. Please navigate to a different directory first.")
      return
    }

    if (clipboard.op === 'cut') {
      setShowPasteConfirm(true)
    } else {
      executePaste()
    }
  }

  const executePaste = async () => {
    if (!clipboard) return
    const opType = clipboard.op
    const filesToPaste = clipboard.files
    const sourceRemoteName = clipboard.sourceRemoteName
    const sourcePath = clipboard.sourcePath

    const taskName = `${opType === 'cut' ? 'Move' : 'Copy'} ${filesToPaste.length} item(s) to ${selectedRemote}:${currentPath || '/'}`

    setShowPasteConfirm(false)

    startBackgroundTask(taskName, opType, async () => {
      let firstDirJobId: number | null = null
      const promises = filesToPaste.map(async (file) => {
        let res: Response
        if (file.IsDir) {
          const srcFs = `${sourceRemoteName}:${sourcePath ? sourcePath + '/' : ''}${file.Name}`
          const dstFs = `${selectedRemote}:${currentPath ? currentPath + '/' : ''}${file.Name}`
          res = await fetch(opType === 'cut' ? '/api/rclone/sync/move' : '/api/rclone/sync/copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ srcFs, dstFs })
          })
          if (!res.ok) throw new Error((await res.text()) || `Failed to paste "${file.Name}"`)
          if (!firstDirJobId) {
            const d = await res.clone().json()
            firstDirJobId = d.jobid || null
          }
        } else {
          res = await fetch(opType === 'cut' ? '/api/rclone/operations/movefile' : '/api/rclone/operations/copyfile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ srcFs: `${sourceRemoteName}:${sourcePath}`, srcRemote: file.Name, dstFs: `${selectedRemote}:${currentPath}`, dstRemote: file.Name })
          })
          if (!res.ok) throw new Error((await res.text()) || `Failed to paste "${file.Name}"`)
        }
      })

      await Promise.all(promises)
      if (opType === 'cut') setClipboard(null)
      return firstDirJobId
    })
  }

  const executeRename = async (newName: string) => {
    if (selectedFiles.length !== 1 || !newName.trim() || newName.trim() === selectedFiles[0].Name) {
      setShowRenameModal(false)
      return
    }
    const targetFile = selectedFiles[0]
    const targetNewName = newName.trim()
    setOperationLabel('Renaming...')
    setOperationLoading(true)
    try {
      let res: Response
      if (targetFile.IsDir) {
        const srcFs = `${selectedRemote}:${currentPath ? currentPath + '/' : ''}${targetFile.Name}`
        const dstFs = `${selectedRemote}:${currentPath ? currentPath + '/' : ''}${targetNewName}`
        res = await fetch(`/api/rclone/sync/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ srcFs, dstFs })
        })
      } else {
        res = await fetch(`/api/rclone/operations/movefile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            srcFs: `${selectedRemote}:${currentPath}`,
            srcRemote: targetFile.Name,
            dstFs: `${selectedRemote}:${currentPath}`,
            dstRemote: targetNewName
          })
        })
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to rename item')
      }

      setShowRenameModal(false)
      setSelectedFiles([])
      setLastSelectedIndex(null)
      refreshCurrent()
    } catch (err: any) {
      alert(`Rename failed: ${err.message}`)
    } finally {
      setOperationLoading(false)
    }
  }

  const executeDelete = async () => {
    if (deleteTargets.length === 0) return
    const targets = [...deleteTargets]
    setShowDeleteModal(false)
    setDeleteTargets([])
    setSelectedFiles([])
    setLastSelectedIndex(null)

    const taskName = `Delete ${targets.length} item(s)`

    startBackgroundTask(taskName, 'delete', async () => {
      const promises = targets.map(async (target) => {
        let res: Response
        if (target.IsDir) {
          res = await fetch(`/api/rclone/operations/purge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fs: `${selectedRemote}:${currentPath ? currentPath + '/' : ''}${target.Name}`
            })
          })
        } else {
          res = await fetch(`/api/rclone/operations/deletefile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              srcFs: `${selectedRemote}:${currentPath}`,
              srcRemote: target.Name
            })
          })
        }

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `Failed to delete "${target.Name}"`)
        }
      })

      await Promise.all(promises)
    })
  }

  const executeNewFolder = async (folderName: string) => {
    if (!folderName.trim()) return
    setOperationLabel('Creating folder...')
    setOperationLoading(true)
    try {
      const res = await fetch(`/api/rclone/operations/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fs: `${selectedRemote}:${currentPath}`,
          remote: folderName.trim()
        })
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to create folder')
      }

      setShowNewFolderModal(false)
      refreshCurrent()
    } catch (err: any) {
      alert(`Failed to create folder: ${err.message}`)
    } finally {
      setOperationLoading(false)
    }
  }

  const openQuickMountModal = (folderName: string) => {
    setMountTargetFolder(folderName)
    const separator = projectRoot.includes('\\') ? '\\' : '/'
    const pathValue = `${projectRoot}${separator}mount${separator}${selectedRemote}${separator}${currentPath ? currentPath + separator : ''}${folderName}`
    setMountLocalPath(pathValue)
    setQuickMountError('')
    setShowQuickMountModal(true)
  }

  // rc-serve file URL: proxied through /api/rclone/{remote}/{path}
  const getFileServingURL = (file: RcloneFile): string => {
    const filePath = currentPath ? `${currentPath}/${file.Name}` : file.Name
    return `/api/rclone/${selectedRemote}/${filePath}`
  }

  const handleOpen = () => {
    if (selectedFiles.length !== 1 || selectedFiles[0].IsDir) return
    window.open(getFileServingURL(selectedFiles[0]), '_blank')
  }

  const handleDownload = () => {
    if (selectedFiles.length !== 1 || selectedFiles[0].IsDir) return
    const url = getFileServingURL(selectedFiles[0])
    const a = document.createElement('a')
    a.href = url
    a.download = selectedFiles[0].Name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const openSyncModal = (folderName: string) => {
    setSyncTargetFolder(folderName)
    setShowSyncModal(true)
  }

  const executeSync = async (srcFs: string, dstFs: string) => {
    setShowSyncModal(false)
    const taskName = `Sync ${srcFs} → ${dstFs}`
    startBackgroundTask(taskName, 'copy', async () => {
      const res = await fetch('/api/rclone/sync/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcFs, dstFs })
      })
      if (!res.ok) throw new Error((await res.text()) || 'Sync failed')
      const data = await res.json()
      return data.jobid as number | null
    })
  }

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (!selectedRemote) return

      if (e.key === 'Escape') {
        setContextMenu(prev => ({ ...prev, visible: false }))
        setSelectedFiles([])
        setLastSelectedIndex(null)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFiles.length > 0) {
          e.preventDefault()
          setDeleteTargets(selectedFiles)
          setShowDeleteModal(true)
        }
        return
      }

      if (e.key === 'F2') {
        if (selectedFiles.length === 1) {
          e.preventDefault()
          setRenameNewName(selectedFiles[0].Name)
          setShowRenameModal(true)
        }
        return
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          setNewFolderName('')
          setShowNewFolderModal(true)
        }
        return
      }

      const isMod = e.ctrlKey || e.metaKey
      if (isMod) {
        if (e.key === 'c' || e.key === 'C') {
          if (selectedFiles.length > 0) {
            e.preventDefault()
            handleCopy(selectedFiles)
          }
        } else if (e.key === 'x' || e.key === 'X') {
          if (selectedFiles.length > 0) {
            e.preventDefault()
            handleCut(selectedFiles)
          }
        } else if (e.key === 'v' || e.key === 'V') {
          if (clipboard) {
            e.preventDefault()
            handlePaste()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedRemote, selectedFiles, clipboard])

  return {
    // State Variables
    contextMenu,
    setContextMenu,
    operationLoading,
    operationLabel,
    backgroundTasks,
    setBackgroundTasks,
    showTasksPanel,
    setShowTasksPanel,
    showDeleteModal,
    setShowDeleteModal,
    deleteTargets,
    setDeleteTargets,
    showRenameModal,
    setShowRenameModal,
    renameNewName,
    setRenameNewName,
    showNewFolderModal,
    setShowNewFolderModal,
    newFolderName,
    setNewFolderName,
    showPasteConfirm,
    setShowPasteConfirm,
    selectedFiles,
    setSelectedFiles,
    lastSelectedIndex,
    setLastSelectedIndex,
    clipboard,
    setClipboard,
    showQuickMountModal,
    setShowQuickMountModal,
    mountTargetFolder,
    setMountTargetFolder,
    mountLocalPath,
    setMountLocalPath,
    mounting,
    setMounting,
    quickMountError,
    setQuickMountError,
    showLocalPicker,
    setShowLocalPicker,
    pickerMode,
    setPickerMode,
    sortedFiles,
    sortCol,
    sortDir,
    handleSortChange,

    // Methods
    onBrowseLocalDirectory,
    triggerUploadPicker,
    startBackgroundTask,
    handleLocalSelect,
    enterDirectory,
    navigateUp,
    refreshCurrent,
    executeQuickMount,
    handleRowClick,
    handleRowDoubleClick,
    handleContextMenu,
    handleContainerContextMenu,
    handleCopy,
    handleCut,
    handlePaste,
    executePaste,
    executeRename,
    executeDelete,
    executeNewFolder,
    openQuickMountModal,
    handleOpen,
    handleDownload,
    showSyncModal,
    setShowSyncModal,
    syncTargetFolder,
    openSyncModal,
    executeSync
  }
}
