import React from 'react'
import { HardDrive, Plus, Trash2, AlertTriangle, Info, FolderOpen } from 'lucide-react'
import type { Remote, Mount } from '../types'

interface MountsTabProps {
  mounts: Mount[]
  remotes: Remote[]
  mountRemote: string
  setMountRemote: (val: string) => void
  mountPath: string
  setMountPath: (val: string) => void
  mountPoint: string
  setMountPoint: (val: string) => void
  handleMount: (e: React.FormEvent) => Promise<void>
  handleUnmount: (fs: string, mountPoint: string) => Promise<void>
  daemonRunning: boolean
  fuseSupported: boolean
  fuseDetails: string
}

export const MountsTab: React.FC<MountsTabProps> = ({
  mounts,
  remotes,
  mountRemote,
  setMountRemote,
  mountPath,
  setMountPath,
  mountPoint,
  setMountPoint,
  handleMount,
  handleUnmount,
  daemonRunning,
  fuseSupported,
  fuseDetails
}) => {
  const handleBrowseLocalDir = async () => {
    try {
      const res = await fetch('/api/browse-directory')
      const data = await res.json()
      if (data.success && data.directory) {
        setMountPoint(data.directory)
      }
    } catch (err: any) {
      console.error('Failed to browse directory:', err)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', height: '100%' }}>
      {/* Mount Control Panel */}
      <div className="card" style={{ height: 'fit-content' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Mount Virtual Drive</h3>
        
        {!fuseSupported && (
          <div style={{ backgroundColor: 'rgba(255, 74, 74, 0.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>FUSE Driver Missing:</strong> {fuseDetails || 'No FUSE support detected.'} Mounting files requires installing <code>fuse</code> (Linux/Mac) or <code>WinFsp</code> (Windows).
            </div>
          </div>
        )}

        <form onSubmit={handleMount}>
          <div className="form-group">
            <label className="form-label">Select Storage Account</label>
            <select 
              className="input-field"
              value={mountRemote}
              onChange={(e) => setMountRemote(e.target.value)}
              required
            >
              <option value="">-- Choose Account --</option>
              {remotes.map(r => (
                <option key={r.name} value={r.name}>{r.name} ({r.type})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Remote Path (Optional)</label>
            <input 
              type="text" 
              placeholder="e.g. Backups/Documents (defaults to root)"
              className="input-field"
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mount Point (Local Path)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="e.g. /home/user/mnt/gdrive"
                className="input-field"
                value={mountPoint}
                onChange={(e) => setMountPoint(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                className="btn" 
                onClick={handleBrowseLocalDir}
                style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Browse Local Directory"
              >
                <FolderOpen size={14} />
                <span>Browse</span>
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={!daemonRunning || !fuseSupported || !mountRemote || !mountPoint}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}
          >
            <Plus size={16} />
            <span>Mount Drive</span>
          </button>
        </form>
      </div>

      {/* Active Mounts List */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Active Virtual Drives</h3>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {mounts.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No active virtual drives mounted. Use the form on the left to mount a remote storage.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 8px' }}>Remote Target</th>
                  <th style={{ padding: '12px 8px' }}>Local Mount Point</th>
                  <th style={{ padding: '12px 8px', width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {mounts.map((m, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <HardDrive size={14} color="var(--accent-cyan)" />
                        <span>{m.fs}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>
                      <code>{m.mountPoint}</code>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button 
                        className="btn" 
                        onClick={() => handleUnmount(m.fs, m.mountPoint)}
                        style={{ color: 'var(--error)', padding: '4px' }}
                        title="Unmount Drive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>FUSE mounting allows you to browse and open cloud storage files natively in your file manager as if they were local disk drives.</span>
        </div>
      </div>
    </div>
  )
}
