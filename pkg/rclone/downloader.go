package rclone

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

// GetDownloadURL constructs the correct download URL for the current system.
func GetDownloadURL() string {
	goos := runtime.GOOS
	if goos == "darwin" {
		goos = "osx"
	}
	return fmt.Sprintf("https://downloads.rclone.org/rclone-current-%s-%s.zip", goos, runtime.GOARCH)
}

// DownloadAndInstallRclone downloads the current rclone version zip,
// extracts the main binary, and writes it to the designated path.
func DownloadAndInstallRclone(targetPath string) error {
	url := GetDownloadURL()
	log.Printf("[Downloader] Starting download from %s", url)

	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to fetch download package: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	// Read full zip into memory buffer to avoid writing huge temp zip files to disk
	buf := new(bytes.Buffer)
	_, err = io.Copy(buf, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read download body: %w", err)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		return fmt.Errorf("failed to parse zip file: %w", err)
	}

	var foundBinary bool
	binName := "rclone"
	if runtime.GOOS == "windows" {
		binName = "rclone.exe"
	}

	for _, file := range zipReader.File {
		baseName := filepath.Base(file.Name)
		if !file.FileInfo().IsDir() && baseName == binName {
			log.Printf("[Downloader] Found rclone binary: %s", file.Name)

			// Ensure parent directory exists
			parentDir := filepath.Dir(targetPath)
			if err := os.MkdirAll(parentDir, 0755); err != nil {
				return fmt.Errorf("failed to create directory: %w", err)
			}

			// Extract file
			rc, err := file.Open()
			if err != nil {
				return fmt.Errorf("failed to open zipped file: %w", err)
			}

			out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				rc.Close()
				return fmt.Errorf("failed to create target file: %w", err)
			}

			_, err = io.Copy(out, rc)
			out.Close()
			rc.Close()
			if err != nil {
				return fmt.Errorf("failed to extract file: %w", err)
			}

			foundBinary = true
			break
		}
	}

	if !foundBinary {
		return fmt.Errorf("rclone binary was not found in the downloaded archive")
	}

	log.Printf("[Downloader] Successfully installed portable rclone to %s", targetPath)
	return nil
}
