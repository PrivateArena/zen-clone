# ZEN-CLONE — Architecture Overview & Improvement Proposals

> **Stack:** Go (backend) · React/TypeScript + Vite (frontend) · rclone RC API (engine)  
> **Mode:** Portable suite — ships its own `rclone` binary + config under `./bin/` and `./data/`

---

## 1. Current Architecture

### 1.1 Process Topology

```
User Browser
    │  HTTP :51800
    ▼
┌──────────────────────────────┐
│  Go Web Server  (pkg/server) │  ← serves embedded Vite SPA
│  • /api/status               │
│  • /api/fuse-check           │
│  • /api/oauth-url            │
│  • /api/rclone-download      │
│  • /api/local/ls             │
│  • /api/rclone/*  ──────────────────────────────────┐
└──────────────────────────────┘                       │ HTTP reverse proxy
                                                       ▼
                                          ┌────────────────────────┐
                                          │  rclone rcd  :51900    │
                                          │  (RC daemon)           │
                                          │  --rc-serve            │
                                          │  --fast-list           │
                                          │  --transfers 8         │
                                          │  --checkers 16         │
                                          │  --buffer-size 128M    │
                                          │  --use-mmap            │
                                          └────────────────────────┘
```

### 1.2 Go Backend (`pkg/`)

| Package | File | Responsibility |
|---------|------|----------------|
| `rclone` | `daemon.go` | Spawn/reconnect/kill rclone RC process; credential rotation; OAuth URL scraping from stderr |
| `rclone` | `downloader.go` | Auto-download correct rclone binary for the current OS/arch |
| `rclone` | `paths.go` | Resolve portable `./bin/rclone` and `./data/rclone.conf` paths |
| `server` | `server.go` | HTTP mux; reverse-proxy to RC daemon; mount request augmentation; FUSE detection |
| `config` | `config.go` | Read `./data/config.json`; merge VFS defaults into mount requests |

**Key behaviours:**
- **Daemon reconnect:** On startup, reads `.daemon_auth` and pings `/core/version`. If alive, reuses the process.
- **Zombie cleanup:** `fuser -k <port>/tcp` before spawning a fresh daemon.
- **Mount augmentation (`prepareMountRequest`):** Injects `vfsOpt` defaults (cacheMode, bufferSize, readChunkSize) and auto-`mkdir`s the mount point.
- **Graceful shutdown:** Lists all mounts via RC, unmounts each before `SIGKILL`.

### 1.3 Frontend (`web/src/`)

Three tabs rendered inside a collapsible sidebar layout:

#### Storage Accounts (`RemotesTab`)
- Lists remotes from `config/dump`
- Add remote via `config/create` (supports Drive, OneDrive, S3, …)
- OAuth flow: polls `/api/oauth-url` every 1 s, surfaces the link to the user
- Delete remote via `config/delete`

#### Active Mounts (`MountsTab`)
- Form: account selector → optional remote sub-path → local mount point (with local folder picker)
- Calls `mount/mount` (augmented by backend with VFS defaults)
- Lists active mounts from `mount/listmounts`; unmount via `mount/unmount`

#### File Browser (`FileBrowserTab` + `useFileBrowser` hook)
- Directory listing via `operations/list`
- **Multi-select:** click, Ctrl+click, Shift+click range
- **Keyboard shortcuts:** Del/Backspace → delete, F2 → rename, N → new folder, Ctrl+C/X/V → copy/cut/paste
- **Clipboard system:** cross-remote copy/move (files via `operations/copyfile`/`movefile`; folders via `sync/copy`/`sync/move`)
- **Background tasks panel:** floating badge with simulated progress bar (polling interval)
- **Upload:** local file via `operations/copyfile`; local folder via `sync/copy`
- **Quick Mount from Browser:** right-click a cloud folder → mount it inline via `mount/mount`
- **Context menu:** copy, cut, paste, rename, delete, new folder, mount, upload
- **Sort:** folders-first, then natural-sort by name

### 1.4 Config Schema (`data/config.json`)

```json
{
  "vfsOpt": {
    "cacheMode": "off",
    "bufferSize": "128M",
    "readChunkSize": "32M",
    "readChunkSizeLimit": "512M"
  }
}
```

