package system

import (
	"context"
	"fmt"
	"os/exec"
)

// Launcher starts the game executable (core/11 §6). Only executables the
// adapter declares or the user set for a generic game are started, never a
// file from an archive (INV-LIB-04: the library has no launcher).
type Launcher struct{}

// Start starts exe with args in workDir and returns without waiting.
func (Launcher) Start(_ context.Context, exe string, args []string, workDir string) error {
	cmd := exec.Command(exe, args...)
	cmd.Dir = workDir
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("system: start %s: %w", exe, err)
	}
	go cmd.Wait() //nolint:errcheck // the game outlives nothing here; its exit is observed by the process probe
	return nil
}
