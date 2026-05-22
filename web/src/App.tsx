import React, { useState, useEffect } from 'react'
import {
  Server,
  HardDrive,
  FolderOpen,
  Plus,
  Trash2,
  Folder,
  File,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'

// Types
interface Remote {
  name: string
  type: string
  details: Record<string, string>
}

interface Mount {
  fs: string
  mountPoint: string
  mountedOn: string
}

interface RcloneFile {
  Name: string
  Size: number
  IsDir: boolean
  MimeType: string
  ModTime: string
}

function App() {
  const [activeTab, setActiveTab] = useState<'remotes' | 'mounts' | 'browser'>('remotes')
  const [daemonRunning, setDaemonRunning] = useState<boolean>(false)
  const [fuseSupported, setFuseSupported] = useState<boolean>(false)
  const [fuseDetails, setFuseDetails] = useState<string>('')
  const [binExists, setBinExists] = useState<boolean>(true)
  const [portableBin, setPortableBin] = useState<string>('')
  const [portableConfig, setPortableConfig] = useState<string>('')
  const [downloadingRclone, setDownloadingRclone] = useState<boolean>(false)
  
  // Remotes State
  const [remotes, setRemotes] = useState<Remote[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newRemoteName, setNewRemoteName] = useState('')
  const [newRemoteType, setNewRemoteType] = useState('drive')
  const [newRemoteParams, setNewRemoteParams] = useState<Record<string, string>>({})
  const [isSubmittingRemote, setIsSubmittingRemote] = useState<boolean>(false)
  const [detectedOAuthURL, setDetectedOAuthURL] = useState<string>('')
  
  // Mounts State
  const [mounts, setMounts] = useState<Mount[]>([])
  const [mountRemote, setMountRemote] = useState('')
  const [mountPath, setMountPath] = useState('')
  const [mountPoint, setMountPoint] = useState('')

  // Browser State
  const [selectedRemote, setSelectedRemote] = useState<string>('')
  const [currentPath, setCurrentPath] = useState<string>('')
  const [files, setFiles] = useState<RcloneFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [pathHistory, setPathHistory] = useState<string[]>([])

  // Global Notification
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [successMsg, setSuccessMsg] = useState<string>('')

  // Fetch status of Go backend + rclone daemon on load
  const checkStatus = async () => {
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      setDaemonRunning(data.running)
      setBinExists(data.bin_exists)
      setPortableBin(data.portable_bin)
      setPortableConfig(data.portable_config)

      const fuseRes = await fetch('/api/fuse-check')
      const fuseData = await fuseRes.json()
      setFuseSupported(fuseData.supported)
      setFuseDetails(fuseData.details)
    } catch (e) {
      setDaemonRunning(false)
      setErrorMsg('Cannot connect to Go backend server. Make sure it is running.')
    }
  }

  const handleDownloadRclone = async () => {
    setDownloadingRclone(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await fetch('/api/rclone-download', { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to download rclone')
      }
      const data = await res.json()
      setSuccessMsg(data.message)
      checkStatus()
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setDownloadingRclone(false)
    }
  }

  // Load remotes
  const fetchRemotes = async () => {
    if (!daemonRunning) return
    try {
      const res = await fetch('/api/rclone/config/dump', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to query rclone configuration')
      const data = await res.json()
      const list: Remote[] = Object.keys(data).map(name => ({
        name,
        type: data[name].type || 'unknown',
        details: data[name]
      }))
      setRemotes(list)
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Load mounts
  const fetchMounts = async () => {
    if (!daemonRunning) return
    try {
      const res = await fetch('/api/rclone/mount/listmounts', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to query active mounts')
      const data = await res.json()
      // Rclone returns list of mountpoints or mount objects
      const list: Mount[] = (data.mountPoints || []).map((mp: any) => {
        if (typeof mp === 'string') {
          return { fs: 'Unknown', mountPoint: mp, mountedOn: mp }
        }
        return { fs: mp.Fs || 'Unknown', mountPoint: mp.MountPoint, mountedOn: mp.MountedOn }
      })
      setMounts(list)
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Load Files for File Browser
  const fetchFiles = async (remote: string, path: string) => {
    if (!remote) return
    setLoadingFiles(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/rclone/operations/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fs: `${remote}:`, remote: path })
      })
      if (!res.ok) throw new Error('Failed to load remote directory listing')
      const data = await res.json()
      setFiles(data.list || [])
    } catch (e: any) {
      setErrorMsg(e.message)
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }

  useEffect(() => {
    checkStatus()
    const timer = setInterval(checkStatus, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (daemonRunning) {
      fetchRemotes()
      fetchMounts()
    }
  }, [daemonRunning])

  useEffect(() => {
    if (selectedRemote) {
      fetchFiles(selectedRemote, currentPath)
    }
  }, [selectedRemote, currentPath])

  // Handle adding new remote
  const handleAddRemote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRemoteName) return
    setIsSubmittingRemote(true)
    setDetectedOAuthURL('')
    setErrorMsg('')

    // Start polling for OAuth URL
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/oauth-url')
        if (res.ok) {
          const data = await res.json()
          if (data.url) {
            setDetectedOAuthURL(data.url)
          }
        }
      } catch (err) {
        console.error('Failed to poll oauth url:', err)
      }
    }, 1000)

    try {
      // Clear any previous oauth urls on the backend first
      await fetch('/api/oauth-url', { method: 'DELETE' })

      const res = await fetch('/api/rclone/config/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRemoteName,
          type: newRemoteType,
          parameters: newRemoteParams
        })
      })
      clearInterval(pollInterval)
      if (!res.ok) throw new Error('Failed to create remote connection')
      setSuccessMsg(`Remote "${newRemoteName}" created successfully.`)
      setShowAddModal(false)
      setNewRemoteName('')
      setNewRemoteParams({})
      setDetectedOAuthURL('')
      fetchRemotes()
    } catch (e: any) {
      clearInterval(pollInterval)
      setErrorMsg(e.message)
    } finally {
      setIsSubmittingRemote(false)
    }
  }

  // Handle deleting a remote
  const handleDeleteRemote = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete remote "${name}"?`)) return
    try {
      const res = await fetch('/api/rclone/config/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!res.ok) throw new Error('Failed to delete remote configuration')
      setSuccessMsg(`Remote "${name}" deleted.`)
      fetchRemotes()
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Handle mounting a remote
  const handleMount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mountRemote || !mountPoint) return
    try {
      const res = await fetch('/api/rclone/mount/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fs: `${mountRemote}:${mountPath}`,
          mountPoint: mountPoint,
          mountType: 'mount' // Default to FUSE mount
        })
      })
      if (!res.ok) throw new Error('Failed to mount remote filesystem. Make sure folder is empty and FUSE is running.')
      setSuccessMsg(`Mounted ${mountRemote}:${mountPath} at ${mountPoint}`)
      setMountPoint('')
      setMountPath('')
      fetchMounts()
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Handle unmounting
  const handleUnmount = async (mountPoint: string) => {
    try {
      const res = await fetch('/api/rclone/mount/unmount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountPoint })
      })
      if (!res.ok) throw new Error('Failed to unmount filesystem')
      setSuccessMsg(`Unmounted ${mountPoint}`)
      fetchMounts()
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Navigation helpers for file browser
  const enterDirectory = (dirName: string) => {
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(currentPath ? `${currentPath}/${dirName}` : dirName)
  }

  const navigateUp = () => {
    if (pathHistory.length === 0) {
      if (currentPath) {
        setCurrentPath('')
      }
      return
    }
    const prev = pathHistory[pathHistory.length - 1]
    setPathHistory(pathHistory.slice(0, -1))
    setCurrentPath(prev)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    if (bytes < 0) return '-' // Directories typically have size -1 in rclone
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <HardDrive className="brand-logo" size={28} color="#66fcf1" />
          <span className="brand-title">ZEN-CLONE</span>
        </div>
        
        <nav className="nav-links">
          <div 
            className={`nav-item ${activeTab === 'remotes' ? 'active' : ''}`}
            onClick={() => setActiveTab('remotes')}
          >
            <Server size={18} />
            <span>Remotes & Config</span>
          </div>
          
          <div 
            className={`nav-item ${activeTab === 'mounts' ? 'active' : ''}`}
            onClick={() => setActiveTab('mounts')}
          >
            <HardDrive size={18} />
            <span>Active Mounts</span>
          </div>
          
          <div 
            className={`nav-item ${activeTab === 'browser' ? 'active' : ''}`}
            onClick={() => setActiveTab('browser')}
          >
            <FolderOpen size={18} />
            <span>File Browser</span>
          </div>
        </nav>

        <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={12} color="var(--accent-cyan)" />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>PORTABLE SUITE</span>
            </div>
            {portableBin && (
              <div>
                <strong>Bin:</strong> {portableBin}
              </div>
            )}
            {portableConfig && (
              <div>
                <strong>Config:</strong> {portableConfig}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="workspace">
        {/* Header Status Bar */}
        <header className="header">
          <div className="header-title">
            {activeTab === 'remotes' && 'Rclone Remotes & Storage Configuration'}
            {activeTab === 'mounts' && 'Virtual Drive Mount Manager'}
            {activeTab === 'browser' && 'Multi-Cloud File Browser'}
          </div>

          <div className="status-badges">
            <div className={`badge ${daemonRunning ? 'active' : 'inactive'}`}>
              {daemonRunning ? <CheckCircle size={14} /> : <XCircle size={14} />}
              <span>Rclone Daemon: {daemonRunning ? 'Running' : 'Stopped'}</span>
            </div>

            <div className={`badge ${fuseSupported ? 'active' : 'inactive'}`}>
              {fuseSupported ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              <span>FUSE Mounts: {fuseSupported ? 'Supported' : 'Not Loaded'}</span>
            </div>

            <button onClick={checkStatus} className="btn" style={{ padding: '6px 12px' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {/* Dynamic content view */}
        <div className="content-view">
          {/* Portable Rclone auto-install notification */}
          {!binExists && (
            <div style={{ backgroundColor: 'rgba(255, 183, 3, 0.1)', border: '1px solid var(--warning)', color: 'var(--warning)', padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '15px', marginBottom: '4px' }}>Portable Rclone Missing</strong>
                <span style={{ fontSize: '13px' }}>The system could not locate a local rclone installation. Click below to install it locally in portable mode.</span>
              </div>
              <button 
                className="btn btn-primary" 
                onClick={handleDownloadRclone} 
                disabled={downloadingRclone}
                style={{ whiteSpace: 'nowrap' }}
              >
                {downloadingRclone ? (
                  <>
                    <RefreshCw className="spin-anim" size={14} />
                    <span>Installing...</span>
                  </>
                ) : (
                  <span>Download & Install</span>
                )}
              </button>
            </div>
          )}

          {/* Notification Messages */}
          {errorMsg && (
            <div style={{ backgroundColor: 'rgba(255, 74, 74, 0.15)', border: '1px solid var(--error)', color: varColor('--error'), padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
            </div>
          )}
          {successMsg && (
            <div style={{ backgroundColor: 'rgba(46, 196, 182, 0.15)', border: '1px solid var(--success)', color: varColor('--success'), padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{successMsg}</span>
              <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
            </div>
          )}

          {/* TAB 1: Remotes Manager */}
          {activeTab === 'remotes' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>Configured Accounts</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>Securely manage your GDrive, OneDrive, Dropbox, SFTP connections.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                  <Plus size={16} />
                  <span>Add Remote Storage</span>
                </button>
              </div>

              <div className="card-grid">
                {remotes.length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                    No cloud storage remotes configured. Click "Add Remote Storage" to add one.
                  </div>
                ) : (
                  remotes.map(remote => (
                    <div className="card" key={remote.name}>
                      <div className="card-header">
                        <h4 className="card-title">{remote.name}</h4>
                        <span className="card-type">{remote.type}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', fontFamily: 'var(--mono)' }}>
                        {Object.keys(remote.details)
                          .filter(k => k !== 'type' && k !== 'password' && k !== 'token')
                          .map(k => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                              <span>{k}:</span>
                              <span style={{ color: 'var(--text-primary)' }}>{String(remote.details[k])}</span>
                            </div>
                          ))}
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                          className="btn" 
                          style={{ flexGrow: 1 }}
                          onClick={() => {
                            setSelectedRemote(remote.name)
                            setCurrentPath('')
                            setActiveTab('browser')
                          }}
                        >
                          <FolderOpen size={14} />
                          <span>Browse</span>
                        </button>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '10px' }}
                          onClick={() => handleDeleteRemote(remote.name)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Mounts Manager */}
          {activeTab === 'mounts' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px' }}>
                {/* Active Mounts List */}
                <div>
                  <h3 style={{ margin: '0 0 16px' }}>Active Virtual Mounts</h3>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '14px' }}>
                      <span>Source Remote</span>
                      <span>Mount Point</span>
                      <span style={{ textAlign: 'right' }}>Actions</span>
                    </div>

                    {mounts.length === 0 ? (
                      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No active virtual drive mounts running.
                      </div>
                    ) : (
                      mounts.map((mount, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px', padding: '16px', borderBottom: idx < mounts.length - 1 ? '1px solid var(--border-color)' : 'none', alignItems: 'center', fontSize: '14px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{mount.fs}</span>
                          <span style={{ fontFamily: 'var(--mono)' }}>{mount.mountPoint}</span>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleUnmount(mount.mountPoint)}>
                              Unmount
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Mount Form */}
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '12px' }}>
                  <h4 style={{ margin: '0 0 16px' }}>Mount Virtual Drive</h4>
                  
                  {!fuseSupported && (
                    <div style={{ backgroundColor: 'rgba(255, 183, 3, 0.1)', border: '1px solid var(--warning)', color: 'var(--warning)', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                      <strong>Warning:</strong> FUSE driver is not loaded. Virtual mounting may fail. ({fuseDetails})
                    </div>
                  )}

                  <form onSubmit={handleMount}>
                    <div className="form-group">
                      <label className="form-label">Select Remote</label>
                      <select 
                        className="input-field" 
                        value={mountRemote} 
                        onChange={(e) => setMountRemote(e.target.value)}
                        required
                      >
                        <option value="">-- Choose Remote --</option>
                        {remotes.map(r => (
                          <option key={r.name} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Remote Sub-Path (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Backups/Documents" 
                        className="input-field"
                        value={mountPath}
                        onChange={(e) => setMountPath(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Local Mount Point Path</label>
                      <input 
                        type="text" 
                        placeholder="e.g. /home/user/virtual_drive" 
                        className="input-field"
                        value={mountPoint}
                        onChange={(e) => setMountPoint(e.target.value)}
                        required
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} disabled={!mountRemote}>
                      Mount Drive
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: File Browser */}
          {activeTab === 'browser' && (
            <div className="file-browser">
              {/* Sidebar: Remote list */}
              <div className="browser-sidebar">
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Storage Accounts</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {remotes.map(r => (
                    <div 
                      key={r.name} 
                      className={`nav-item ${selectedRemote === r.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedRemote(r.name)
                        setCurrentPath('')
                        setPathHistory([])
                      }}
                      style={{ padding: '8px 12px', fontSize: '14px' }}
                    >
                      <Server size={14} />
                      <span>{r.name}</span>
                    </div>
                  ))}
                  {remotes.length === 0 && (
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No remotes configured.</span>
                  )}
                </div>
              </div>

              {/* Main Directory panel */}
              <div className="browser-main">
                {/* Header path details */}
                <div className="browser-header">
                  <button className="btn" onClick={navigateUp} disabled={!currentPath && pathHistory.length === 0} style={{ padding: '8px' }}>
                    <ArrowLeft size={16} />
                  </button>

                  <div className="browser-path">
                    {selectedRemote ? `${selectedRemote}:/${currentPath}` : 'Select a storage account...'}
                  </div>

                  <button className="btn" onClick={() => fetchFiles(selectedRemote, currentPath)} disabled={!selectedRemote} style={{ padding: '8px' }}>
                    <RefreshCw size={16} className={loadingFiles ? 'spin-anim' : ''} />
                  </button>
                </div>

                {/* File list view */}
                <div className="file-list">
                  <div className="file-row header-row">
                    <div></div>
                    <span>Name</span>
                    <span>Size</span>
                    <span>Modified Time</span>
                    <span>MimeType</span>
                  </div>

                  {loadingFiles ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Loading directory contents...
                    </div>
                  ) : !selectedRemote ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Select a cloud remote storage account from the left panel to browse files.
                    </div>
                  ) : files.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      This folder is empty.
                    </div>
                  ) : (
                    files.map((file, idx) => (
                      <div 
                        key={idx} 
                        className="file-row"
                        onClick={() => file.IsDir && enterDirectory(file.Name)}
                      >
                        {file.IsDir ? <Folder size={14} color="#66fcf1" /> : <File size={14} color="#a0aec0" />}
                        <span className="file-name" style={{ fontWeight: file.IsDir ? 600 : 'normal' }}>{file.Name}</span>
                        <span>{file.IsDir ? '-' : formatSize(file.Size)}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {new Date(file.ModTime).toLocaleString()}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.IsDir ? 'Directory' : file.MimeType || 'Unknown'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Remote Modal overlay */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ margin: '0 0 16px' }}>Add Storage Remote</h3>
            <form onSubmit={handleAddRemote}>
              <div className="form-group">
                <label className="form-label">Remote Name (No spaces)</label>
                <input 
                  type="text" 
                  placeholder="e.g. MyGoogleDrive" 
                  className="input-field"
                  value={newRemoteName}
                  onChange={(e) => setNewRemoteName(e.target.value.replace(/\s+/g, ''))}
                  required
                  disabled={isSubmittingRemote}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Storage Type</label>
                <select 
                  className="input-field"
                  value={newRemoteType}
                  onChange={(e) => setNewRemoteType(e.target.value)}
                  disabled={isSubmittingRemote}
                >
                  <option value="drive">Google Drive</option>
                  <option value="onedrive">Microsoft OneDrive</option>
                  <option value="dropbox">Dropbox</option>
                  <option value="s3">Amazon S3</option>
                  <option value="sftp">SFTP Connection</option>
                </select>
              </div>

              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>Note:</span> Authentication prompts for cloud accounts will be piped securely through the Go backend session proxy. Keep your browser open to complete OAuth flows if prompted.
              </div>

              {isSubmittingRemote && (
                <div style={{ backgroundColor: 'rgba(102, 252, 241, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid var(--accent-cyan)', marginBottom: '16px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <RefreshCw className="spin-anim" size={14} color="var(--accent-cyan)" />
                    <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>Creating remote config...</span>
                  </div>
                  {detectedOAuthURL ? (
                    <div>
                      <span style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
                        Authorization link captured! Copy this link to authorize inside your specific Firefox container:
                      </span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          readOnly 
                          value={detectedOAuthURL} 
                          style={{ flex: 1, padding: '6px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', color: 'var(--accent-cyan)' }} 
                        />
                        <button 
                          type="button" 
                          className="btn btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => {
                            navigator.clipboard.writeText(detectedOAuthURL)
                            alert('OAuth URL copied to clipboard!')
                          }}
                        >
                          Copy Link
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Waiting for Rclone to generate OAuth authentication link (if required for this storage type)...
                    </span>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowAddModal(false)} disabled={isSubmittingRemote}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingRemote}>
                  {isSubmittingRemote ? 'Configuring...' : 'Configure Storage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Utility function to resolve variable color
function varColor(variableName: string): string {
  return `var(${variableName})`
}

export default App
