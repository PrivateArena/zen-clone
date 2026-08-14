<!-- codegraph-file-count: 29, last-commit: d1e21aec104d0e6d6ad0d0b498719559af8b8467 -->
# zen-clone — Portable Rclone Desktop Companion

## Purpose
A single-binary desktop companion for rclone that wraps the rclone daemon in a local HTTP server and embeds a React UI for managing remotes, VFS mounts, and file operations (browse/copy/move/delete/sync) — no CLI required. Stack: Go backend (stdlib `net/http` only, no framework) + React 19/TypeScript frontend built with Vite.

## Architecture
```
Browser (React SPA) → localhost:51800 (Go HTTP server) → rclone daemon spawned on localhost:51900
                                                                      ↕
                                                              rclone binary (downloaded/supplied)
```

## File Tree
```
zen-clone/
├── main.go                          # Entry point: embeds UI, spawns rclone, starts HTTP server
├── go.mod
├── pkg/
│   ├── config/config.go             # App config from JSON file
│   └── rclone/
│       ├── daemon.go                # rclone child-process lifecycle (start/stop/reconnect/shutdown)
│       ├── downloader.go            # Download & install rclone binary per platform
│       └── paths.go                 # Portable path resolution (binary, config, cache dirs)
│   └── server/server.go             # HTTP API server (all route handlers + UI serving)
└── web/
    ├── package.json
    └── src/
        ├── main.tsx                 # React entry
        ├── App.tsx                  # Root component: tab routing + daemon status
        ├── types.ts                 # Shared TS interfaces: Remote, Mount, RcloneFile
        ├── hooks/
        │   ├── useFileBrowser.ts    # Core file-browser state machine (~788 lines)
        │   └── useRcloneStats.ts    # Polling hook for daemon stats
        └── components/
            ├── FileBrowserTab.tsx   # File explorer tab (browse/copy/move/delete/rename)
            ├── MountsTab.tsx        # VFS mount management tab
            ├── RemotesTab.tsx       # Remote configuration tab
            ├── Header.tsx           # Top bar: daemon status, port, rclone version
            ├── Sidebar.tsx          # Tab navigator + quick actions
            ├── LocalFolderPicker.tsx# Native folder picker (via GO backend proxy)
            ├── AddRemoteModal.tsx   # Add/configure new remote wizard
            ├── ContextMenu/
            │   └── FileManager_CM.tsx# Right-click context menu for files
            └── FileBrowser/
                ├── FileTable.tsx, Toolbar.tsx, TasksPanel.tsx, ClipboardBanner.tsx
                └── Modals/ (DeleteConfirm, Rename, NewFolder, PasteConfirm, QuickMount, Sync)
```

## Component Roles

### Backend (Go)

| File | Role | LOC | Key Exports (with signatures) |
|---|---|---|---|
| `main.go` | Entry point: embed UI, daemon init, server start, signal handling | ~61 | `main()` |
| `pkg/server/server.go` | HTTP API + static UI server; 12 route handlers | ~451 | `NewServer(port int, daemon *rclone.Daemon) *Server`; `(*Server) Start() error`; handlers for `/api/status`, `/api/browse`, `/api/localls`, `/api/mounts`, `/api/download`, `/api/oauth-url`, `/api/fusecheck`, `/api/proxy` |
| `pkg/rclone/daemon.go` | rclone child-process lifecycle management | ~349 | `NewDaemon(port int) *Daemon`; `(*Daemon) Start() error`, `Stop() error`, `Shutdown()`, `IsRunning() bool`, `Credentials() (string, string)`, `Port() int`, `RclonePath() string`, `LastOAuthURL() string`, `ClearOAuthURL()`, `tryReconnect() bool` |
| `pkg/rclone/downloader.go` | Download rclone binary for current OS/arch | ~100 | `GetDownloadURL() string`; `DownloadAndInstallRclone(targetPath string) error` |
| `pkg/rclone/paths.go` | Resolve portable directory paths for binary/config/cache | ~78 | `GetBinaryDir() string`; `GetPortablePaths() (rcloneBin, configPath, cacheDir string)` |
| `pkg/config/config.go` | Load persistent app config from JSON | ~66 | `LoadConfig() *AppConfig`; `GetConfig() *AppConfig` |

### Frontend (TypeScript/React)

