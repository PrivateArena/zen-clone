package rclone

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type Daemon struct {
	mu           sync.Mutex
	cmd          *exec.Cmd
	port         int
	rcUser       string
	rcPass       string
	running      bool
	configPath   string
	rclonePath   string
	cacheDir     string
	lastOAuthURL string
}

func NewDaemon(port int) *Daemon {
	rclonePath, configPath, cacheDir := GetPortablePaths()
	return &Daemon{
		port:       port,
		configPath: configPath,
		rclonePath: rclonePath,
		cacheDir:   cacheDir,
	}
}

func (d *Daemon) Credentials() (string, string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.rcUser, d.rcPass
}

func (d *Daemon) IsRunning() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.running
}

func (d *Daemon) RclonePath() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.rclonePath
}

func (d *Daemon) LastOAuthURL() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.lastOAuthURL
}

func (d *Daemon) ClearOAuthURL() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.lastOAuthURL = ""
}

func (d *Daemon) Start() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.running {
		return fmt.Errorf("daemon is already running")
	}

	// 1. Ensure portable binary exists; if not, download it automatically
	if _, err := os.Stat(d.rclonePath); os.IsNotExist(err) {
		log.Printf("[Daemon] Portable rclone binary not found at %s. Attempting auto-download...", d.rclonePath)
		// Release lock during download to avoid blocking other status requests
		d.mu.Unlock()
		downloadErr := DownloadAndInstallRclone(d.rclonePath)
		d.mu.Lock()
		if downloadErr != nil {
			if _, pathErr := exec.LookPath("rclone"); pathErr == nil {
				log.Println("[Daemon] Download failed; falling back to system path 'rclone'")
				d.rclonePath = "rclone"
			} else {
				return fmt.Errorf("rclone binary missing and auto-download failed: %w", downloadErr)
			}
		}
	}

	// 2. Generate strong, ephemeral credentials for the session
	userBuf := make([]byte, 16)
	passBuf := make([]byte, 32)
	if _, err := rand.Read(userBuf); err != nil {
		return fmt.Errorf("failed to generate rc-user: %w", err)
	}
	if _, err := rand.Read(passBuf); err != nil {
		return fmt.Errorf("failed to generate rc-pass: %w", err)
	}
	d.rcUser = hex.EncodeToString(userBuf)
	d.rcPass = hex.EncodeToString(passBuf)

	// Clear previous OAuth URL
	d.lastOAuthURL = ""

	// 3. Build the rclone command arguments
	addr := fmt.Sprintf("127.0.0.1:%d", d.port)
	args := []string{
		"rcd",
		"--rc-addr", addr,
		"--rc-user", d.rcUser,
		"--rc-pass", d.rcPass,
		"--rc-no-auth=false",
		"--rc-serve",
		"--config", d.configPath,
		"--cache-dir", d.cacheDir,
	}

	// 4. Start the process
	cmd := exec.Command(d.rclonePath, args...)

	// Pipe stdout and stderr to capture interactive authorization URLs
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to pipe stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to pipe stderr: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start rclone: %w", err)
	}

	d.cmd = cmd
	d.running = true
	log.Printf("[Daemon] Rclone daemon started on %s", addr)

	// Stream log readers
	scanStream := func(r io.Reader, label string) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()
			// Only output logs containing config/auth info or errors to keep output neat
			if strings.Contains(line, "auth") || strings.Contains(line, "127.0.0.1") || strings.Contains(line, "Error") || strings.Contains(line, "link") {
				log.Printf("[%s] %s", label, line)
			}
			
			// Detect authentication link
			if strings.Contains(line, "127.0.0.1:53682/auth") || strings.Contains(line, "accounts.google.com") || strings.Contains(line, "login.microsoftonline.com") || strings.Contains(line, "http://") || strings.Contains(line, "https://") {
				u := extractURL(line)
				if u != "" && (strings.Contains(u, "53682") || strings.Contains(u, "auth") || strings.Contains(u, "google") || strings.Contains(u, "microsoft") || strings.Contains(u, "authorize")) {
					d.mu.Lock()
					d.lastOAuthURL = u
					d.mu.Unlock()
					log.Printf("[Daemon] Captured OAuth authorization URL: %s", u)
				}
			}
		}
	}

	go scanStream(stdout, "Rclone-Out")
	go scanStream(stderr, "Rclone-Err")

	// Background goroutine to monitor process exit
	go func() {
		err := cmd.Wait()
		d.mu.Lock()
		d.running = false
		d.cmd = nil
		d.mu.Unlock()
		if err != nil {
			log.Printf("[Daemon] Rclone daemon exited with error: %v", err)
		} else {
			log.Printf("[Daemon] Rclone daemon exited cleanly")
		}
	}()

	// 5. Wait for the port to open
	if err := d.waitForPort(time.Second * 5); err != nil {
		_ = d.stopProcess()
		return fmt.Errorf("timeout waiting for rclone port: %w", err)
	}

	return nil
}

func (d *Daemon) Stop() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.stopProcess()
}

// Shutdown attempts to unmount all active VFS mounts before killing the daemon
func (d *Daemon) Shutdown() {
	log.Println("[Daemon] Initiating graceful shutdown...")

	d.mu.Lock()
	if !d.running {
		d.mu.Unlock()
		return
	}
	user, pass := d.rcUser, d.rcPass
	port := d.port
	d.mu.Unlock()

	// 1. Get list of all mounts via RC
	mountsUrl := fmt.Sprintf("http://127.0.0.1:%d/mount/listmounts", port)
	req, _ := http.NewRequest("POST", mountsUrl, nil)
	req.SetBasicAuth(user, pass)

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		var result struct {
			MountPoints []struct {
				MountPoint string `json:"MountPoint"`
			} `json:"mountPoints"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
			for _, m := range result.MountPoints {
				log.Printf("[Daemon] Force unmounting: %s", m.MountPoint)
				unmountUrl := fmt.Sprintf("http://127.0.0.1:%d/mount/unmount", port)
				unmountPayload, _ := json.Marshal(map[string]string{"mountPoint": m.MountPoint})
				uReq, _ := http.NewRequest("POST", unmountUrl, bytes.NewBuffer(unmountPayload))
				uReq.SetBasicAuth(user, pass)
				uReq.Header.Set("Content-Type", "application/json")
				_, _ = client.Do(uReq)
			}
		}
	}

	// 2. Finally stop the process
	_ = d.Stop()
}

func (d *Daemon) stopProcess() error {
	if !d.running || d.cmd == nil {
		return nil
	}

	if err := d.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("failed to kill rclone process: %w", err)
	}

	d.running = false
	d.cmd = nil
	return nil
}

func (d *Daemon) waitForPort(timeout time.Duration) error {
	addr := fmt.Sprintf("127.0.0.1:%d", d.port)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, time.Millisecond*200)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(time.Millisecond * 100)
	}
	return fmt.Errorf("port did not open")
}

// extractURL extracts the first http:// or https:// URL found in the string.
func extractURL(line string) string {
	idx := strings.Index(line, "http://")
	if idx == -1 {
		idx = strings.Index(line, "https://")
	}
	if idx == -1 {
		return ""
	}

	sub := line[idx:]
	end := len(sub)
	for i, char := range sub {
		if char == ' ' || char == '\t' || char == '\n' || char == '\r' || char == '"' || char == '\'' || char == '`' || char == '<' || char == '>' || char == '(' || char == ')' {
			end = i
			break
		}
	}
	return sub[:end]
}
