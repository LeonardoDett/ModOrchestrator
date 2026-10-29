package system

import (
	"context"
	"fmt"
	"os/exec"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Launcher starts the game executable (core/11 §6). Only executables the
// adapter declares or the user set for a generic game are started, never a
// file from an archive (INV-LIB-04: the library has no launcher).
type Launcher struct{}

var _ ports.ProcessLauncher = Launcher{}

// Start starts exe with args in workDir and returns without waiting. A
// refusal for lack of administrator rights wraps ports.ErrElevationRequired
// (D150).
func (Launcher) Start(_ context.Context, exe string, args []string, workDir string) error {
	cmd := exec.Command(exe, args...)
	cmd.Dir = workDir
	if err := cmd.Start(); err != nil {
		if elevationRequired(err) {
			return fmt.Errorf("system: start %s: %w: %w", exe, ports.ErrElevationRequired, err)
		}
		return fmt.Errorf("system: start %s: %w", exe, err)
	}
	go cmd.Wait() //nolint:errcheck // the game outlives nothing here; its exit is observed by the process probe
	return nil
}

// StartElevated starts exe asking for administrator rights (D150).
func (Launcher) StartElevated(_ context.Context, exe string, args []string, workDir string) error {
	if err := startElevated(exe, args, workDir); err != nil {
		if elevationCancelled(err) {
			return fmt.Errorf("system: start %s elevated: %w: %w", exe, ports.ErrElevationCancelled, err)
		}
		return fmt.Errorf("system: start %s elevated: %w", exe, err)
	}
	return nil
}

// OpenURI opens a store URI with the program registered for it (D150).
func (Launcher) OpenURI(_ context.Context, uri string) error {
	if err := openURI(uri); err != nil {
		return fmt.Errorf("system: open %s: %w", uri, err)
	}
	return nil
}

// storeClientProcesses are the processes of each store client (D150).
var storeClientProcesses = map[string][]string{
	game.StoreSteam: {"steam.exe"},
	game.StoreEpic:  {"EpicGamesLauncher.exe"},
	game.StoreGOG:   {"GalaxyClient.exe"},
}

// StoreClients tells whether a store client runs, by its process
// (ports.StoreClients, D150).
type StoreClients struct {
	Probe ports.ProcessProbe
}

var _ ports.StoreClients = StoreClients{}

// ClientRunning implements ports.StoreClients.
func (c StoreClients) ClientRunning(ctx context.Context, store string) (bool, error) {
	names, ok := storeClientProcesses[store]
	if !ok {
		return false, fmt.Errorf("system: unknown store %q", store)
	}
	running, err := c.Probe.Running(ctx, names)
	if err != nil {
		return false, err
	}
	return len(running) > 0, nil
}
