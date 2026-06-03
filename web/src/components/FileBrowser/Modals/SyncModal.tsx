import React, { useState } from 'react'
import { RefreshCw, ArrowRight } from 'lucide-react'
import type { Remote } from '../../../types'

interface SyncModalProps {
  remotes: Remote[]
  selectedRemote: string
  currentPath: string
  selectedFolder: string
  onCancel: () => void
  onConfirm: (srcFs: string, dstFs: string) => void
}

export const SyncModal: React.FC<SyncModalProps> = ({
  remotes,
  selectedRemote,
  currentPath,
  selectedFolder,
  onCancel,
  onConfirm
}) => {
  const [dstRemote, setDstRemote] = useState(selectedRemote)
  const [dstPath, setDstPath]   = useState('')

  const srcFs = `${selectedRemote}:${currentPath ? currentPath + '/' : ''}${selectedFolder}`
  const dstFs = `${dstRemote}:${dstPath || ''}`.replace(/:\//, ':')

  const handleConfirm = () => {
    if (!dstRemote) return
    onConfirm(srcFs, dstFs)
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }}>
      <div className="card" style={{ padding: '28px', minWidth: '420px', maxWidth: '520px' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: '16px', fontWeight: 600 }}>Sync Folder</h3>

        <div style={{ marginBottom: '18px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(102,252,241,0.06)', border: '1px solid rgba(102,252,241,0.15)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ArrowRight size={14} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
          <span>One-way sync: source → destination. Files in destination not in source are <strong>not</strong> deleted unless rclone's delete mode is enabled.</span>
        </div>

        <div className="form-group" style={{ marginBottom: '14px' }}>
          <label className="form-label">Source (read-only)</label>
          <input className="input-field" value={srcFs} readOnly style={{ opacity: 0.7 }} />
        </div>

        <div className="form-group" style={{ marginBottom: '14px' }}>
          <label className="form-label">Destination Remote</label>
          <select className="input-field" value={dstRemote} onChange={e => setDstRemote(e.target.value)}>
            {remotes.map(r => (
              <option key={r.name} value={r.name}>{r.name} ({r.type})</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label className="form-label">Destination Path (leave blank for root)</label>
          <input
            className="input-field"
            value={dstPath}
            onChange={e => setDstPath(e.target.value)}
            placeholder={`e.g. Backups/${selectedFolder}`}
          />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', fontFamily: 'monospace', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
          {srcFs} → {dstFs}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!dstRemote}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            Start Sync
          </button>
        </div>
      </div>
    </div>
  )
}
