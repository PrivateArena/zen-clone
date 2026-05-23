import React, { useState } from 'react'
import { Server, RefreshCw, Folder, File, ArrowUp, FolderOpen } from 'lucide-react'
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
  const [uploading, setUploading] = useState<boolean>(false)

  // Quick Mount Modal State
  const [showQuickMountModal, setShowQuickMountModal] = useState<boolean>(false)
  const [mountTargetFolder, setMountTargetFolder] = useState<string>('')
  const [mountLocalPath, setMountLocalPath] = useState<string>('')
  const [mounting, setMounting] = useState<boolean>(false)
  const [quickMountError, setQuickMountError] = useState<string>('')
  
  // Local Picker State
  const [showLocalPicker, setShowLocalPicker] = useState<boolean>(false)
  const [pickerMode, setPickerMode] = useState<'file' | 'folder' | 'both'>('folder')

  const onBrowseLocalDirectory = () => {
    setPickerMode('folder')
    setShowLocalPicker(true)
  }

  const triggerUploadPicker = (type: 'file' | 'folder') => {
    setPickerMode(type)
    setShowLocalPicker(true)
  }

  const handleLocalSelect = async (path: string, isDir: boolean) => {
    if (showQuickMountModal) {
      // Logic for mount browse
      setMountLocalPath(path)
      return
    }

    // Logic for background upload
    const targetFolder = contextMenu.folderName
    const relativeTarget = currentPath ? `${currentPath}/${targetFolder}` : targetFolder
    
    setUploading(true)
    try {
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
        alert(`Started background upload of folder "${path}" to "${relativeTarget}"`)
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
        alert(`Started background upload of file "${fileName}" to "${relativeTarget}"`)
      }
    } catch (err: any) {
      alert(`Job failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  // Navigation helpers
  const enterDirectory = (folderName: string) => {
    const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(nextPath)
  }

  const navigateUp = () => {
    const history = [...pathHistory]
    const prevPath = history.pop() || ''
    setPathHistory(history)
    setCurrentPath(prevPath)
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
    const pathValue = `${projectRoot}${separator}mount${separator}${selectedRemote}${separator}${currentPath ? currentPath + separator : ''}${folderName}`
    setMountLocalPath(pathValue)
    setQuickMountError('')
    setShowQuickMountModal(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Space-Saving Horizontal Toolbar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-start' }}>
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
        </div>
      </div>

      <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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

      {/* Uploading Overlay */}
      {uploading && (
        <div className="modal-overlay">
          <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
            <RefreshCw size={32} className="spin-anim" style={{ color: 'var(--accent-cyan)', marginBottom: '16px' }} />
            <div style={{ fontSize: '18px', fontWeight: 600 }}>Operation in progress...</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Please do not close the browser.</div>
          </div>
        </div>
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
