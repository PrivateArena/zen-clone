import React, { useState, useEffect } from 'react'
import { Folder, X, Home, ArrowUp, File } from 'lucide-react'

interface LocalFolderPickerProps {
  visible: boolean
  onClose: () => void
  onSelect: (path: string, isDir: boolean) => void
  title?: string
  selectionMode?: 'file' | 'folder' | 'both'
}

export const LocalFolderPicker: React.FC<LocalFolderPickerProps> = ({
  visible,
  onClose,
  onSelect,
  title = 'Select Local Item',
  selectionMode = 'folder'
}) => {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [items, setItems] = useState<{ name: string; is_dir: boolean }[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [selectedItem, setSelectedItem] = useState<{ name: string; isDir: boolean } | null>(null)

  const fetchItems = async (path: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/local/ls?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (data.success) {
        setCurrentPath(data.path)
        setItems(data.dirs || [])
        setSelectedItem(null) // Reset selection when navigating
      } else {
        setError(data.error || 'Failed to list directory')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) {
      fetchItems(currentPath)
    }
  }, [visible])

  if (!visible) return null

  const handleItemClick = (item: { name: string; is_dir: boolean }) => {
    if (item.is_dir) {
      let nextPath = ''
      if (item.name === '..') {
        const separator = currentPath.includes('\\') ? '\\' : '/'
        const parts = currentPath.split(separator).filter(p => p !== '')
        parts.pop()
        nextPath = separator === '/' ? '/' + parts.join('/') : parts.join(separator)
        if (nextPath === '') nextPath = separator
      } else {
        const separator = currentPath.includes('\\') ? '\\' : '/'
        const base = currentPath === separator ? '' : currentPath
        nextPath = `${base}${separator}${item.name}`
      }
      fetchItems(nextPath)
    } else {
      // It's a file
      if (selectionMode === 'file' || selectionMode === 'both') {
        setSelectedItem({ name: item.name, isDir: false })
      }
    }
  }

  const handleSelect = () => {
    const separator = currentPath.includes('\\') ? '\\' : '/'
    const base = currentPath === separator ? '' : currentPath
    
    if (selectedItem && !selectedItem.isDir) {
      // Selecting a file
      onSelect(`${base}${separator}${selectedItem.name}`, false)
    } else {
      // Selecting a folder
      onSelect(currentPath, true)
    }
    onClose()
  }

  const canSelect = () => {
    if (selectionMode === 'folder') return true // Can always select current folder
    if (selectionMode === 'file') return selectedItem !== null && !selectedItem.isDir
    if (selectionMode === 'both') return true // Can select current folder or selected file
    return false
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ width: '600px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', overflow: 'hidden' }}>
          <Home size={14} color="var(--accent-cyan)" />
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'var(--mono)' }}>
            {currentPath}
            {selectedItem && !selectedItem.isDir && (
              <span style={{ color: 'var(--accent-cyan)' }}> {currentPath.includes('\\') ? '\\' : '/'}{selectedItem.name}</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', minHeight: '300px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: '20px', color: 'var(--error)', textAlign: 'center' }}>{error}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map((item, idx) => {
                const isSelected = selectedItem && selectedItem.name === item.name && selectedItem.isDir === item.is_dir
                return (
                  <div 
                    key={idx}
                    onClick={() => handleItemClick(item)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px', 
                      padding: '10px 16px', 
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background-color 0.2s',
                      backgroundColor: isSelected ? 'rgba(102, 252, 241, 0.1)' : 'transparent',
                      color: isSelected ? 'var(--accent-cyan)' : 'inherit'
                    }}
                    className="file-table-row"
                  >
                    {item.name === '..' ? (
                      <ArrowUp size={16} color="var(--text-secondary)" />
                    ) : item.is_dir ? (
                      <Folder size={16} color="var(--accent-cyan)" />
                    ) : (
                      <File size={16} color="var(--text-secondary)" />
                    )}
                    <span style={{ fontSize: '14px' }}>{item.name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn-primary" 
            onClick={handleSelect}
            disabled={!canSelect()}
          >
            {selectedItem && !selectedItem.isDir ? 'Select File' : 'Select Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
