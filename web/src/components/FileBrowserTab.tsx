import React, { useState, useMemo, useEffect } from 'react'
import { Server, RefreshCw, Folder, File, ArrowUp, FolderOpen, FolderPlus, Clipboard, X, Check, AlertCircle } from 'lucide-react'
import { FileManagerCM } from './ContextMenu/FileManager_CM'
import { LocalFolderPicker } from './LocalFolderPicker'
import type { Remote, RcloneFile } from '../types'

interface FileBrowserTabProps {
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

export interface BackgroundTask {
  id: string
  name: string
  op: 'copy' | 'cut' | 'delete' | 'mkdir'
  status: 'running' | 'completed' | 'failed'
  progress: number
  error?: string
  timestamp: Date
}

export const FileBrowserTab: React.FC<FileBrowserTabProps> = ({
  remotes,
  selectedRemote,
  setSelectedRemote,
  currentPath,
  setCurrentPath,
  files,
  loadingFiles,
  fetchFiles,
  pathHistory,
  setPathHistory,
  projectRoot,
  fuseSupported,
  fuseDetails,
  onQuickMount
}) => {
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
  const enterDirectory = (folderName: string) => {
    const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(nextPath)
    setSelectedFiles([])
    setLastSelectedIndex(null)
  }

  const navigateUp = () => {
    const history = [...pathHistory]
    const prevPath = history.pop() || ''
    setPathHistory(history)
    setCurrentPath(prevPath)
    setSelectedFiles([])
    setLastSelectedIndex(null)
  }

  const refreshCurrent = () => {
    if (selectedRemote) {
      fetchFiles(selectedRemote, currentPath)
    }
  }

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

  const handleRowClick = (e: React.MouseEvent, file: RcloneFile, index: number) => {
    e.stopPropagation()
    
    if (e.ctrlKey || e.metaKey) {
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
  }

  const handleContextMenu = (e: React.MouseEvent, file: RcloneFile | null) => {
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
  }

  const handleContainerContextMenu = (e: React.MouseEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    setSelectedFiles([])
    setLastSelectedIndex(null)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true
    })
  }

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

  const openQuickMountModal = (folderName: string) => {
    setMountTargetFolder(folderName)
    const separator = projectRoot.includes('\\') ? '\\' : '/'
    const pathValue = `${projectRoot}${separator}mount${separator}${selectedRemote}${separator}${currentPath ? currentPath + separator : ''}${folderName}`
    setMountLocalPath(pathValue)
    setQuickMountError('')
    setShowQuickMountModal(true)
  }

