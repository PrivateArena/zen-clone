import React from 'react'

interface RenameModalProps {
  renameNewName: string
  setRenameNewName: (val: string) => void
  onCancel: () => void
  onConfirm: (newName: string) => void
}

export const RenameModal: React.FC<RenameModalProps> = ({
  renameNewName,
  setRenameNewName,
  onCancel,
  onConfirm
}) => {
  return (
    <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Rename Item</h3>
        <div className="form-group">
          <label className="form-label">New Name</label>
          <input
            type="text"
            className="input-field"
            value={renameNewName}
            onChange={(e) => setRenameNewName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirm(renameNewName)
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(renameNewName)} disabled={!renameNewName.trim()}>
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
