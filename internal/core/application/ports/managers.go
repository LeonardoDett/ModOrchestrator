package ports

import (
	"context"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/migration"
)

// ManagerReader reads what another mod manager knows about a game (D128).
// It is read only: it never writes in the manager's folders, and a manager
// that is running is read from a copy of its state.
type ManagerReader interface {
	Manager() game.ForeignKind
	// Find lists the sources of this manager that point at the game folder
	// root.
	Find(ctx context.Context, root string) ([]migration.Source, error)
	// Open lists the sources of a folder the user chose; ErrNotFound when
	// it is not a folder of this manager.
	Open(ctx context.Context, folder string) ([]migration.Source, error)
	Read(ctx context.Context, src migration.Source) (migration.Snapshot, error)
}
