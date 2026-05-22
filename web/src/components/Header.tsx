import React from 'react'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Menu } from 'lucide-react'

interface HeaderProps {
  activeTab: 'remotes' | 'mounts' | 'browser'
  daemonRunning: boolean
  fuseSupported: boolean
  checkStatus: () => Promise<void>
  sidebarCollapsed: boolean
  setSidebarCollapsed: (val: boolean) => void
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  daemonRunning,
  fuseSupported,
  checkStatus,
  sidebarCollapsed,
  setSidebarCollapsed
}) => {
  return (
    <header className="header" style={{ padding: '0 24px', height: '60px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          className="btn" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <Menu size={18} />
        </button>
        <div className="header-title" style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {activeTab === 'remotes' && 'Storage Accounts'}
          {activeTab === 'mounts' && 'Virtual Drives'}
          {activeTab === 'browser' && 'File Browser'}
        </div>
      </div>

      <div className="status-badges" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div className={`badge ${daemonRunning ? 'active' : 'inactive'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
          {daemonRunning ? <CheckCircle size={12} color="var(--success)" /> : <XCircle size={12} color="var(--error)" />}
          <span>Daemon: {daemonRunning ? 'Online' : 'Offline'}</span>
        </div>

        <div className={`badge ${fuseSupported ? 'active' : 'inactive'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
          {fuseSupported ? <CheckCircle size={12} color="var(--success)" /> : <AlertTriangle size={12} color="var(--warning)" />}
          <span>FUSE: {fuseSupported ? 'Active' : 'Missing'}</span>
        </div>

        <button 
          onClick={checkStatus} 
          className="btn" 
          style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Refresh Status"
        >
          <RefreshCw size={12} />
        </button>
      </div>
    </header>
  )
}
