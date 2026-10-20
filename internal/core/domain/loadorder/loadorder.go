// Package loadorder records what the manager last wrote to a game's load
// order file (D040). State category: applied. It belongs to the plugins
// module, not to the deploy manifest: a game without plugins never has one
// (D133).
package loadorder

import (
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
)

// ProfileID mirrors profile.ID without importing the desired-state package
// (applied state never depends on desired state packages).
type ProfileID string

// Applied is what the adapter last wrote to the game's load order file.
// FileHash is the evidence used to detect external edits.
//
// The write follows the journal discipline of the deploy (core/08 §7):
// PendingHash is recorded before the file is written, so a crash between
// the write and the record is recognised as ours (not an external change).
// PrevOrder/PrevEnabled are the load order written before the last one
// ("Restaurar load order anterior"); Original is where the file found
// before the first write was kept in the BackupStore ("" when none).
type Applied struct {
	Instance    game.InstanceID
	Profile     ProfileID
	Order       []plugin.Name
	Enabled     []plugin.Name
	FileHash    string
	PendingHash string
	PrevOrder   []plugin.Name
	PrevEnabled []plugin.Name
	Original    string
	Operation   operation.ID
	AppliedAt   time.Time
}

// Ours reports whether a file with hash h is the last one written (or
// being written) by the manager.
func (lo *Applied) Ours(h string) bool {
	return h != "" && (h == lo.FileHash || h == lo.PendingHash)
}
