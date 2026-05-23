import React from 'react'
import { Server, RefreshCw, ArrowUp, FolderPlus, Clipboard } from 'lucide-react'
import type { Remote } from '../../types'

interface ToolbarProps {
  remotes: Remote[]
  selectedRemote: string
  setSelectedRemote: (val: string) => void
  currentPath: string
  navigateUp: () => void
  refreshCurrent: () => void
  loadingFiles: boolean
  onNewFolderClick: () => void
  onPasteClick: () => void
  clipboard: any
}

export const Toolbar: React.FC<ToolbarProps> = ({
  remotes,
  selectedRemote,
  setSelectedRemote,
  currentPath,
  navigateUp,
  refreshCurrent,
  loadingFiles,
  onNewFolderClick,
  onPasteClick,
  clipboard
}) => {
  return (
    <div
      className="card"
      style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-start' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Remote Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0 12px', height: '38px', minWidth: '180px' }}>
        <Server size={14} color="var(--accent-cyan)" />
        <select
          className="input-field"
          value={selectedRemote}
          onChange={(e) => setSelectedRemote(e.target.value)}
          style={{ border: 'none', background: 'transparent', padding: '0', width: '100%', fontSize: '13px' }}
        >
          <option value="">-- Select Remote --</option>
          {remotes.map(r => (
            <option key={r.name} value={r.name}>{r.name} ({r.type})</option>
          ))}
        </select>
      </div>

      {/* Path Display & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '0' }}>
        <button
          className="btn"
          onClick={navigateUp}
          disabled={!currentPath}
          style={{ height: '38px', padding: '0 10px', opacity: !currentPath ? 0.3 : 1 }}
          title="Go Up"
        >
          <ArrowUp size={16} />
        </button>

        <div className="browser-path" style={{ height: '38px', margin: 0, display: 'flex', alignItems: 'center', flex: 1, minWidth: '0', overflow: 'hidden' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px', fontWeight: 600 }}>
            {selectedRemote ? `${selectedRemote}:${currentPath || '/'}` : 'Select a remote to browse...'}
          </span>
        </div>

        <button
          className="btn"
          onClick={refreshCurrent}
          disabled={!selectedRemote || loadingFiles}
          style={{ height: '38px', padding: '0 10px' }}
          title="Refresh"
        >
          <RefreshCw size={16} className={loadingFiles ? 'spin-anim' : ''} />
        </button>

        {selectedRemote && (
          <>
            <button
              className="btn"
              onClick={onNewFolderClick}
              style={{ height: '38px', padding: '0 12px' }}
              title="Create New Folder (N)"
            >
              <FolderPlus size={15} color="var(--accent-cyan)" />
              <span style={{ fontSize: '13px' }}>New Folder</span>
            </button>

            {clipboard && (
              <button
                className="btn"
                onClick={onPasteClick}
                style={{ height: '38px', padding: '0 12px', borderColor: 'var(--accent-cyan)', backgroundColor: 'rgba(102, 252, 241, 0.05)' }}
                title={`Paste (${clipboard.op === 'cut' ? 'Move' : 'Copy'} ${clipboard.files.length} items) (Ctrl+V)`}
              >
                <Clipboard size={15} color="var(--accent-cyan)" />
                <span style={{ fontSize: '13px' }}>Paste</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
