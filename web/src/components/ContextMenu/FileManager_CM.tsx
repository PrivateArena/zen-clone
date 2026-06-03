import React, { useEffect, useRef } from 'react'
import { HardDrive, X, Upload, Copy, Scissors, Clipboard, Trash2, Edit, FolderPlus, ExternalLink, Download, RefreshCw } from 'lucide-react'
import type { RcloneFile } from '../../types'

interface FileManagerCMProps {
  x: number
  y: number
  visible: boolean
  onClose: () => void
  selectedFiles: RcloneFile[]
  hasClipboard: boolean
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onRename: () => void
  onDelete: () => void
  onNewFolder: () => void
  onMount: () => void
  onUpload: (type: 'file' | 'folder') => void
  onOpen: () => void
  onDownload: () => void
  onSync: () => void
}

export const FileManagerCM: React.FC<FileManagerCMProps> = ({
  x,
  y,
  visible,
  onClose,
  selectedFiles,
  hasClipboard,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDelete,
  onNewFolder,
  onMount,
  onUpload,
  onOpen,
  onDownload,
  onSync
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

  // Ensure context menu stays within viewport boundaries
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - 380)

  const hasSelection = selectedFiles.length > 0
  const isSingleSelection = selectedFiles.length === 1
  const file = isSingleSelection ? selectedFiles[0] : null
  const isFolder = file?.IsDir

  const buttonStyle = (isDanger = false, isDisabled = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    background: 'none',
    border: 'none',
    color: isDisabled ? 'var(--text-secondary)' : (isDanger ? 'var(--error)' : 'var(--text-primary)'),
    opacity: isDisabled ? 0.4 : 1,
    fontSize: '12.5px',
    textAlign: 'left',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    width: '100%',
    transition: 'background-color 0.15s ease'
  })

  const shortcutStyle: React.CSSProperties = {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 5px',
    borderRadius: '4px',
    marginLeft: '8px',
    border: '1px solid rgba(255,255,255,0.03)'
  }

  const dividerStyle: React.CSSProperties = {
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '4px 0'
  }

  return (
    <div 
      ref={menuRef}
      style={{
        position: 'fixed',
        top: `${adjustedY}px`,
        left: `${adjustedX}px`,
        zIndex: 9999,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '6px 0',
        minWidth: '190px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '6px 14px', fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 600 }}>
        {selectedFiles.length > 1 
          ? `${selectedFiles.length} items selected`
          : (file ? `${isFolder ? 'Folder' : 'File'}: ${file.Name}` : 'Folder Actions')
        }
      </div>

      {hasSelection && (
        <>
          <button
            onClick={() => { onCopy(); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Copy size={13} color="var(--accent-cyan)" />
              <span>Copy</span>
            </span>
            <span style={shortcutStyle}>Ctrl+C</span>
          </button>

          <button
            onClick={() => { onCut(); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Scissors size={13} color="var(--accent-cyan)" />
              <span>Cut (Move)</span>
            </span>
            <span style={shortcutStyle}>Ctrl+X</span>
          </button>
        </>
      )}

      <button
        onClick={() => { if (hasClipboard) { onPaste(); onClose(); } }}
        style={buttonStyle(false, !hasClipboard)}
        disabled={!hasClipboard}
        className={hasClipboard ? 'cm-item' : ''}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clipboard size={13} color={hasClipboard ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
          <span>Paste</span>
        </span>
        <span style={shortcutStyle}>Ctrl+V</span>
      </button>

      {isSingleSelection && (
        <button
          onClick={() => { onRename(); onClose(); }}
          style={buttonStyle()}
          className="cm-item"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit size={13} color="var(--accent-cyan)" />
            <span>Rename</span>
          </span>
          <span style={shortcutStyle}>F2</span>
        </button>
      )}

      {hasSelection && (
        <button
          onClick={() => { onDelete(); onClose(); }}
          style={buttonStyle(true)}
          className="cm-item"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={13} color="var(--error)" />
            <span>Delete</span>
          </span>
          <span style={shortcutStyle}>Del</span>
        </button>
      )}

      <div style={dividerStyle} />

      <button
        onClick={() => { onNewFolder(); onClose(); }}
        style={buttonStyle()}
        className="cm-item"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderPlus size={13} color="var(--accent-cyan)" />
          <span>New Folder</span>
        </span>
        <span style={shortcutStyle}>N</span>
      </button>

      {(!hasSelection || (isSingleSelection && isFolder)) && (
        <>
          <button
            onClick={() => { onUpload('file'); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={13} color="var(--accent-cyan)" />
              <span>Upload File</span>
            </span>
          </button>

          <button
            onClick={() => { onUpload('folder'); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={13} color="var(--accent-cyan)" />
              <span>Upload Folder</span>
            </span>
          </button>
        </>
      )}

      {isSingleSelection && isFolder && (
        <>
          <button
            onClick={() => { onMount(); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive size={13} color="var(--accent-cyan)" />
              <span>Mount Folder</span>
            </span>
          </button>
          <button
            onClick={() => { onSync(); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={13} color="var(--accent-cyan)" />
              <span>Sync to…</span>
            </span>
          </button>
        </>
      )}

      {isSingleSelection && !isFolder && (
        <>
          <div style={dividerStyle} />
          <button
            onClick={() => { onOpen(); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ExternalLink size={13} color="var(--accent-cyan)" />
              <span>Open in New Tab</span>
            </span>
          </button>
          <button
            onClick={() => { onDownload(); onClose(); }}
            style={buttonStyle()}
            className="cm-item"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={13} color="var(--accent-cyan)" />
              <span>Download</span>
            </span>
          </button>
        </>
      )}

      <div style={dividerStyle} />

      <button
        onClick={onClose}
        style={buttonStyle(false)}
        className="cm-item"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <X size={13} color="var(--text-secondary)" />
          <span>Cancel</span>
        </span>
      </button>
    </div>
  )
}
