import React, { useState, useRef, useEffect } from 'react'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Menu, Gauge, Activity } from 'lucide-react'
import { useRcloneStats } from '../hooks/useRcloneStats'

const BW_PRESETS = [
  { label: 'Unlimited', value: 'off' },
  { label: '1 MB/s',   value: '1M'  },
  { label: '5 MB/s',   value: '5M'  },
  { label: '10 MB/s',  value: '10M' },
]

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
  const [showBwPanel, setShowBwPanel] = useState(false)
  const [activeLimit, setActiveLimit] = useState('off')
  const [customRate, setCustomRate] = useState('')
  const [applying, setApplying] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const stats = useRcloneStats(daemonRunning)

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowBwPanel(false)
      }
    }
    if (showBwPanel) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBwPanel])

  const applyLimit = async (rate: string) => {
    if (!daemonRunning) return
    setApplying(true)
    try {
      await fetch('/api/rclone/core/bwlimit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate })
      })
      setActiveLimit(rate)
    } catch { /* ignore */ } finally {
      setApplying(false)
    }
  }

  const handleCustomApply = () => {
    const r = customRate.trim()
    if (!r) return
    applyLimit(r)
    setCustomRate('')
  }

  const limitLabel = activeLimit === 'off' ? null : activeLimit

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
          {activeTab === 'mounts'  && 'Virtual Drives'}
          {activeTab === 'browser' && 'File Browser'}
        </div>
      </div>

      <div className="status-badges" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {/* Live transfer stats pill */}
        {stats && stats.transfers > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-cyan)', backgroundColor: 'rgba(102,252,241,0.08)', border: '1px solid rgba(102,252,241,0.2)', borderRadius: '20px', padding: '3px 10px' }}>
            <Activity size={11} />
            <span>⚡ {stats.speed >= 1048576 ? `${(stats.speed/1048576).toFixed(1)} MB/s` : `${(stats.speed/1024).toFixed(0)} KB/s`}</span>
            <span style={{ opacity: 0.6 }}>· {stats.transfers} active</span>
          </div>
        )}

        <div className={`badge ${daemonRunning ? 'active' : 'inactive'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
          {daemonRunning ? <CheckCircle size={12} color="var(--success)" /> : <XCircle size={12} color="var(--error)" />}
          <span>Daemon: {daemonRunning ? 'Online' : 'Offline'}</span>
        </div>

        <div className={`badge ${fuseSupported ? 'active' : 'inactive'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
          {fuseSupported ? <CheckCircle size={12} color="var(--success)" /> : <AlertTriangle size={12} color="var(--warning)" />}
          <span>FUSE: {fuseSupported ? 'Active' : 'Missing'}</span>
        </div>

        {/* Bandwidth throttle */}
        <div ref={panelRef} style={{ position: 'relative' }}>
          <button
            className={`btn ${limitLabel ? 'badge active' : ''}`}
            onClick={() => setShowBwPanel(p => !p)}
            disabled={!daemonRunning}
            style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            title="Bandwidth Limit"
          >
            <Gauge size={12} />
            <span>{limitLabel ? `BW: ${limitLabel}` : 'BW'}</span>
          </button>

          {showBwPanel && (
            <div style={{
              position: 'absolute', top: '36px', right: 0, zIndex: 9999,
              backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: '10px', padding: '12px', minWidth: '180px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '6px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>BANDWIDTH LIMIT</div>
              {BW_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => { applyLimit(p.value); setShowBwPanel(false) }}
                  disabled={applying}
                  style={{
                    padding: '6px 10px', borderRadius: '6px', fontSize: '12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    backgroundColor: activeLimit === p.value ? 'rgba(102,252,241,0.15)' : 'rgba(255,255,255,0.04)',
                    color: activeLimit === p.value ? 'var(--accent-cyan)' : 'var(--text-primary)',
                    fontWeight: activeLimit === p.value ? 600 : 'normal'
                  }}
                >
                  {p.label}
                </button>
              ))}
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <input
                  type="text"
                  value={customRate}
                  onChange={e => setCustomRate(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCustomApply()}
                  placeholder="e.g. 2M"
                  className="input-field"
                  style={{ flex: 1, padding: '5px 8px', fontSize: '12px' }}
                />
                <button
                  onClick={handleCustomApply}
                  className="btn btn-primary"
                  disabled={applying || !customRate.trim()}
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  Set
                </button>
              </div>
            </div>
          )}
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
