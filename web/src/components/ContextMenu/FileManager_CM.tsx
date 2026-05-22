import React, { useEffect, useRef } from 'react'
import { HardDrive, X, Upload } from 'lucide-react'

interface FileManagerCMProps {
  x: number
  y: number
  visible: boolean
  onClose: () => void
  folderName: string
  onMount: () => void
  onUpload: (type: 'file' | 'folder') => void
}

export const FileManagerCM: React.FC<FileManagerCMProps> = ({
  x,
  y,
  visible,
  onClose,
  folderName,
  onMount,
  onUpload
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (visible) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div 
      ref={menuRef}
      style={{
        position: 'fixed',
        top: `${y}px`,
        left: `${x}px`,
        zIndex: 9999,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '6px 0',
        minWidth: '160px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '6px 16px', fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        Folder: {folderName}
      </div>

      <button
        onClick={() => {
          onUpload('file')
          onClose()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '13px',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
        }}
        className="cm-item"
      >
        <Upload size={14} color="var(--accent-cyan)" />
        <span>Upload File</span>
      </button>

      <button
        onClick={() => {
          onUpload('folder')
          onClose()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '13px',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
        }}
        className="cm-item"
      >
        <Upload size={14} color="var(--accent-cyan)" />
        <span>Upload Folder</span>
      </button>

      <button
        onClick={() => {
          onMount()
          onClose()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: '13px',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
        }}
        className="cm-item"
      >
        <HardDrive size={14} color="var(--accent-cyan)" />
        <span>Mount Folder</span>
      </button>

      <button
        onClick={onClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          background: 'none',
          border: 'none',
          color: 'var(--error)',
          fontSize: '13px',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
        }}
        className="cm-item"
      >
        <X size={14} color="var(--error)" />
        <span>Cancel</span>
      </button>
    </div>
  )
}
