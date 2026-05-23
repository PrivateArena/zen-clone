import React from 'react'
import { Clipboard, X, RefreshCw, Check, AlertCircle } from 'lucide-react'
import type { BackgroundTask } from '../../hooks/useFileBrowser'

interface TasksPanelProps {
  backgroundTasks: BackgroundTask[]
  showTasksPanel: boolean
  setShowTasksPanel: (val: boolean) => void
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>
}

export const TasksPanel: React.FC<TasksPanelProps> = ({
  backgroundTasks,
  showTasksPanel,
  setShowTasksPanel,
  setBackgroundTasks
}) => {
  if (backgroundTasks.length === 0) return null

  return (
    <>
      {/* Background Tasks Floating Panel */}
      {showTasksPanel && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '360px',
            maxHeight: '400px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 99999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clipboard size={14} color="var(--accent-cyan)" />
              File Operations
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setBackgroundTasks([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear All"
              >
                Clear
              </button>
              <button
                onClick={() => setShowTasksPanel(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List of Tasks */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
            {backgroundTasks.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span
                    style={{
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '220px'
                    }}
                    title={t.name}
                  >
                    {t.name}
                  </span>

                  {t.status === 'running' && (
                    <RefreshCw size={12} className="spin-anim" color="var(--accent-cyan)" />
                  )}
                  {t.status === 'completed' && (
                    <Check size={12} color="#10B981" />
                  )}
                  {t.status === 'failed' && (
                    <span title={t.error}>
                      <AlertCircle size={12} color="var(--error)" />
                    </span>
                  )}
                </div>

                {/* Progress Bar or Error */}
                {t.status === 'running' && (
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                    <div style={{ width: `${t.progress}%`, height: '100%', backgroundColor: 'var(--accent-cyan)', transition: 'width 0.3s ease' }} />
                  </div>
                )}
                {t.status === 'failed' && t.error && (
                  <div style={{ color: 'var(--error)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {t.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating status badge when tasks panel is closed */}
      {!showTasksPanel && backgroundTasks.some(t => t.status === 'running') && (
        <button
          onClick={() => setShowTasksPanel(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '10px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            color: 'var(--accent-cyan)',
            fontWeight: 600,
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            zIndex: 99999
          }}
          onClickCapture={(e) => e.stopPropagation()}
        >
          <RefreshCw size={12} className="spin-anim" />
          <span>Active Tasks ({backgroundTasks.filter(t => t.status === 'running').length})</span>
        </button>
      )}
    </>
  )
}
