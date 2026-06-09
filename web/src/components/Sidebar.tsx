import React from 'react'
import { Server, HardDrive, FolderOpen, Info } from 'lucide-react'

interface SidebarProps {
  activeTab: 'remotes' | 'mounts' | 'browser'
  setActiveTab: (tab: 'remotes' | 'mounts' | 'browser') => void
  portableBin: string
  portableConfig: string
  visible: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  portableBin,
  portableConfig,
  visible,
  onMouseEnter,
  onMouseLeave
}) => {
  return (
    <aside 
      className={`sidebar ${visible ? 'visible' : ''}`} 
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', padding: '24px 16px' }}
    >
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', paddingLeft: '8px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)' }} />
        <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-primary)' }}>ZEN-CLONE</span>
      </div>

      <nav className="nav-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <div 
          className={`nav-item ${activeTab === 'remotes' ? 'active' : ''}`}
          onClick={() => setActiveTab('remotes')}
        >
          <Server size={18} />
          <span>Storage Accounts</span>
        </div>
        
        <div 
          className={`nav-item ${activeTab === 'mounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('mounts')}
        >
          <HardDrive size={18} />
          <span>Active Mounts</span>
        </div>
        
        <div 
          className={`nav-item ${activeTab === 'browser' ? 'active' : ''}`}
          onClick={() => setActiveTab('browser')}
        >
          <FolderOpen size={18} />
          <span>File Browser</span>
        </div>
      </nav>

      <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={12} color="var(--accent-cyan)" />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>PORTABLE SUITE</span>
          </div>
          {portableBin && (
            <div>
              <strong>Bin:</strong> {portableBin}
            </div>
          )}
          {portableConfig && (
            <div>
              <strong>Config:</strong> {portableConfig}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
