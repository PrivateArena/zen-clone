import React from 'react'
import type { RcloneFile } from '../../../types'

interface DeleteConfirmModalProps {
  deleteTargets: RcloneFile[]
  onCancel: () => void
  onConfirm: () => void
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  deleteTargets,
  onCancel,
  onConfirm
}) => {
  return (
    <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content">
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Confirm Delete</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
          Are you sure you want to permanently delete the{' '}
          {deleteTargets.length === 1
            ? `${deleteTargets[0].IsDir ? 'folder' : 'file'} "${deleteTargets[0].Name}"`
            : `${deleteTargets.length} selected items`
          }? This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
