import React, { useState } from 'react'
import { Server, RefreshCw, Folder, File, ArrowUp, FolderOpen } from 'lucide-react'
import { FileManagerCM } from './ContextMenu/FileManager_CM'
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean; folderName: string }>({
    x: 0,
    y: 0,
    visible: false,
    folderName: ''
  })

  // Upload Refs & State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<boolean>(false)

  // Quick Mount Modal State
  const [showQuickMountModal, setShowQuickMountModal] = useState<boolean>(false)
  const [mountTargetFolder, setMountTargetFolder] = useState<string>('')
  const [mountLocalPath, setMountLocalPath] = useState<string>('')
  const [mounting, setMounting] = useState<boolean>(false)
  const [quickMountError, setQuickMountError] = useState<string>('')

  const handleBrowseLocalDir = async () => {
    try {
      const res = await fetch('/api/browse-directory')
      const data = await res.json()
      if (data.success && data.directory) {
        setMountLocalPath(data.directory)
      }
    } catch (err: any) {
      console.error('Failed to browse directory:', err)
    }
  }

  // Navigation helpers
  const enterDirectory = (folderName: string) => {
    const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(nextPath)
  }

  const navigateUp = () => {
    if (pathHistory.length > 0) {
      const prevPath = pathHistory[pathHistory.length - 1]
      setPathHistory(pathHistory.slice(0, -1))
      setCurrentPath(prevPath)
    } else if (currentPath) {
      const segments = currentPath.split('/')
      if (segments.length <= 1) {
        setCurrentPath('')
      } else {
        setCurrentPath(segments.slice(0, -1).join('/'))
      }
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    if (bytes < 0) return '-'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleContextMenu = (e: React.MouseEvent, file: RcloneFile) => {
    if (!file.IsDir) return
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
      folderName: file.Name
    })
  }

  const openQuickMountModal = (folderName: string) => {
    setMountTargetFolder(folderName)
    const separator = projectRoot.includes('\\') ? '\\' : '/'
    const folderPath = currentPath 
      ? `${currentPath.replace(/\//g, separator)}${separator}${folderName}` 
      : folderName
    const pathValue = `${projectRoot}${separator}mount${separator}${selectedRemote}${separator}${folderPath}`
    setMountLocalPath(pathValue)
    setQuickMountError('')
    setShowQuickMountModal(true)
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

  const triggerUploadPicker = (type: 'file' | 'folder') => {
    if (type === 'file') {
      fileInputRef.current?.click()
    } else {
      folderInputRef.current?.click()
    }
  }

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0 || !selectedRemote) return

    setUploading(true)
    const targetFolder = contextMenu.folderName
    const relativeTarget = currentPath ? `${currentPath}/${targetFolder}` : targetFolder

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const formData = new FormData()
        formData.append('file', file)
        
        // Construct the remote path including filename if it's a folder upload with structure
        const uploadPath = file.webkitRelativePath || file.name
        
        const res = await fetch(`/api/rclone/operations/uploadfile?fs=${selectedRemote}:&remote=${relativeTarget}/${uploadPath}`, {
          method: 'POST',
          body: formData
        })
        
        if (!res.ok) {
          throw new Error(`Failed to upload ${file.name}`)
        }
      }
      alert('Upload completed successfully')
      fetchFiles(selectedRemote, currentPath)
    } catch (err: any) {
      alert(`Upload error: ${err.message}`)
    } finally {
      setUploading(false)
      // Reset inputs
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (folderInputRef.current) folderInputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Hidden Upload Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleUploadFiles} 
        multiple 
      />
      <input 
        type="file" 
        ref={folderInputRef} 
        style={{ display: 'none' }} 
        onChange={handleUploadFiles} 
        {...({ webkitdirectory: "", directory: "" } as any)} 
      />

      {/* Space-Saving Horizontal Toolbar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
          {/* Remote Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0 12px', height: '38px', minWidth: '180px' }}>
            <Server size={14} color="var(--accent-cyan)" />
            <select
              value={selectedRemote}
              onChange={(e) => {
                setSelectedRemote(e.target.value)
                setCurrentPath('')
                setPathHistory([])
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '13px', width: '100%', cursor: 'pointer' }}
            >
              <option value="" style={{ backgroundColor: 'var(--bg-secondary)' }}>-- Select Remote --</option>
              {remotes.map(r => (
                <option key={r.name} value={r.name} style={{ backgroundColor: 'var(--bg-secondary)' }}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Navigation Controls */}
          <button 
            className="btn" 
            onClick={navigateUp} 
            disabled={!currentPath && pathHistory.length === 0} 
            style={{ padding: '8px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Go Up One Level"
          >
            <ArrowUp size={16} />
          </button>

          {/* Active Folder Path Display */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0 16px', height: '38px', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>Path:</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
              {selectedRemote ? `${selectedRemote}:/${currentPath}` : 'Select a storage account...'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn" 
            onClick={() => fetchFiles(selectedRemote, currentPath)} 
            disabled={!selectedRemote} 
            style={{ padding: '8px 16px', height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loadingFiles ? 'spin-anim' : ''} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {/* Full-width Wide File Browser List Table */}
      <div className="card" style={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <th style={{ padding: '16px 20px', width: '40px' }}></th>
                <th style={{ padding: '16px 20px' }}>Name</th>
                <th style={{ padding: '16px 20px', width: '120px' }}>Size</th>
                <th style={{ padding: '16px 20px', width: '200px' }}>Modified Time</th>
                <th style={{ padding: '16px 20px', width: '160px' }}>Mime Type</th>
              </tr>
            </thead>
            <tbody>
              {loadingFiles ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    <RefreshCw size={24} className="spin-anim" style={{ display: 'block', margin: '0 auto 12px', color: 'var(--accent-cyan)' }} />
                    <span>Loading directory contents...</span>
                  </td>
                </tr>
              ) : !selectedRemote ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Select a cloud remote storage account from the toolbar to browse files.
                  </td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    This folder is empty.
                  </td>
                </tr>
              ) : (
                files.map((file, idx) => (
                  <tr 
                    key={idx} 
                    className="file-table-row"
                    onClick={() => file.IsDir && enterDirectory(file.Name)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.03)', 
                      cursor: file.IsDir ? 'pointer' : 'default',
                      transition: 'background-color 0.15s ease'
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
                      {file.IsDir ? '-' : formatSize(file.Size)}
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {new Date(file.ModTime).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.IsDir ? 'Folder' : file.MimeType || 'Unknown'}
                    </td>
                  </tr>
                ))
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
        folderName={contextMenu.folderName}
        onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
        onMount={() => openQuickMountModal(contextMenu.folderName)}
        onUpload={triggerUploadPicker}
      />

      {/* Quick Mount Modal Overlay */}
      {showQuickMountModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Quick Mount Folder</h3>
            
            {!fuseSupported && (
              <div style={{ backgroundColor: 'rgba(255, 74, 74, 0.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
                <strong>FUSE Driver Missing:</strong> {fuseDetails || 'No FUSE support detected.'} Quick mount requires installing FUSE/WinFsp.
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Remote Folder Path</label>
              <input 
                type="text" 
                readOnly 
                className="input-field" 
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
                  onClick={handleBrowseLocalDir}
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
                type="button" 
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
    </div>
  )
}
