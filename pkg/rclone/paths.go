package rclone

import (
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var (
	cachedBinaryDir string
	binaryDirOnce   sync.Once
)

// GetBinaryDir returns the directory containing the running executable.
// It detects and handles 'go run' scenarios by falling back to the CWD.
func GetBinaryDir() string {
	binaryDirOnce.Do(func() {
		exe, err := os.Executable()
		if err != nil {
			dir, _ := os.Getwd()
			cachedBinaryDir = dir
			return
		}

		dir := filepath.Dir(exe)

		// If running under 'go run' or Temp directories, use the current working directory.
		if strings.Contains(exe, "go-build") || strings.Contains(dir, "Temp") || strings.Contains(dir, "tmp") {
			dir, _ = os.Getwd()
		}

		cachedBinaryDir = dir
	})

	return cachedBinaryDir
}

var (
	cachedRcloneBin  string
	cachedConfigPath string
	cachedCacheDir   string
	pathsOnce        sync.Once
)

// GetPortablePaths returns resolved absolute paths for the portable suite.
func GetPortablePaths() (rcloneBin, configPath, cacheDir string) {
	pathsOnce.Do(func() {
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

		cachedRcloneBin = filepath.Join(binDir, binName)
		cachedConfigPath = filepath.Join(dataDir, "rclone.conf")
		cachedCacheDir = filepath.Join(dataDir, "cache")

		// Ensure cache dir exists
		_ = os.MkdirAll(cachedCacheDir, 0755)

		log.Printf("[Paths] Resolved portable config: %s", cachedConfigPath)
		log.Printf("[Paths] Resolved portable bin: %s", cachedRcloneBin)
	})

	return cachedRcloneBin, cachedConfigPath, cachedCacheDir
}
