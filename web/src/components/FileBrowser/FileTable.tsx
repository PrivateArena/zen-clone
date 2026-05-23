import React, { useMemo } from 'react'
import { RefreshCw, Folder, File } from 'lucide-react'
import type { RcloneFile } from '../../types'

interface FileRowProps {
  file: RcloneFile
  idx: number
  isSelected: boolean
  isCutSource: boolean
  onRowClick: (e: React.MouseEvent, file: RcloneFile, index: number) => void
  onRowDoubleClick: (file: RcloneFile) => void
  onRowContextMenu: (e: React.MouseEvent, file: RcloneFile) => void
}

const FileRow: React.FC<FileRowProps> = React.memo(({
  file,
  idx,
  isSelected,
  isCutSource,
  onRowClick,
  onRowDoubleClick,
  onRowContextMenu
}) => {
  const formattedSize = useMemo(() => {
    if (file.IsDir) return '-'
    if (file.Size === 0) return '0 Bytes'
    if (file.Size < 0) return '-'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(file.Size) / Math.log(k))
    return parseFloat((file.Size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }, [file.IsDir, file.Size])

  const formattedDate = useMemo(() => {
    return new Date(file.ModTime).toLocaleString()
  }, [file.ModTime])

  return (
    <tr
      className={`file-table-row ${isSelected ? 'selected' : ''}`}
      onClick={(e) => onRowClick(e, file, idx)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onRowDoubleClick(file)
      }}
      onContextMenu={(e) => onRowContextMenu(e, file)}
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        backgroundColor: isSelected ? 'rgba(102, 252, 241, 0.08)' : 'transparent',
        opacity: isCutSource ? 0.5 : 1,
        borderLeft: isSelected ? '3px solid var(--accent-cyan)' : '3px solid transparent'
      }}
    >
      <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {file.IsDir ? <Folder size={16} color="var(--accent-cyan)" /> : <File size={16} color="var(--text-secondary)" />}
      </td>
      <td style={{ padding: '14px 20px', fontWeight: file.IsDir ? 600 : 'normal', color: 'var(--text-primary)' }}>
        <span style={{ display: 'inline-block', maxWidth: '50vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.Name}>
          {file.Name}
        </span>
      </td>
      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
        {formattedSize}
      </td>
      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
        {formattedDate}
      </td>
      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.IsDir ? 'Folder' : file.MimeType || 'Unknown'}
      </td>
    </tr>
  )
})

FileRow.displayName = 'FileRow'

interface FileTableProps {
  sortedFiles: RcloneFile[]
  selectedFiles: RcloneFile[]
  clipboard: {
    op: 'copy' | 'cut'
    files: RcloneFile[]
    sourcePath: string
    sourceRemoteName: string
  } | null
  selectedRemote: string
  currentPath: string
  loadingFiles: boolean
  onRowClick: (e: React.MouseEvent, file: RcloneFile, index: number) => void
  onRowDoubleClick: (file: RcloneFile) => void
  onRowContextMenu: (e: React.MouseEvent, file: RcloneFile) => void
  onContainerContextMenu: (e: React.MouseEvent) => void
}

export const FileTable: React.FC<FileTableProps> = ({
  sortedFiles,
  selectedFiles,
  clipboard,
  selectedRemote,
  currentPath,
  loadingFiles,
  onRowClick,
  onRowDoubleClick,
  onRowContextMenu,
  onContainerContextMenu
}) => {
  return (
    <div
      className="card static"
      style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      onContextMenu={(e) => onContainerContextMenu(e)}
    >
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '14px 20px', width: '40px' }}></th>
              <th style={{ padding: '14px 20px' }}>Name</th>
              <th style={{ padding: '14px 20px', width: '100px' }}>Size</th>
              <th style={{ padding: '14px 20px', width: '200px' }}>Modified</th>
              <th style={{ padding: '14px 20px', width: '120px' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {loadingFiles ? (
              <tr>
                <td colSpan={5} style={{ padding: '64px', textAlign: 'center' }}>
                  <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--accent-cyan)' }} />
                  <div style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading files...</div>
                </td>
              </tr>
            ) : !selectedRemote ? (
              <tr>
                <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Select a cloud remote storage account from the toolbar to browse files.
                </td>
              </tr>
            ) : sortedFiles.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  This folder is empty.
                </td>
              </tr>
            ) : (
              sortedFiles.map((file, idx) => {
                const isSelected = selectedFiles.some(f => f.Name === file.Name)
                const isCutSource = !!(clipboard && clipboard.op === 'cut' && clipboard.sourceRemoteName === selectedRemote && clipboard.sourcePath === currentPath && clipboard.files.some(f => f.Name === file.Name))

                return (
                  <FileRow
                    key={file.Name}
                    file={file}
                    idx={idx}
                    isSelected={isSelected}
                    isCutSource={isCutSource}
                    onRowClick={onRowClick}
                    onRowDoubleClick={onRowDoubleClick}
                    onRowContextMenu={onRowContextMenu}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
