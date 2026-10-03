// Package appdata resolves where the application keeps its own state.
package appdata

import (
	"fmt"
	"os"
	"path/filepath"
)

// EnvDataDir overrides the data directory (development, tests, portable use).
const EnvDataDir = "MODORCHESTRATOR_DATA_DIR"

const appDirName = "ModOrchestrator"

// Paths are the application-owned locations. Game folders and mod staging
// are not here: they belong to GameInstance configuration.
type Paths struct {
	Root     string
	Database string
	// Logs holds the rotating technical log (core/10 §4).
	Logs string
	// Cache holds discardable caches (core/14 §1: plugin headers).
	Cache string
	// Backups holds the database backups (core/14 §1, §3); RestorePending
	// is the validated copy a restore puts in place at the next start.
	Backups        string
	RestorePending string
}

// Resolve returns the data paths, creating the root directory if needed.
func Resolve() (Paths, error) {
	root := os.Getenv(EnvDataDir)
	if root == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return Paths{}, fmt.Errorf("appdata: user config dir: %w", err)
		}
		root = filepath.Join(base, appDirName)
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return Paths{}, err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return Paths{}, fmt.Errorf("appdata: create %s: %w", root, err)
	}
	return Paths{
		Root:     root,
		Database: filepath.Join(root, "state.db"),
		Logs:     filepath.Join(root, "logs"),
		Cache:    filepath.Join(root, "cache"),
		Backups:  filepath.Join(root, "backups"),
		// Next to the database: the rename that applies it stays in the
		// same folder and volume.
		RestorePending: filepath.Join(root, "state.restore-pending.db"),
	}, nil
}
