package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"zen-clone/pkg/rclone"
	"zen-clone/pkg/server"
)

//go:embed all:web/dist
var webAssets embed.FS

func main() {
	log.Println("[Main] Starting zen-clone...")

	// 1. Setup web assets
	var uiFS http.FileSystem
	if _, err := os.Stat("web/dist"); err == nil {
		log.Println("[UI] Using local disk assets from web/dist")
		uiFS = http.Dir("web/dist")
	} else {
		log.Println("[UI] Using embedded production assets")
		f, err := fs.Sub(webAssets, "web/dist")
		if err != nil {
			log.Fatalf("failed to sub embed FS: %v", err)
		}
		uiFS = http.FS(f)
	}
	server.UIFileSystem = uiFS

	// 2. Start the local Rclone daemon on port 51900
	daemon := rclone.NewDaemon(51900)
	if err := daemon.Start(); err != nil {
		log.Fatalf("failed to start rclone daemon: %v", err)
	}

	// 3. Start the API/Web server on port 51800
	srv := server.NewServer(51800, daemon)

	// 4. Handle OS termination signals to clean up the daemon process gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("[Main] Shutting down, cleaning up rclone daemon...")
		daemon.Shutdown()
		os.Exit(0)
	}()

	// 5. Run the web server (blocks)
	if err := srv.Start(); err != nil {
		log.Printf("[Main] Server stopped: %v", err)
		daemon.Shutdown()
	}
}
