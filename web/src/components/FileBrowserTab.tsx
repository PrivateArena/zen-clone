import React from 'react'
import { RefreshCw } from 'lucide-react'
import { FileManagerCM } from './ContextMenu/FileManager_CM'
import { LocalFolderPicker } from './LocalFolderPicker'
import { useFileBrowser } from '../hooks/useFileBrowser'
import { Toolbar } from './FileBrowser/Toolbar'
import { ClipboardBanner } from './FileBrowser/ClipboardBanner'
import { FileTable } from './FileBrowser/FileTable'
import { TasksPanel } from './FileBrowser/TasksPanel'
import { DeleteConfirmModal } from './FileBrowser/Modals/DeleteConfirmModal'
import { RenameModal } from './FileBrowser/Modals/RenameModal'
import { NewFolderModal } from './FileBrowser/Modals/NewFolderModal'
import { PasteConfirmModal } from './FileBrowser/Modals/PasteConfirmModal'
import { QuickMountModal } from './FileBrowser/Modals/QuickMountModal'
import { SyncModal } from './FileBrowser/Modals/SyncModal'
import type { Remote, RcloneFile } from '../types'

interface FileBrowserTabProps {
  remotes: Remote[]
  selectedRemote: string
  setSelectedRemote: (val: string) => void
  currentPath: string
  setCurrentPath: (val: string) => void
  files: RcloneFile[]
  loadingFiles: boolean
  fetchFiles: (remote: string, path: string) => Promise<void>
  pathHistory: string[]
  setPathHistory: (val: string[]) => void
  projectRoot: string
  fuseSupported: boolean
  fuseDetails: string
  onQuickMount: (fs: string, mountPoint: string) => Promise<void>
}

