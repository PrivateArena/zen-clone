import React from 'react'
import { RefreshCw } from 'lucide-react'

interface AddRemoteModalProps {
  showAddModal: boolean
  setShowAddModal: (val: boolean) => void
  newRemoteName: string
  setNewRemoteName: (val: string) => void
  newRemoteType: string
  setNewRemoteType: (val: string) => void
  handleAddRemote: (e: React.FormEvent) => Promise<void>
  isSubmittingRemote: boolean
  detectedOAuthURL: string
}

export const AddRemoteModal: React.FC<AddRemoteModalProps> = ({
  showAddModal,
  setShowAddModal,
  newRemoteName,
  setNewRemoteName,
  newRemoteType,
  setNewRemoteType,
  handleAddRemote,
  isSubmittingRemote,
  detectedOAuthURL
}) => {
  if (!showAddModal) return null

  return (
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
  )
}
