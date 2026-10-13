package ports

import (
	"context"

	"modorchestrator/internal/core/domain/game"
)

// GameEntries keeps the games the user describes, as manifests (D117). It
// is the source of truth of those games; the registry only mirrors it.
type GameEntries interface {
	// List returns every readable entry ordered by id, and the ids of the
	// stored entries this build cannot read (another schema, damaged). An
	// unreadable entry is kept as it is, never dropped.
	List(ctx context.Context) (entries []game.Manifest, unreadable []game.ID, err error)
	// Save inserts or replaces the entry with the id of the manifest.
	Save(ctx context.Context, m game.Manifest) error
	// Delete returns ErrNotFound for an unknown entry.
	Delete(ctx context.Context, id game.ID) error
}

// EntryHost is implemented by the adapter that serves games described by
// manifests (D117). Its definitions change while the app runs, so the
// registry asks it again after every change.
type EntryHost interface {
	GameAdapter
	// SetEntries replaces the manifests the adapter serves.
	SetEntries(entries []game.Manifest) error
}
