import React from 'react'
import { FolderOpen } from 'lucide-react'

interface QuickMountModalProps {
  selectedRemote: string
  currentPath: string
  mountTargetFolder: string
  mountLocalPath: string
  setMountLocalPath: (val: string) => void
  mounting: boolean
  fuseSupported: boolean
  fuseDetails: string
  quickMountError: string
  onBrowseLocalDirectory: () => void
  onCancel: () => void
  onConfirm: () => void
}

export const QuickMountModal: React.FC<QuickMountModalProps> = ({
  selectedRemote,
  currentPath,
  mountTargetFolder,
  mountLocalPath,
  setMountLocalPath,
  mounting,
  fuseSupported,
  fuseDetails,
  quickMountError,
  onBrowseLocalDirectory,
  onCancel,
  onConfirm
}) => {
  return (
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
            onClick={onCancel}
            disabled={mounting}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={mounting || !fuseSupported || !mountLocalPath}
          >
            {mounting ? 'Mounting...' : 'Mount'}
          </button>
        </div>
      </div>
    </div>
  )
}
