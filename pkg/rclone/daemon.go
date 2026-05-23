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
	"path/filepath"
	"runtime"
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

func (d *Daemon) authPath() string {
	return filepath.Join(filepath.Dir(d.configPath), ".daemon_auth")
}

func (d *Daemon) Start() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.running {
		return nil
	}

	// 1. Try to Reconnect to an existing daemon
	if d.tryReconnect() {
		log.Printf("[Daemon] Successfully reconnected to existing daemon on 127.0.0.1:%d", d.port)
		return nil
	}

	// 2. Reconnect failed, but port might be busy. Kill it if so.
	d.killZombieOnPort()

	// 3. Ensure portable binary exists
	if _, err := os.Stat(d.rclonePath); os.IsNotExist(err) {
		log.Printf("[Daemon] Portable rclone binary not found at %s. Attempting auto-download...", d.rclonePath)
		d.mu.Unlock()
		downloadErr := DownloadAndInstallRclone(d.rclonePath)
		d.mu.Lock()
		if downloadErr != nil {
			if _, pathErr := exec.LookPath("rclone"); pathErr == nil {
				d.rclonePath = "rclone"
			} else {
				return fmt.Errorf("rclone binary missing and auto-download failed: %w", downloadErr)
			}
		}
	}

	// 3. Generate credentials
	userBuf := make([]byte, 16)
	passBuf := make([]byte, 32)
	rand.Read(userBuf)
	rand.Read(passBuf)
	d.rcUser = hex.EncodeToString(userBuf)
	d.rcPass = hex.EncodeToString(passBuf)

	// Save credentials for future reconnection
	authData, _ := json.Marshal(map[string]string{"user": d.rcUser, "pass": d.rcPass})
	_ = os.WriteFile(d.authPath(), authData, 0600)

	// 4. Start the process
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

	cmd := exec.Command(d.rclonePath, args...)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start rclone: %w", err)
	}

	d.cmd = cmd
	d.running = true
	log.Printf("[Daemon] Rclone daemon started on %s", addr)

	go d.scanStream(stdout, "Rclone-Out")
	go d.scanStream(stderr, "Rclone-Err")

	go func() {
		_ = cmd.Wait()
		d.mu.Lock()
		if d.cmd == cmd {
			d.running = false
			d.cmd = nil
		}
		d.mu.Unlock()
	}()

	return d.waitForPort(time.Second * 5)
}

func (d *Daemon) tryReconnect() bool {
	data, err := os.ReadFile(d.authPath())
	if err != nil {
		return false
	}

	var auth struct {
		User string `json:"user"`
		Pass string `json:"pass"`
	}
	if err := json.Unmarshal(data, &auth); err != nil {
		return false
	}

	// Ping the core/version endpoint
	url := fmt.Sprintf("http://127.0.0.1:%d/core/version", d.port)
	req, _ := http.NewRequest("POST", url, nil)
	req.SetBasicAuth(auth.User, auth.Pass)

	client := &http.Client{Timeout: 1 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		d.rcUser = auth.User
		d.rcPass = auth.Pass
		d.running = true
		return true
	}

	return false
}

func (d *Daemon) killZombieOnPort() {
	addr := fmt.Sprintf("127.0.0.1:%d", d.port)
	l, err := net.Listen("tcp", addr)
	if err == nil {
		l.Close()
		return // Port is free
	}

	log.Printf("[Daemon] Port %d is busy and we can't reconnect. Cleaning up...", d.port)
	
	// Linux/Mac solution
	_ = exec.Command("fuser", "-k", fmt.Sprintf("%d/tcp", d.port)).Run()
	
	// Windows fallback (if needed in future)
	if runtime.GOOS == "windows" {
		cmd := fmt.Sprintf("Stop-Process -Id (Get-NetTCPConnection -LocalPort %d).OwningProcess -Force", d.port)
		_ = exec.Command("powershell", "-Command", cmd).Run()
	}

	// Wait a moment for OS to release the socket
	time.Sleep(1 * time.Second)
}

func (d *Daemon) scanStream(r io.Reader, label string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "auth") || strings.Contains(line, "127.0.0.1") || strings.Contains(line, "Error") || strings.Contains(line, "link") {
			log.Printf("[%s] %s", label, line)
		}
		if u := extractURL(line); u != "" && (strings.Contains(u, "auth") || strings.Contains(u, "google") || strings.Contains(u, "authorize")) {
			d.mu.Lock()
			d.lastOAuthURL = u
			d.mu.Unlock()
		}
	}
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
