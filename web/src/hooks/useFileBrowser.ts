import { useState, useMemo, useEffect, useCallback } from 'react'
import type { Remote, RcloneFile } from '../types'

export interface BackgroundTask {
  id: string
  name: string
  op: 'copy' | 'cut' | 'delete' | 'mkdir'
  status: 'running' | 'completed' | 'failed'
  progress: number
  error?: string
  timestamp: Date
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

  // Local Picker State
  const [showLocalPicker, setShowLocalPicker] = useState<boolean>(false)
  const [pickerMode, setPickerMode] = useState<'file' | 'folder' | 'both'>('folder')

  // Memoized and sorted file list: Folders first, then files, both sorted by name
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      // 1. Folders first
      if (a.IsDir && !b.IsDir) return -1
      if (!a.IsDir && b.IsDir) return 1
      // 2. Alphabetical sort (natural sort)
      return a.Name.localeCompare(b.Name, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [files])

  const onBrowseLocalDirectory = () => {
    setPickerMode('folder')
    setShowLocalPicker(true)
  }

  const triggerUploadPicker = (type: 'file' | 'folder') => {
    setPickerMode(type)
    setShowLocalPicker(true)
  }

  const startBackgroundTask = async (
    name: string,
    op: 'copy' | 'cut' | 'delete' | 'mkdir',
    taskFn: () => Promise<void>
  ) => {
    const taskId = Math.random().toString(36).substring(2, 9)
    const newTask: BackgroundTask = {
      id: taskId,
      name,
      op,
      status: 'running',
      progress: 15,
      timestamp: new Date()
    }
    setBackgroundTasks(prev => [newTask, ...prev])
    setShowTasksPanel(true)

    const interval = setInterval(() => {
      setBackgroundTasks(prev => prev.map(t => {
        if (t.id === taskId && t.status === 'running') {
          return { ...t, progress: Math.min(t.progress + 15, 90) }
        }
        return t
      }))
    }, 800)

    try {
      await taskFn()
      clearInterval(interval)
      setBackgroundTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, status: 'completed', progress: 100 }
        }
        return t
      }))
      refreshCurrent()
    } catch (err: any) {
      clearInterval(interval)
      setBackgroundTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, status: 'failed', progress: 100, error: err.message || 'Unknown error' }
        }
        return t
      }))
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
        // Background Folder Sync/Copy
        const res = await fetch(`/api/rclone/sync/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            srcFs: path,
            dstFs: `${selectedRemote}:${relativeTarget}`
          })
        })
        if (!res.ok) throw new Error('Failed to start folder sync job')
      } else {
        // Background File Copy
        const separator = path.includes('\\') ? '\\' : '/'
        const parts = path.split(separator)
        const fileName = parts.pop() || ''
        const parentPath = parts.join(separator) || (separator === '/' ? '/' : parts[0])

        const res = await fetch(`/api/rclone/operations/copyfile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            srcFs: parentPath,
            srcRemote: fileName,
            dstFs: `${selectedRemote}:${relativeTarget}`,
            dstRemote: fileName
          })
        })
        if (!res.ok) throw new Error('Failed to start file copy job')
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
        } else {
          const srcFs = `${sourceRemoteName}:${sourcePath}`
          const srcRemote = file.Name
          const dstFs = `${selectedRemote}:${currentPath}`
          const dstRemote = file.Name

          res = await fetch(opType === 'cut' ? '/api/rclone/operations/movefile' : '/api/rclone/operations/copyfile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ srcFs, srcRemote, dstFs, dstRemote })
          })
        }

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `Failed to paste "${file.Name}"`)
        }
      })

      await Promise.all(promises)
      if (opType === 'cut') {
        setClipboard(null)
      }
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
    openQuickMountModal
  }
}
