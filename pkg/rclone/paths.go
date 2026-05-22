package rclone

import (
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// GetBinaryDir returns the directory containing the running executable.
// It detects and handles 'go run' scenarios by falling back to the CWD.
func GetBinaryDir() string {
	exe, err := os.Executable()
	if err != nil {
		dir, _ := os.Getwd()
		return dir
	}

	dir := filepath.Dir(exe)

	// If running under 'go run' or Temp directories, use the current working directory.
	if strings.Contains(exe, "go-build") || strings.Contains(dir, "Temp") || strings.Contains(dir, "tmp") {
		dir, _ = os.Getwd()
	}

	return dir
}

// GetPortablePaths returns resolved absolute paths for the portable suite.
func GetPortablePaths() (rcloneBin, configPath, cacheDir string) {
	baseDir := GetBinaryDir()

	binDir := filepath.Join(baseDir, "bin")
	dataDir := filepath.Join(baseDir, "data")

	// Ensure directories exist
	_ = os.MkdirAll(binDir, 0755)
	_ = os.MkdirAll(dataDir, 0755)

	binName := "rclone"
	if runtime.GOOS == "windows" {
		binName = "rclone.exe"
	}

	rcloneBin = filepath.Join(binDir, binName)
	configPath = filepath.Join(dataDir, "rclone.conf")
	cacheDir = filepath.Join(dataDir, "cache")

	// Ensure cache dir exists
	_ = os.MkdirAll(cacheDir, 0755)

	log.Printf("[Paths] Resolved portable config: %s", configPath)
	log.Printf("[Paths] Resolved portable bin: %s", rcloneBin)

	return rcloneBin, configPath, cacheDir
}
