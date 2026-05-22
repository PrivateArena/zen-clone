import React, { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { RemotesTab } from './components/RemotesTab'
import { MountsTab } from './components/MountsTab'
import { FileBrowserTab } from './components/FileBrowserTab'
import { AddRemoteModal } from './components/AddRemoteModal'
import type { Remote, Mount, RcloneFile } from './types'

function App() {
  const [activeTab, setActiveTab] = useState<'remotes' | 'mounts' | 'browser'>('remotes')
  const [daemonRunning, setDaemonRunning] = useState<boolean>(false)
  const [fuseSupported, setFuseSupported] = useState<boolean>(false)
  const [fuseDetails, setFuseDetails] = useState<string>('')
  const [binExists, setBinExists] = useState<boolean>(true)
  const [portableBin, setPortableBin] = useState<string>('')
  const [portableConfig, setPortableConfig] = useState<string>('')
  const [downloadingRclone, setDownloadingRclone] = useState<boolean>(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)

  // Remotes State
  const [remotes, setRemotes] = useState<Remote[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newRemoteName, setNewRemoteName] = useState('')
  const [newRemoteType, setNewRemoteType] = useState('drive')
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
      if (!res.ok) throw new Error('Failed to retrieve remote configuration dump')
      const data = await res.json()
      
      const remoteList: Remote[] = Object.entries(data).map(([name, val]: [string, any]) => ({
        name,
        type: val.type || 'Unknown',
        details: val
      }))
      setRemotes(remoteList)
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Load mounts
  const fetchMounts = async () => {
    if (!daemonRunning) return
    try {
      const res = await fetch('/api/rclone/mount/listmounts', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to retrieve active mounts list')
      const data = await res.json()
      
      const mountList: Mount[] = (data.mountPoints || []).map((m: any) => ({
        fs: m.Fs || m.fs || 'Unknown',
        mountPoint: m.MountPoint || m.mountPoint || 'Unknown'
      }))
      setMounts(mountList)
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Load files
  const fetchFiles = async (remote: string, path: string) => {
    if (!remote) return
    setLoadingFiles(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/rclone/operations/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fs: `${remote}:`,
          remote: path
        })
      })
      if (!res.ok) throw new Error(`Failed to list directory contents for ${remote}:${path}`)
      const data = await res.json()
      setFiles(data.list || [])
    } catch (e: any) {
      setErrorMsg(e.message)
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }

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
          parameters: {}
        })
      })
      clearInterval(pollInterval)
      if (!res.ok) throw new Error('Failed to create remote connection')
      setSuccessMsg(`Remote "${newRemoteName}" created successfully.`)
      setShowAddModal(false)
      setNewRemoteName('')
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
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await fetch('/api/rclone/mount/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fs: `${mountRemote}:${mountPath}`,
          mountPoint: mountPoint,
          vfsOpt: {
            cacheMode: 'writes' // optimizes file opening inside mounted locations
          }
        })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to mount virtual drive')
      }
      setSuccessMsg(`Mounted remote "${mountRemote}" successfully to "${mountPoint}"`)
      setMountRemote('')
      setMountPath('')
      setMountPoint('')
      fetchMounts()
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Handle unmounting a remote
  const handleUnmount = async (_fs: string, mountPoint: string) => {
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const res = await fetch('/api/rclone/mount/unmount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountPoint })
      })
      if (!res.ok) throw new Error('Failed to unmount directory')
      setSuccessMsg(`Unmounted "${mountPoint}" cleanly.`)
      fetchMounts()
    } catch (e: any) {
      setErrorMsg(e.message)
    }
  }

  // Run on mount
  useEffect(() => {
    checkStatus()
    const timer = setInterval(checkStatus, 5000)
    return () => clearInterval(timer)
  }, [])

  // Run when daemon status updates
  useEffect(() => {
    if (daemonRunning) {
      fetchRemotes()
      fetchMounts()
    }
  }, [daemonRunning])

  return (
    <div className="app-container">
      {/* Expanded or Collapsed Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        portableBin={portableBin}
        portableConfig={portableConfig}
        collapsed={sidebarCollapsed}
      />

      {/* Main Workspace */}
      <main className="workspace">
        <Header 
          activeTab={activeTab}
          daemonRunning={daemonRunning}
          fuseSupported={fuseSupported}
          checkStatus={checkStatus}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
        />

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
                {downloadingRclone ? 'Installing...' : 'Download & Install'}
              </button>
            </div>
          )}

          {/* Notification Messages */}
          {errorMsg && (
            <div style={{ backgroundColor: 'rgba(255, 74, 74, 0.15)', border: '1px solid var(--error)', color: 'var(--error)', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
            </div>
          )}
          {successMsg && (
            <div style={{ backgroundColor: 'rgba(46, 196, 182, 0.15)', border: '1px solid var(--success)', color: 'var(--success)', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span>{successMsg}</span>
              <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
            </div>
          )}

          {/* Subviews */}
          {activeTab === 'remotes' && (
            <RemotesTab 
              remotes={remotes} 
              setShowAddModal={setShowAddModal} 
              handleDeleteRemote={handleDeleteRemote}
              daemonRunning={daemonRunning}
            />
          )}

          {activeTab === 'mounts' && (
            <MountsTab 
              mounts={mounts}
              remotes={remotes}
              mountRemote={mountRemote}
              setMountRemote={setMountRemote}
              mountPath={mountPath}
              setMountPath={setMountPath}
              mountPoint={mountPoint}
              setMountPoint={setMountPoint}
              handleMount={handleMount}
              handleUnmount={handleUnmount}
              daemonRunning={daemonRunning}
              fuseSupported={fuseSupported}
              fuseDetails={fuseDetails}
            />
          )}

          {activeTab === 'browser' && (
            <FileBrowserTab 
              remotes={remotes}
              selectedRemote={selectedRemote}
              setSelectedRemote={setSelectedRemote}
              currentPath={currentPath}
              setCurrentPath={setCurrentPath}
              files={files}
              loadingFiles={loadingFiles}
              fetchFiles={fetchFiles}
              pathHistory={pathHistory}
              setPathHistory={setPathHistory}
            />
          )}
        </div>
      </main>

      <AddRemoteModal 
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        newRemoteName={newRemoteName}
        setNewRemoteName={setNewRemoteName}
        newRemoteType={newRemoteType}
        setNewRemoteType={setNewRemoteType}
        handleAddRemote={handleAddRemote}
        isSubmittingRemote={isSubmittingRemote}
        detectedOAuthURL={detectedOAuthURL}
      />
    </div>
  )
}

export default App