  return (
    <div 
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}
      onClick={() => {
        setSelectedFiles([])
        setLastSelectedIndex(null)
      }}
    >
      {/* Space-Saving Horizontal Toolbar */}
      <div 
        className="card" 
        style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-start' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Remote Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0 12px', height: '38px', minWidth: '180px' }}>
          <Server size={14} color="var(--accent-cyan)" />
          <select
            className="input-field"
            value={selectedRemote}
            onChange={(e) => setSelectedRemote(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '0', width: '100%', fontSize: '13px' }}
          >
            <option value="">-- Select Remote --</option>
            {remotes.map(r => (
              <option key={r.name} value={r.name}>{r.name} ({r.type})</option>
            ))}
          </select>
        </div>

        {/* Path Display & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '0' }}>
          <button 
            className="btn" 
            onClick={navigateUp} 
            disabled={!currentPath}
            style={{ height: '38px', padding: '0 10px', opacity: !currentPath ? 0.3 : 1 }}
            title="Go Up"
          >
            <ArrowUp size={16} />
          </button>
          
          <div className="browser-path" style={{ height: '38px', margin: 0, display: 'flex', alignItems: 'center', flex: 1, minWidth: '0', overflow: 'hidden' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px', fontWeight: 600 }}>
              {selectedRemote ? `${selectedRemote}:${currentPath || '/'}` : 'Select a remote to browse...'}
            </span>
          </div>
          
          <button 
            className="btn" 
            onClick={refreshCurrent} 
            disabled={!selectedRemote || loadingFiles}
            style={{ height: '38px', padding: '0 10px' }}
            title="Refresh"
          >
            <RefreshCw size={16} className={loadingFiles ? 'spin-anim' : ''} />
          </button>

          {selectedRemote && (
            <>
              <button
                className="btn"
                onClick={() => {
                  setNewFolderName('')
                  setShowNewFolderModal(true)
                }}
                style={{ height: '38px', padding: '0 12px' }}
                title="Create New Folder (N)"
              >
                <FolderPlus size={15} color="var(--accent-cyan)" />
                <span style={{ fontSize: '13px' }}>New Folder</span>
              </button>

              {clipboard && (
                <button
                  className="btn"
                  onClick={handlePaste}
                  style={{ height: '38px', padding: '0 12px', borderColor: 'var(--accent-cyan)', backgroundColor: 'rgba(102, 252, 241, 0.05)' }}
                  title={`Paste (${clipboard.op === 'cut' ? 'Move' : 'Copy'} ${clipboard.files.length} items) (Ctrl+V)`}
                >
                  <Clipboard size={15} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '13px' }}>Paste</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {clipboard && (
        <div 
          style={{
            backgroundColor: 'rgba(102, 252, 241, 0.04)',
            border: '1px solid rgba(102, 252, 241, 0.2)',
            borderRadius: '8px',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clipboard size={14} color="var(--accent-cyan)" />
            <span>
              Ready to <strong>{clipboard.op === 'cut' ? 'move' : 'copy'}</strong> {clipboard.files.length} item(s) from <i>{clipboard.sourceRemoteName}:{clipboard.sourcePath || '/'}</i>. Go to target folder and press Paste or Ctrl+V.
            </span>
          </span>
          <button 
            onClick={() => setClipboard(null)} 
            style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      <div 
        className="card" 
        style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onContextMenu={(e) => handleContainerContextMenu(e)}
      >
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '14px 20px', width: '40px' }}></th>
                <th style={{ padding: '14px 20px' }}>Name</th>
                <th style={{ padding: '14px 20px', width: '100px' }}>Size</th>
                <th style={{ padding: '14px 20px', width: '200px' }}>Modified</th>
                <th style={{ padding: '14px 20px', width: '120px' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {loadingFiles ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px', textAlign: 'center' }}>
                    <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--accent-cyan)' }} />
                    <div style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading files...</div>
                  </td>
                </tr>
              ) : !selectedRemote ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Select a cloud remote storage account from the toolbar to browse files.
                  </td>
                </tr>
              ) : sortedFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    This folder is empty.
                  </td>
                </tr>
              ) : (
                sortedFiles.map((file, idx) => {
                  const isSelected = selectedFiles.some(f => f.Name === file.Name)
                  const isCutSource = clipboard && clipboard.op === 'cut' && clipboard.sourceRemoteName === selectedRemote && clipboard.sourcePath === currentPath && clipboard.files.some(f => f.Name === file.Name)

                  return (
                    <tr
                      key={idx}
                      className={`file-table-row ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => handleRowClick(e, file, idx)}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        if (file.IsDir) enterDirectory(file.Name)
                      }}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                        backgroundColor: isSelected ? 'rgba(102, 252, 241, 0.08)' : 'transparent',
                        opacity: isCutSource ? 0.5 : 1,
                        borderLeft: isSelected ? '3px solid var(--accent-cyan)' : '3px solid transparent'
                      }}
                    >
                      <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {file.IsDir ? <Folder size={16} color="var(--accent-cyan)" /> : <File size={16} color="var(--text-secondary)" />}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: file.IsDir ? 600 : 'normal', color: 'var(--text-primary)' }}>
                        <span style={{ display: 'inline-block', maxWidth: '50vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.Name}>
                          {file.Name}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
                        {file.IsDir ? '-' : (file.Size === 0 ? '0 Bytes' : (file.Size < 0 ? '-' : (() => {
                          const k = 1024
                          const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
                          const i = Math.floor(Math.log(file.Size) / Math.log(k))
                          return parseFloat((file.Size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
                        })()))}
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {new Date(file.ModTime).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.IsDir ? 'Folder' : file.MimeType || 'Unknown'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Context Menu Component */}
      <FileManagerCM
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        selectedFiles={selectedFiles}
        hasClipboard={!!clipboard}
        onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
        onCopy={() => handleCopy(selectedFiles)}
        onCut={() => handleCut(selectedFiles)}
        onPaste={handlePaste}
        onRename={() => {
          if (selectedFiles.length === 1) {
            setRenameNewName(selectedFiles[0].Name)
            setShowRenameModal(true)
          }
        }}
        onDelete={() => {
          if (selectedFiles.length > 0) {
            setDeleteTargets(selectedFiles)
            setShowDeleteModal(true)
          }
        }}
        onNewFolder={() => {
          setNewFolderName('')
          setShowNewFolderModal(true)
        }}
        onMount={() => selectedFiles.length === 1 && openQuickMountModal(selectedFiles[0].Name)}
        onUpload={triggerUploadPicker}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTargets.length > 0 && (
        <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Confirm Delete</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
              Are you sure you want to permanently delete the{' '}
              {deleteTargets.length === 1 
                ? `${deleteTargets[0].IsDir ? 'folder' : 'file'} "${deleteTargets[0].Name}"` 
                : `${deleteTargets.length} selected items`
              }? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowDeleteModal(false); setDeleteTargets([]); }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={executeDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Rename Item</h3>
            <div className="form-group">
              <label className="form-label">New Name</label>
              <input
                type="text"
                className="input-field"
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') executeRename(renameNewName)
                  if (e.key === 'Escape') setShowRenameModal(false)
                }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowRenameModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => executeRename(renameNewName)} disabled={!renameNewName.trim()}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Create New Folder</h3>
            <div className="form-group">
              <label className="form-label">Folder Name</label>
              <input
                type="text"
                className="input-field"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Documents"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') executeNewFolder(newFolderName)
                  if (e.key === 'Escape') setShowNewFolderModal(false)
                }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowNewFolderModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => executeNewFolder(newFolderName)} disabled={!newFolderName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste / Move Confirmation Modal */}
      {showPasteConfirm && clipboard && (
        <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Confirm Move</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
              Are you sure you want to move {clipboard.files.length} item(s) from{' '}
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{clipboard.sourceRemoteName}:{clipboard.sourcePath || '/'}</span>{' '}
              to{' '}
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{selectedRemote}:{currentPath || '/'}</span>?
            </p>
            <div style={{ backgroundColor: 'rgba(255, 183, 3, 0.1)', border: '1px solid var(--warning)', color: 'var(--warning)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '12.5px' }}>
              <strong>Notice:</strong> This is a destructive move operation. The original files at the source will be deleted after being copied.
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowPasteConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={executePaste}>
                Confirm Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Mount Modal Overlay */}
      {showQuickMountModal && (
        <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Quick Mount Folder</h3>

            {!fuseSupported && (
              <div style={{ backgroundColor: 'rgba(255, 74, 74, 0.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
                <strong>FUSE Driver Missing:</strong> {fuseDetails || 'No FUSE support detected.'} Quick mount requires installing FUSE/WinFsp.
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Cloud Target</label>
              <input
                type="text"
                className="input-field"
                readOnly
                value={`${selectedRemote}:${currentPath ? currentPath + '/' : ''}${mountTargetFolder}`}
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Local Mount Point</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="input-field"
                  value={mountLocalPath}
                  onChange={(e) => setMountLocalPath(e.target.value)}
                  required
                  disabled={mounting}
                  placeholder="e.g. C:\mount\drive"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={onBrowseLocalDirectory}
                  disabled={mounting}
                  style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Browse Local Directory"
                >
                  <FolderOpen size={14} />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            {quickMountError && (
              <div style={{ color: 'var(--error)', fontSize: '12px', marginBottom: '12px' }}>
                {quickMountError}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setShowQuickMountModal(false)}
                disabled={mounting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={executeQuickMount}
                disabled={mounting || !fuseSupported || !mountLocalPath}
              >
                {mounting ? 'Mounting...' : 'Mount'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operation Loader Overlay */}
      {operationLoading && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="card" style={{ padding: '32px', textAlign: 'center', minWidth: '300px' }}>
            <RefreshCw size={32} className="spin-anim" style={{ color: 'var(--accent-cyan)', marginBottom: '16px' }} />
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{operationLabel}</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Please do not close the browser.</div>
          </div>
        </div>
      )}

      {/* Background Tasks Floating Panel */}
      {showTasksPanel && backgroundTasks.length > 0 && (
        <div 
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '360px',
            maxHeight: '400px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 99999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div 
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clipboard size={14} color="var(--accent-cyan)" />
              File Operations
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={() => setBackgroundTasks([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear All"
              >
                Clear
              </button>
              <button 
                onClick={() => setShowTasksPanel(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List of Tasks */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
            {backgroundTasks.map((t) => (
              <div 
                key={t.id} 
                style={{ 
                  padding: '10px 16px', 
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span 
                    style={{ 
                      fontWeight: 500, 
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '220px'
                    }}
                    title={t.name}
                  >
                    {t.name}
                  </span>
                  
                  {t.status === 'running' && (
                    <RefreshCw size={12} className="spin-anim" color="var(--accent-cyan)" />
                  )}
                  {t.status === 'completed' && (
                    <Check size={12} color="#10B981" />
                  )}
                  {t.status === 'failed' && (
                    <span title={t.error}>
                      <AlertCircle size={12} color="var(--error)" />
                    </span>
                  )}
                </div>

                {/* Progress Bar or Error */}
                {t.status === 'running' && (
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                    <div style={{ width: `${t.progress}%`, height: '100%', backgroundColor: 'var(--accent-cyan)', transition: 'width 0.3s ease' }} />
                  </div>
                )}
                {t.status === 'failed' && t.error && (
                  <div style={{ color: 'var(--error)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {t.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating status badge when tasks panel is closed */}
      {!showTasksPanel && backgroundTasks.some(t => t.status === 'running') && (
        <button
          onClick={() => setShowTasksPanel(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '10px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            color: 'var(--accent-cyan)',
            fontWeight: 600,
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            zIndex: 99999
          }}
          onClickCapture={(e) => e.stopPropagation()}
        >
          <RefreshCw size={12} className="spin-anim" />
          <span>Active Tasks ({backgroundTasks.filter(t => t.status === 'running').length})</span>
        </button>
      )}

      <LocalFolderPicker 
        visible={showLocalPicker}
        onClose={() => setShowLocalPicker(false)}
        onSelect={handleLocalSelect}
        selectionMode={pickerMode}
        title={pickerMode === 'file' ? 'Select Local File to Upload' : (pickerMode === 'folder' ? 'Select Local Folder to Upload' : 'Select Local Item')}
      />
    </div>
  )
}