---

## 2. What Is Currently Missing / Under-Implemented

### 2.1 Mount — VFS Cache (biggest gap)

| Current | Gap |
|---------|-----|
| `cacheMode: "off"` hardcoded as default | `"full"` cache mode enables write-back, random-access reads, and reliable FUSE behaviour for most apps |
| No UI to change cache mode | Users cannot tune `--vfs-cache-mode` per-mount |
| No cache size/TTL controls | `--vfs-cache-max-size`, `--vfs-cache-max-age` never exposed |
| No poll-interval control | `--poll-interval` for change detection not exposed |

**Impact:** Mounts break for apps that use random-access reads (e.g. video players, SQLite, Office). Setting `cacheMode: "minimal"` or `"full"` fixes this for most use cases.

### 2.2 Mount — No Persist / Auto-Mount on Startup

There is no persistence layer for mounts. Every app restart requires the user to re-create mounts manually. Rclone supports `--rc-allow-origin` and the RC `mount/mount` can be re-issued on startup; the daemon could read a `mounts.json` sidecar and re-mount automatically.

### 2.3 Transfer Operations — No Real Progress

`BackgroundTask.progress` is a fake timer increment (`+15` every 800 ms), capped at 90%. Rclone RC exposes **real** job stats:

- `job/list` → lists running jobs with job ID
- `job/status?jobid=N` → returns `{ finished, success, error, stats: { bytes, totalBytes, transferring } }`
- `core/stats` → aggregate transfer bytes/speed/ETA

The frontend never calls these. Users see a fake bar and no ETA or speed.

### 2.4 Sync / Bisync — Not Exposed

Rclone's most powerful feature — `sync/sync` and `sync/bisync` — are entirely absent from the UI. Only file-level copy/move exists. There is no way to keep a local folder in sync with a cloud folder bidirectionally.

### 2.5 Remote Configuration — Minimal Type Support

`AddRemoteModal` hard-codes a short list of types (Drive, OneDrive, S3, …) with no per-type parameter fields. Rclone RC exposes `config/providers` and `config/optionblocks` which describe every provider's parameters with types, help text, and defaults. The current modal just sends `parameters: {}` and relies entirely on rclone's interactive OAuth flow.

**Missing:**
- Provider-specific required fields (e.g. S3 access key, bucket, region)
- Non-OAuth providers (SFTP, FTP, WebDAV, local, SMB) need credential fields, not a browser URL
- No edit-remote support (`config/update`)

### 2.6 File Browser — No Search / Filter

`operations/list` is called per-directory. Rclone supports:

- `operations/list` with `opt: { recurse: true, filesOnly: true }` for recursive listing
- No search UI exists; files can only be found by navigating folders manually

### 2.7 File Browser — No Preview / Streaming

Rclone RC has `--rc-serve` enabled (already set in daemon args), which means it serves files at `http://127.0.0.1:51900/[remote]/[path]`. The UI never uses this. Image thumbnails, audio preview, video streaming, and direct-download links are all achievable without any additional backend code.

### 2.8 File Browser — Column Sort

The file table has Name/Size/Modified/Type columns but **none are sortable**. Clicking column headers does nothing.

### 2.9 Bandwidth / Scheduler — Not Exposed

Rclone RC supports:
- `core/bwlimit` — set upload/download speed limits at runtime
- `scheduler` — not in RC, but `--bwlimit-file` and scheduled jobs could be wired up

No throttling UI exists, which matters for users on metered connections.

### 2.10 Mount Advanced Options — Not Exposed

Fields available in `mount/mount` payload but never surfaced:

| Option | Default | Use |
|--------|---------|-----|
| `mountOpt.AllowOther` | false | Let other users access the mount |
| `mountOpt.AllowRoot` | false | Allow root access |
| `mountOpt.ReadOnly` | false | Read-only mount for safety |
| `mountOpt.VolumeName` | — | Drive label on Windows |
| `mountOpt.NetworkMode` | false | Windows network drive mode |
| `vfsOpt.DirCacheTime` | 5m | How long to cache directory listings |
| `vfsOpt.NoModTime` | false | Skip mod-time updates (perf) |

### 2.11 No Multi-Remote / Aggregate Operations

