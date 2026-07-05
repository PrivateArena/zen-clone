PROJECT OVERVIEW
================

PROJECT PURPOSE
---------------
zen-clone is a Go desktop application that provides a web-based GUI for managing rclone.
It embeds a React frontend (web/src) inside a Go binary, exposing an HTTP API for
mount management, remote configuration, file browsing, and OAuth flows, while controlling
a local rclone daemon.

ARCHITECTURE DIAGRAM
--------------------
main.go
  |
  +-- pkg/config/
  |     +-- config.go        AppConfig, LoadConfig, GetConfig
  |
  +-- pkg/rclone/
  |     +-- daemon.go        Daemon (start/stop/stopProcess/tryReconnect/shutdown)
  |     +-- downloader.go    GetDownloadURL, DownloadAndInstallRclone
  |     +-- paths.go         GetBinaryDir, GetPortablePaths
  |
  +-- pkg/server/
  |     +-- server.go        Server, SavedMount, NewServer, Start, handle*
  |
  +-- web/src/               (served as embedded UI assets)
        +-- main.tsx         bootstrap
        +-- App.tsx          root layout
        +-- types.ts         Remote, Mount, RcloneFile
        +-- hooks/
        |     +-- useFileBrowser.ts   file listing, clipboard, tasks
        |     +-- useRcloneStats.ts   stats polling
        +-- components/
              +-- FileBrowser/       file table, toolbar, tasks panel
              +-- FileBrowser/Modals/ CRUD modals
              +-- ContextMenu/       right-click menu
              +-- Header, Sidebar, LocalFolderPicker, RemotesTab, MountsTab
              +-- AddRemoteModal

COMPONENT DIRECTORIES AND KEY EXPORTS
--------------------------------------

pkg/config/
  Role: Persistent configuration loader.
  Key exports: AppConfig (struct), LoadConfig, GetConfig.
  Stores app-level settings consumed by the server and daemon initializers.

pkg/rclone/
  Role: rclone binary resolution, daemon lifecycle, and download/install logic.
  Key exports:
    Daemon (struct) with Start, Stop, Shutdown, tryReconnect, scanStream
    GetBinaryDir, GetPortablePaths
    DownloadAndInstallRclone, GetDownloadURL
  Owns managing the rclone process and its JSON stream output.

pkg/server/
  Role: HTTP server that (a) serves the embedded web UI and (b) exposes JSON handlers
  for local directory listing, mounts persistence, status, proxying rclone endpoints,
  OAuth URL relay, Fuse checking, and download dispatch.
  Key exports:
    Server (struct), SavedMount
    NewServer, Start
    handleLocalLs, handleBrowseDirectory, handleSaveMounts, handleLoadMounts
    autoRestoreMounts, handleStatus, handleDownload, handleOAuthURL, handleFuseCheck
    handleProxy, prepareMountRequest, registerUIHandler, getUIFS

web/src/
  Role: React SPA UI served by Go.
  Key exports:
    App, Sidebar, Header, RemotesTab, MountsTab, AddRemoteModal
    FileBrowserTab, LocalFolderPicker, ClipboardBanner, TasksPanel, FileTable, Toolbar
    Modals: DeleteConfirmModal, NewFolderModal, PasteConfirmModal, QuickMountModal, RenameModal, SyncModal
    ContextMenu (FileManager_CM)
  Hooks: useFileBrowser (dominant state machine for files, clipboard, transfers), useRcloneStats
  Types: Remote, Mount, RcloneFile

KEY ARCHITECTURAL PATTERNS
---------------------------
- Embedded web assets: the frontend is embedded into the Go binary and served via the server's
  HTTP filesystem, remaining self-contained.
- Process supervisor: Daemon wraps a child rclone process with stream scanning and reconnect logic.
- Mount persistence: SavedMount is serialized by the server for auto-restore across restarts.
- Thin API layer: dedicated handle* methods map to browser actions (listing, mounting, OAuth).
- React client state is confined to hooks and UI components, with the Go backend acting as the
  authoritative state for mounts and daemon health.

HOW COMPONENTS CONNECT
-----------------------
main.go wires the flow:
  1) LoadConfig (pkg/config) -> reads app settings.
  2) NewDaemon (pkg/rclone) -> constructs the daemon controller.
  3) NewServer (pkg/server) -> constructs the HTTP server, registers UI handler with the
     embedded web assets, binds rclone daemon actions into routes.
  4) Start daemon and server.

Browser -> Server HTTP API -> Server handler -> pkg/rclone Daemon -> rclone binary.
Server also auto-restores mounts from SavedMount and serves static UI files via getUIFS.
