import React from 'react'

interface NewFolderModalProps {
  newFolderName: string
  setNewFolderName: (val: string) => void
  onCancel: () => void
  onConfirm: (folderName: string) => void
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({
  newFolderName,
  setNewFolderName,
  onCancel,
  onConfirm
}) => {
  return (
    <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Create New Folder</h3>
        <div className="form-group">
          <label className="form-label">Folder Name</label>
          <input
            type="text"
            className="input-field"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="e.g. Documents"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirm(newFolderName)
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(newFolderName)} disabled={!newFolderName.trim()}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
