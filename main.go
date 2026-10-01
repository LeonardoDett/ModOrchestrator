package main

import (
	"context"
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"modorchestrator/internal/bootstrap"
	"modorchestrator/internal/bridge"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	container, err := bootstrap.New(context.Background())
	if err != nil {
		log.Fatalf("startup failed: %v", err)
	}
	defer container.Close()

	app := bridge.NewApp(container)

	err = wails.Run(&options.App{
		Title:     "Mod Orchestrator",
		Width:     1280,
		Height:    800,
		MinWidth:  960,
		MinHeight: 600,
		// ui.customTitleBar (core/13, restart required): the UI draws the
		// title bar with the launcher area and window controls (ui/00 §2.1).
		Frameless: container.CustomTitleBar,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Matches the dark canvas of the dettmann-ui "orchestrator" theme so
		// the window does not flash before the frontend paints.
		BackgroundColour: &options.RGBA{R: 13, G: 19, B: 17, A: 255},
		// Files and folders dropped on elements marked as drop targets reach
		// the import queue with their absolute paths (ui/telas/mods.md §8);
		// the webview never opens a dropped file itself.
		DragAndDrop: &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true},
		OnStartup:   app.Startup,
		OnShutdown:  app.Shutdown,
		Bind:        []any{app},
	})
	if err != nil {
		log.Fatalf("wails: %v", err)
	}
}
