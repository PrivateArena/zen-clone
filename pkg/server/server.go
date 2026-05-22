package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strings"
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

	// 6. File server for UI assets (production fallback)
	s.registerUIHandler(mux)

	addr := fmt.Sprintf("127.0.0.1:%d", s.port)
	log.Printf("[Server] Server starting on %s", addr)
	return http.ListenAndServe(addr, mux)
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

	// Intercept mount requests to ensure the target mount directory exists
	if r.Method == http.MethodPost && r.URL.Path == "/mount/mount" {
		s.ensureMountPointExists(r)
	}

	s.proxy.ServeHTTP(w, r)
}

func (s *Server) ensureMountPointExists(r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return
	}
	// Restore body for proxy usage
	r.Body = io.NopCloser(bytes.NewBuffer(body))

	var payload struct {
		MountPoint string `json:"mountPoint"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return
	}

	if payload.MountPoint != "" {
		log.Printf("[Server] Auto-creating local mount point directory: %s", payload.MountPoint)
		if err := os.MkdirAll(payload.MountPoint, 0755); err != nil {
			log.Printf("[Server] Failed to create mount point directory: %v", err)
		}
	}
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
