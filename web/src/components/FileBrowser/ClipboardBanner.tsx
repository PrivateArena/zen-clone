import React from 'react'
import { Clipboard, X } from 'lucide-react'

interface ClipboardBannerProps {
  clipboard: {
    op: 'copy' | 'cut'
    files: any[]
    sourcePath: string
    sourceRemoteName: string
  } | null
  onClear: () => void
}

export const ClipboardBanner: React.FC<ClipboardBannerProps> = ({ clipboard, onClear }) => {
  if (!clipboard) return null

  return (
    <div
      style={{
        backgroundColor: 'rgba(102, 252, 241, 0.04)',
        border: '1px solid rgba(102, 252, 241, 0.2)',
        borderRadius: '8px',
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '13px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clipboard size={14} color="var(--accent-cyan)" />
        <span>
          Ready to <strong>{clipboard.op === 'cut' ? 'move' : 'copy'}</strong> {clipboard.files.length} item(s) from <i>{clipboard.sourceRemoteName}:{clipboard.sourcePath || '/'}</i>. Go to target folder and press Paste or Ctrl+V.
        </span>
      </span>
      <button
        onClick={onClear}
        style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <X size={12} /> Clear
      </button>
    </div>
  )
}