| File | Role | LOC | Props / Hooks used |
|---|---|---|---|
| `web/src/main.tsx` | React DOM entry | ~10 | Renders `<App />` in StrictMode |
| `web/src/App.tsx` | Root: tab routing + daemon status polling + stats display | ~472 | `useFileBrowser`, `useRcloneStats` |
| `web/src/types.ts` | Shared type definitions | ~19 | Exports: `Remote`, `Mount`, `RcloneFile` interfaces |
| `web/src/hooks/useFileBrowser.ts` | File-browser state machine with background task tracking | ~788 | `useFileBrowser(props: UseFileBrowserProps): { ... }` — manages current path, file listing, clipboard, background tasks (copy/delete/move), polling |
| `web/src/hooks/useRcloneStats.ts` | Poll daemon stats endpoint periodically | ~50 | `useRcloneStats(active: boolean): RcloneStats \| null` |
| `web/src/components/FileBrowserTab.tsx` | File explorer main view | ~303 | Uses `useFileBrowser`, renders FileTable + Toolbar + TasksPanel + ClipboardBanner + modals |
| `web/src/components/MountsTab.tsx` | List/create/remove VFS mounts | ~186 | Fetches/renders mounts, triggers mount/unmount workflows |
| `web/src/components/RemotesTab.tsx` | List/create/edit/remove remotes | ~78 | Fetches/renders remotes; opens AddRemoteModal |
| `web/src/components/Header.tsx` | Top bar with daemon status indicator | ~188 | Displays rclone version, port, running status; OAuth URL display |
| `web/src/components/Sidebar.tsx` | Left sidebar tab navigation + quick actions | ~82 | Tab switching; quick-mount and open-local-folder buttons |
| `web/src/components/LocalFolderPicker.tsx` | Native folder picker via `/api/localls` proxy | ~188 | Opens modal, lists local drives/dirs, confirms selection |
| `web/src/components/AddRemoteModal.tsx` | Wizard UI for adding a new remote | ~119 | Form to configure remote name, type, details |
| `web/src/components/ContextMenu/FileManager_CM.tsx` | Right-click context menu for files | ~303 | Positioned menu: download, copy, paste, rename, delete, sync, quick-mount, properties |
| `web/src/components/FileBrowser/FileTable.tsx` | Sortable file listing table | ~182 | Renders file rows, row selection, double-click to enter dirs |
| `web/src/components/FileBrowser/Toolbar.tsx` | Path bar + action buttons | ~109 | Breadcrumb nav, new-folder/paste/refresh buttons |
| `web/src/components/FileBrowser/TasksPanel.tsx` | Background transfer progress panel | ~176 | Task list with progress bars, speed, ETA, cancel |
| `web/src/components/FileBrowser/ClipboardBanner.tsx` | Cut/copy clipboard state banner | ~46 | Shows source path; paste/cancel buttons |
| `web/src/components/FileBrowser/Modals/*.tsx` | 6 modal dialogs (delete, rename, new-folder, paste-confirm, quick-mount, sync) | ~38-109 each | Single-purpose forms with confirm/cancel |

## Cross-References

| File | Called by / calls | Why it's central |
|---|---|---|
| `pkg/rclone/daemon.go` | Called by `main.go`; calls `downloader.go` + `paths.go` | Sole rclone process manager — start/stop/shutdown/reconnect lifecycle |
| `pkg/server/server.go` | Called by `main.go`; calls `daemon.Credentials/IsRunning/Port/Stop/Start/LastOAuthURL` + `config.GetConfig` + `paths.GetPortablePaths`/`GetBinaryDir` | All 12 API routes and UI file serving live here |
| `pkg/rclone/paths.go` | Called by `daemon.go`, `server.go`, `downloader.go` | Portable path resolution shared across all backend modules |
| `pkg/rclone/downloader.go` | Called by `server.go` (FUSE check — auto-download) | Auto-install rclone binary on first run |
| `main.go` | Calls `daemon.NewDaemon`/`Start`/`Shutdown`, `server.NewServer`/`Start` | Wiring: assembly point for all backend services |

*Note: Frontend cross-file edges were not detected by codegraph (TSX files lack import-level indexing). The `useFileBrowser` hook alone is ~788 LOC and is consumed by `FileBrowserTab.tsx`; `App.tsx` orchestrates all top-level components.*

## Data Flow