export const FileBrowserTab: React.FC<FileBrowserTabProps> = (props) => {
  const {
    remotes,
    selectedRemote,
    setSelectedRemote,
    currentPath,
    loadingFiles,
    fuseSupported,
    fuseDetails
  } = props

  const {
    // State Variables
    contextMenu,
    setContextMenu,
    operationLoading,
    operationLabel,
    backgroundTasks,
    setBackgroundTasks,
    showTasksPanel,
    setShowTasksPanel,
    showDeleteModal,
    setShowDeleteModal,
    deleteTargets,
    setDeleteTargets,
    showRenameModal,
    setShowRenameModal,
    renameNewName,
    setRenameNewName,
    showNewFolderModal,
    setShowNewFolderModal,
    newFolderName,
    setNewFolderName,
    showPasteConfirm,
    setShowPasteConfirm,
    selectedFiles,
    setSelectedFiles,
    setLastSelectedIndex,
    clipboard,
    setClipboard,
    showQuickMountModal,
    setShowQuickMountModal,
    mountTargetFolder,
    mountLocalPath,
    setMountLocalPath,
    mounting,
    quickMountError,
    showLocalPicker,
    setShowLocalPicker,
    pickerMode,
    sortedFiles,
    sortCol,
    sortDir,
    handleSortChange,

    // Methods
    onBrowseLocalDirectory,
    triggerUploadPicker,
    handleLocalSelect,
    navigateUp,
    refreshCurrent,
    executeQuickMount,
    handleRowClick,
    handleRowDoubleClick,
    handleContextMenu,
    handleContainerContextMenu,
    handleCopy,
    handleCut,
    handlePaste,
    executePaste,
    executeRename,
    executeDelete,
    executeNewFolder,
    openQuickMountModal,
    handleOpen,
    handleDownload,
    showSyncModal,
    setShowSyncModal,
    syncTargetFolder,
    openSyncModal,
    executeSync
  } = useFileBrowser(props)

  return (
    <div 
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}
      onClick={() => {
        setSelectedFiles([])
        setLastSelectedIndex(null)
      }}
    >
      {/* Space-Saving Horizontal Toolbar */}
      <Toolbar
        remotes={remotes}
        selectedRemote={selectedRemote}
        setSelectedRemote={setSelectedRemote}
        currentPath={currentPath}
        navigateUp={navigateUp}
        refreshCurrent={refreshCurrent}
        loadingFiles={loadingFiles}
        onNewFolderClick={() => {
          setNewFolderName('')
          setShowNewFolderModal(true)
        }}
        onPasteClick={handlePaste}
        clipboard={clipboard}
      />

      {/* Clipboard Status Banner */}
      <ClipboardBanner
        clipboard={clipboard}
        onClear={() => setClipboard(null)}
      />

      {/* File Table / Grid */}
      <FileTable
        sortedFiles={sortedFiles}
        selectedFiles={selectedFiles}
        clipboard={clipboard}
        selectedRemote={selectedRemote}
        currentPath={currentPath}
        loadingFiles={loadingFiles}
        sortCol={sortCol}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
        onRowContextMenu={handleContextMenu}
        onContainerContextMenu={handleContainerContextMenu}
      />

      {/* Context Menu Component */}
      <FileManagerCM
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        selectedFiles={selectedFiles}
        hasClipboard={!!clipboard}
        onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
        onCopy={() => handleCopy(selectedFiles)}
        onCut={() => handleCut(selectedFiles)}
        onPaste={handlePaste}
        onRename={() => {
          if (selectedFiles.length === 1) {
            setRenameNewName(selectedFiles[0].Name)
            setShowRenameModal(true)
          }
        }}
        onDelete={() => {
          if (selectedFiles.length > 0) {
            setDeleteTargets(selectedFiles)
            setShowDeleteModal(true)
          }
        }}
        onNewFolder={() => {
          setNewFolderName('')
          setShowNewFolderModal(true)
        }}
        onMount={() => selectedFiles.length === 1 && openQuickMountModal(selectedFiles[0].Name)}
        onUpload={triggerUploadPicker}
        onOpen={handleOpen}
        onDownload={handleDownload}
        onSync={() => selectedFiles.length === 1 && selectedFiles[0].IsDir && openSyncModal(selectedFiles[0].Name)}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTargets.length > 0 && (
        <DeleteConfirmModal
          deleteTargets={deleteTargets}
          onCancel={() => {
            setShowDeleteModal(false)
            setDeleteTargets([])
          }}
          onConfirm={executeDelete}
        />
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <RenameModal
          renameNewName={renameNewName}
          setRenameNewName={setRenameNewName}
          onCancel={() => setShowRenameModal(false)}
          onConfirm={executeRename}
        />
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <NewFolderModal
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          onCancel={() => setShowNewFolderModal(false)}
          onConfirm={executeNewFolder}
        />
      )}

      {/* Paste / Move Confirmation Modal */}
      {showPasteConfirm && clipboard && (
        <PasteConfirmModal
          clipboard={clipboard}
          selectedRemote={selectedRemote}
          currentPath={currentPath}
          onCancel={() => setShowPasteConfirm(false)}
          onConfirm={executePaste}
        />
      )}

      {/* Quick Mount Modal Overlay */}
      {showQuickMountModal && (
        <QuickMountModal
          selectedRemote={selectedRemote}
          currentPath={currentPath}
          mountTargetFolder={mountTargetFolder}
          mountLocalPath={mountLocalPath}
          setMountLocalPath={setMountLocalPath}
          mounting={mounting}
          fuseSupported={fuseSupported}
          fuseDetails={fuseDetails}
          quickMountError={quickMountError}
          onBrowseLocalDirectory={onBrowseLocalDirectory}
          onCancel={() => setShowQuickMountModal(false)}
          onConfirm={executeQuickMount}
        />
      )}

      {/* Operation Loader Overlay */}
      {operationLoading && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="card" style={{ padding: '32px', textAlign: 'center', minWidth: '300px' }}>
            <RefreshCw size={32} className="spin-anim" style={{ color: 'var(--accent-cyan)', marginBottom: '16px' }} />
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{operationLabel}</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Please do not close the browser.</div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      {showSyncModal && (
        <SyncModal
          remotes={remotes}
          selectedRemote={selectedRemote}
          currentPath={currentPath}
          selectedFolder={syncTargetFolder}
          onCancel={() => setShowSyncModal(false)}
          onConfirm={executeSync}
        />
      )}

      {/* Background Tasks Floating Panel & badge */}
      <TasksPanel
        backgroundTasks={backgroundTasks}
        showTasksPanel={showTasksPanel}
        setShowTasksPanel={setShowTasksPanel}
        setBackgroundTasks={setBackgroundTasks}
      />

      <LocalFolderPicker 
        visible={showLocalPicker}
        onClose={() => setShowLocalPicker(false)}
        onSelect={handleLocalSelect}
        selectionMode={pickerMode}
        title={pickerMode === 'file' ? 'Select Local File to Upload' : (pickerMode === 'folder' ? 'Select Local Folder to Upload' : 'Select Local Item')}
      />
    </div>
  )
}

