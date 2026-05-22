import React from 'react'
import { Plus, Trash2, Server } from 'lucide-react'
import type { Remote } from '../types'

interface RemotesTabProps {
  remotes: Remote[]
  setShowAddModal: (val: boolean) => void
  handleDeleteRemote: (name: string) => Promise<void>
  daemonRunning: boolean
}

export const RemotesTab: React.FC<RemotesTabProps> = ({
  remotes,
  setShowAddModal,
  handleDeleteRemote,
  daemonRunning
}) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Cloud Storage Accounts</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Manage connections to your Google Drive, OneDrive, and other storage providers.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowAddModal(true)}
          disabled={!daemonRunning}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} />
          <span>Add Account</span>
        </button>
      </div>

      <div className="card-grid">
        {remotes.map(remote => (
          <div key={remote.name} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Server size={16} color="var(--accent-cyan)" />
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{remote.name}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong>Type:</strong> <span style={{ textTransform: 'capitalize' }}>{remote.type}</span>
              </div>
              {remote.details && Object.keys(remote.details).length > 0 && (
                <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {Object.entries(remote.details).slice(0, 3).map(([k, v]) => (
                    <div key={k} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                      <strong>{k}:</strong> {String(v)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <button 
              className="btn" 
              onClick={() => handleDeleteRemote(remote.name)}
              style={{ color: 'var(--error)', padding: '6px', border: '1px solid transparent' }}
              title="Delete Remote Configuration"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {remotes.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1', padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No remote connections configured. Click "Add Account" to connect your first cloud storage.
          </div>
        )}
      </div>
    </div>
  )
}