```
User                    React SPA                Go HTTP Server              rclone daemon
 │                         │                           │                          │
 │   click/type/key        │                           │                          │
 ├────────────────────────►│                           │                          │
 │                         │  fetch /api/*             │                          │
 │                         ├──────────────────────────►│                          │
 │                         │                           │  rcd HTTP (localhost:51900)
 │                         │                           ├─────────────────────────►│
 │                         │                           │◄─────────────────────────┤
 │                         │  JSON response            │                          │
 │                         │◄──────────────────────────┤                          │
 │◄────────────────────────┤                           │                          │
 │                         │                           │                          │
 │                         │  static UI (/)            │                          │
 │                         │◄──────────────────────────┤                          │
```

*File operations (browse, copy, delete, move) are proxied through the Go server to the rclone daemon's HTTP control interface. Mounts go through native `rclone mount` spawned as subprocess of the daemon. Downloads stream through `handleDownload` proxy.*

## Key Architectural Patterns

1. **Single-binary embedded server**: The Go binary embeds the entire React SPA build via `//go:embed all:web/dist` so the app runs as a single portable executable with no external dependencies beyond `rclone` itself.

2. **rclone daemon wrapper**: `Daemon` struct encapsulates an `rclone rcd` child process — spawning, credential extraction (user/pass from stderr scanning), health checks (port listening), auto-reconnect on failure, and graceful shutdown with VFS unmount.

3. **Proxied rcd API**: The Go server does NOT rebuild rclone APIs; it proxies browser requests to rclone's internal HTTP control interface (`handleProxy`), supplemented with custom endpoints for local file browsing, OAuth URL passthrough, FUSE availability check, and native OS dialogs.

4. **Portable paths**: `GetPortablePaths()` resolves binary/config/cache paths relative to the executable location, enabling USB-drive operation. It detects `go run` scenarios and falls back to CWD.

5. **Background task state machine**: `useFileBrowser` hook manages an async operation queue (copy/move/delete) with progress tracking, ETA calculation, retry, and cancellation — all driven from the UI without server-side job persistence.

6. **Mount restore on startup**: `autoRestoreMounts()` in the server reads persisted mount config from a JSON file (`mounts.json`) and re-issues all mounts after startup, recovering the user's previous VFS state.

## Read Triggers

| If you need to... | Open these files |
|---|---|
| Add a new API route handler | `pkg/server/server.go` (add handler func + register in `Start`) |
| Change rclone daemon startup flags | `pkg/rclone/daemon.go` (`Start` method, cmd args) |
| Modify mount lifecycle logic | `pkg/rclone/daemon.go` (`Shutdown`, `killZombieOnPort`); `pkg/server/server.go` (`handleSaveMounts`, `autoRestoreMounts`) |
| Change portable path strategy | `pkg/rclone/paths.go` (`GetPortablePaths`, `GetBinaryDir`) |
| Modify file browser UI behavior | `web/src/hooks/useFileBrowser.ts` (core logic); `web/src/components/FileBrowserTab.tsx` (UI integration) |
| Add a new modal dialog | Use one of `web/src/components/FileBrowser/Modals/*.tsx` as template |
| Change rclone binary download/update | `pkg/rclone/downloader.go` (`GetDownloadURL`, `DownloadAndInstallRclone`) |
| Modify app config persistence | `pkg/config/config.go` (`AppConfig` struct, `LoadConfig`) |
| Change frontend build or dev config | `web/package.json` (scripts, deps); `web/vite.config.ts` (if present) |
| Implement cross-protocol file transfer | `web/src/hooks/useFileBrowser.ts` (background tasks); `pkg/server/server.go` (`handleProxy` for rclone operations) |

## Dependencies

### Backend (Go)
| Package | Role |
|---|---|
| `github.com/TheTitanrain/w32` | Windows API bindings (for native dialogs and windowing) |
| `github.com/sqweek/dialog` | Native OS dialog boxes (file picker, message boxes) |

*No other external Go dependencies — the server uses only stdlib `net/http`, `embed`, `os/exec`, etc.*

### Frontend (React/TypeScript)
| Package | Role |
|---|---|
| `react` / `react-dom` (v19) | UI framework |
| `lucide-react` | Icon library |
| `vite` (v8) | Build tool and dev server |

## Build & Run

| Command | Purpose |
|---|---|
| `(cd web && npm run dev)` | Frontend dev server with HMR |
| `(cd web && npm run build)` | Build production frontend into `web/dist` |
| `go build -o zen-clone .` | Build single production binary (embeds `web/dist`) |
| `go run .` | Dev run (uses disk assets from `web/dist` if present, otherwise embedded) |
| `(cd web && npm run lint)` | Lint frontend code |

*No Makefile — build pipeline is Go toolchain + npm scripts.*