Rclone supports union/overlay backends and operations between two different remotes. The clipboard system already handles cross-remote copy/move, but there is no UI for:
- Comparing two remote directories (`check` / `cryptcheck`)
- Showing transfer diffs before syncing

---

## 3. Proposed Improvements (Priority Order)

### P0 — Critical Fixes

#### 3.1 VFS Cache Mode UI
Add a "Mount Options" accordion to `MountsTab` with:
- `cacheMode` select: `off | minimal | writes | full`
- `cacheSizeLimit` input (e.g. "2G")
- `cacheMaxAge` input (e.g. "24h")
- Persist per-remote preference in `config.json`

#### 3.2 Real Transfer Progress
- After `startBackgroundTask`, capture the job ID returned by RC (all async RC operations return `{ jobid: N }`)
- Poll `job/status?jobid=N` every 1 s; map `bytes/totalBytes` to progress bar; show speed + ETA
- Stop polling when `finished: true`

#### 3.3 Mount Persistence (Auto-Remount)
- Write active mounts to `./data/mounts.json` on each mount/unmount
- On daemon `Start()`, read `mounts.json` and re-issue `mount/mount` for each entry
- Add a toggle in the UI: "Remount on startup"

### P1 — High Value

#### 3.4 Sync UI (`sync/sync` + `sync/bisync`)
- Add a "Sync" button in the file browser toolbar
- Show a diff preview using `check` endpoint before committing
- Background task with real job progress

#### 3.5 Rich Remote Configuration
- Fetch provider list from `config/providers` on modal open
- Render per-provider parameter schema from `config/optionblocks`
- Support edit-remote (`config/update`)
- SFTP/FTP/WebDAV credential forms (no OAuth)

#### 3.6 File Preview via `--rc-serve`
- Proxy image/video/audio files through `http://127.0.0.1:51900/{remote}/{path}`
- Show inline image thumbnail in file table (icon column)
- Preview panel slide-in for media files on single-click
- Direct download link button in context menu

### P2 — Nice to Have

#### 3.7 Sortable Columns
- Add sort state `{ col: 'name' | 'size' | 'modified', dir: 'asc' | 'desc' }` to `useFileBrowser`
- Wire `useMemo` sort to this state; clicking headers toggles direction

#### 3.8 Recursive Search / Filter
- Toolbar search input; on submit call `operations/list` with `{ recurse: true, filesOnly: true, maxDepth: 10 }`
- Debounce and show results in a flat list mode

#### 3.9 Bandwidth Throttle Panel
- Header control (or settings page) with a speed limit slider
- On change, POST to `core/bwlimit` with `{ rate: "N M" }` 
- Show current speed from `core/stats` in header

#### 3.10 Mount Advanced Options Panel
- Expandable "Advanced" section in the mount form
- Checkboxes for ReadOnly, AllowOther; input for VolumeName
- DirCacheTime and NoModTime toggles

#### 3.11 `core/stats` Transfer Dashboard
- Small stats bar in header (or dedicated Stats tab)
- Show: active transfers count, total bytes transferred, current speed
- Auto-refreshes via `core/stats` poll every 2 s when tasks are running

---

## 4. Rclone RC Endpoints — Currently Unused

| Endpoint | What It Enables |
|----------|----------------|
| `job/list` | Real job IDs for background task tracking |
| `job/status` | Real progress: bytes, speed, ETA, errors |
| `core/stats` | Global transfer throughput dashboard |
| `core/bwlimit` | Runtime bandwidth throttle |
| `sync/sync` | One-way directory sync |
| `sync/bisync` | Bidirectional sync |
| `operations/check` | Diff two remotes before syncing |
| `config/providers` | Full provider list for rich add-remote form |
| `config/optionblocks` | Per-provider parameter schema |
| `config/update` | Edit existing remote credentials |
| `config/setpath` | Switch active config file at runtime |
| `rc/noop` | Health check / latency probe |
| `vfs/refresh` | Force VFS dir cache refresh for a mount |
| `vfs/stats` | VFS cache hit rates per mount |
| `mount/types` | List available FUSE backends |
| `backend/command` | Provider-specific commands (e.g. Drive `emptytrash`) |
