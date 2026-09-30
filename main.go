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
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Matches the dark canvas of the dettmann-ui "forest" theme so the
		// window does not flash before the frontend paints.
		BackgroundColour: &options.RGBA{R: 14, G: 19, B: 16, A: 255},
		OnStartup:        app.Startup,
		OnShutdown:       app.Shutdown,
		Bind:             []any{app},
	})
	if err != nil {
		log.Fatalf("wails: %v", err)
	}
}
