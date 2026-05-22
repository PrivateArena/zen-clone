package config

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"
	"zen-clone/pkg/rclone"
)

type AppConfig struct {
	VFSOpt map[string]interface{} `json:"vfsOpt"`
}

var (
	currentConfig *AppConfig
	configMutex   sync.RWMutex
)

func LoadConfig() *AppConfig {
	configMutex.Lock()
	defer configMutex.Unlock()

	baseDir := rclone.GetBinaryDir()
	configPath := filepath.Join(baseDir, "data", "config.json")

	// Default values
	defaultConfig := &AppConfig{
		VFSOpt: map[string]interface{}{
			"cacheMode":          "off",
			"bufferSize":         "128M",
			"readChunkSize":      "32M",
			"readChunkSizeLimit": "512M",
		},
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("[Config] Could not read config.json, using defaults: %v", err)
		currentConfig = defaultConfig
		return currentConfig
	}

	var loadedConfig AppConfig
	if err := json.Unmarshal(data, &loadedConfig); err != nil {
		log.Printf("[Config] Error parsing config.json, using defaults: %v", err)
		currentConfig = defaultConfig
	} else {
		currentConfig = &loadedConfig
	}

	return currentConfig
}

func GetConfig() *AppConfig {
	configMutex.RLock()
	if currentConfig != nil {
		cfg := currentConfig
		configMutex.RUnlock()
		return cfg
	}
	configMutex.RUnlock()
	return LoadConfig()
}
