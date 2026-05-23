import React from 'react'

interface PasteConfirmModalProps {
  clipboard: {
    op: 'copy' | 'cut'
    files: any[]
    sourcePath: string
    sourceRemoteName: string
  } | null
  selectedRemote: string
  currentPath: string
  onCancel: () => void
  onConfirm: () => void
}

export const PasteConfirmModal: React.FC<PasteConfirmModalProps> = ({
  clipboard,
  selectedRemote,
  currentPath,
  onCancel,
  onConfirm
}) => {
  if (!clipboard) return null

  return (
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
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Confirm Move
          </button>
        </div>
      </div>
    </div>
  )
}
