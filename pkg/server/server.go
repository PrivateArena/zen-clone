package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"zen-clone/pkg/config"
	"zen-clone/pkg/rclone"
)

type Server struct {
	daemon *rclone.Daemon
	port   int
	proxy  *httputil.ReverseProxy
}

func NewServer(port int, daemon *rclone.Daemon) *Server {
	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:51900"))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Optimize proxy transport for long-running rclone operations
	proxy.Transport = &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		MaxIdleConnsPerHost:   20, // Critical for high-concurrency with the daemon
	}

	// Custom Director to inject credentials on the fly
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		u, p := daemon.Credentials()
		req.SetBasicAuth(u, p)
		// Ensure host header matches the target
		req.Host = targetURL.Host
	}

	return &Server{
		daemon: daemon,
		port:   port,
		proxy:  proxy,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	// 1. Status check endpoint
	mux.HandleFunc("/api/status", s.handleStatus)

	// 2. FUSE capability check endpoint
	mux.HandleFunc("/api/fuse-check", s.handleFuseCheck)

	// 3. Proxy all other rclone requests securely
	mux.HandleFunc("/api/rclone/", s.handleProxy)

	// 4. Download / update rclone endpoint
	mux.HandleFunc("/api/rclone-download", s.handleDownload)

	// 5. Get last captured OAuth URL endpoint
	mux.HandleFunc("/api/oauth-url", s.handleOAuthURL)

	// 6. Browse local directory (Web-based)
	mux.HandleFunc("/api/local/ls", s.handleLocalLs)

	// 7. File server for UI assets (production fallback)
	s.registerUIHandler(mux)

	addr := fmt.Sprintf("127.0.0.1:%d", s.port)
	log.Printf("[Server] Server starting on %s", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) handleLocalLs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	path := r.URL.Query().Get("path")
	if path == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			path = "/"
		} else {
			path = home
		}
	}

	// Clean path to prevent traversal/obvious issues, though this is a local tool
	path = filepath.Clean(path)

	entries, err := os.ReadDir(path)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	type Entry struct {
		Name  string `json:"name"`
		IsDir bool   `json:"is_dir"`
	}

	var items []Entry
	// Add ".." if not at root
	parent := filepath.Dir(path)
	if parent != path {
		items = append(items, Entry{Name: "..", IsDir: true})
	}

	for _, entry := range entries {
		items = append(items, Entry{
			Name:  entry.Name(),
			IsDir: entry.IsDir(),
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"path":    path,
		"dirs":    items, // Keeping the key name "dirs" for frontend compatibility, but it now contains files too
	})
}

func (s *Server) handleBrowseDirectory(w http.ResponseWriter, r *http.Request) {
	// Deprecated in favor of /api/local/ls web picker to avoid CGO/GTK crashes
	w.WriteHeader(http.StatusGone)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	rcloneBin, configPath, _ := rclone.GetPortablePaths()
	_, binErr := os.Stat(rcloneBin)
	projectRoot := rclone.GetBinaryDir()

	status := map[string]interface{}{
		"running":         s.daemon.IsRunning(),
		"portable_bin":    rcloneBin,
		"portable_config": configPath,
		"bin_exists":      binErr == nil,
		"project_root":    projectRoot,
	}

	json.NewEncoder(w).Encode(status)
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	rcloneBin := s.daemon.RclonePath()
	log.Printf("[Server] Triggering manual rclone download and daemon restart...")

	// If running, stop daemon to avoid lock issues
	if s.daemon.IsRunning() {
		_ = s.daemon.Stop()
	}

	err := rclone.DownloadAndInstallRclone(rcloneBin)
	if err != nil {
		log.Printf("[Server] Portable download failed: %v", err)
		http.Error(w, fmt.Sprintf("Download failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Restart daemon
	if err := s.daemon.Start(); err != nil {
		log.Printf("[Server] Restarting daemon failed: %v", err)
		http.Error(w, fmt.Sprintf("Rclone downloaded but daemon failed to restart: %v", err), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Rclone updated and started successfully in portable mode.",
	})
}

func (s *Server) handleOAuthURL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method == http.MethodDelete || (r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/clear")) {
		s.daemon.ClearOAuthURL()
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
		return
	}

	urlStr := s.daemon.LastOAuthURL()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"url": urlStr,
	})
}

func (s *Server) handleFuseCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var hasFuse bool
	var message string

	// Linux check
	if _, err := exec.LookPath("fusermount"); err == nil {
		hasFuse = true
		message = "fusermount binary found"
	} else if _, err := exec.LookPath("fusermount3"); err == nil {
		hasFuse = true
		message = "fusermount3 binary found"
	} else {
		cmd := exec.Command("sh", "-c", "mount | grep -i fuse")
		if err := cmd.Run(); err == nil {
			hasFuse = true
			message = "FUSE mounts detected in environment"
		} else {
			hasFuse = false
			message = "FUSE driver not found. Please install fuse or WinFsp."
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"supported": hasFuse,
		"details":   message,
	})
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Allow-Methods", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.daemon.IsRunning() {
		http.Error(w, "Rclone daemon is not running", http.StatusServiceUnavailable)
		return
	}

	r.URL.Path = strings.TrimPrefix(r.URL.Path, "/api/rclone")
	if r.URL.Path == "" {
		r.URL.Path = "/"
	}

	// Intercept mount requests to inject defaults and ensure target directory exists
	if r.Method == http.MethodPost && r.URL.Path == "/mount/mount" {
		s.prepareMountRequest(r)
	}

	s.proxy.ServeHTTP(w, r)
}

func (s *Server) prepareMountRequest(r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		r.Body = io.NopCloser(bytes.NewBuffer(body))
		return
	}

	// 1. Ensure local mount point directory exists
	if mountPoint, ok := payload["mountPoint"].(string); ok && mountPoint != "" {
		log.Printf("[Server] Auto-creating local mount point directory: %s", mountPoint)
		if err := os.MkdirAll(mountPoint, 0755); err != nil {
			log.Printf("[Server] Failed to create mount point directory: %v", err)
		}
	}

	// 2. Inject default vfsOpt from config if not present or partially present
	appCfg := config.GetConfig()
	
	vfsOpt, ok := payload["vfsOpt"].(map[string]interface{})
	if !ok {
		vfsOpt = make(map[string]interface{})
	}

	// Merge defaults: config.json values are used if key is missing in request
	for k, v := range appCfg.VFSOpt {
		if _, exists := vfsOpt[k]; !exists {
			vfsOpt[k] = v
		}
	}
	payload["vfsOpt"] = vfsOpt

	// Re-marshal the modified payload
	newBody, err := json.Marshal(payload)
	if err != nil {
		r.Body = io.NopCloser(bytes.NewBuffer(body))
		return
	}

	r.Body = io.NopCloser(bytes.NewBuffer(newBody))
	r.ContentLength = int64(len(newBody))
	r.Header.Set("Content-Length", fmt.Sprint(len(newBody)))
}

func (s *Server) registerUIHandler(mux *http.ServeMux) {
	uiFS := s.getUIFS()
	fileServer := http.FileServer(uiFS)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			return
		}

		f, err := uiFS.Open(strings.TrimPrefix(r.URL.Path, "/"))
		if err != nil {
			r.URL.Path = "/"
		} else {
			f.Close()
		}

		fileServer.ServeHTTP(w, r)
	})
}

var WebAssetsFS io.ReaderAt
var UIFileSystem http.FileSystem

func (s *Server) getUIFS() http.FileSystem {
	if UIFileSystem != nil {
		return UIFileSystem
	}
	return http.Dir("web/dist")
}
