// Package bootstrap is the composition root: it is the only place that
// knows every concrete implementation and wires them to core ports.
package bootstrap

import (
	"context"
	"database/sql"
	"fmt"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/eventbus"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

// Container holds the wired application services.
type Container struct {
	Paths      appdata.Paths
	Events     *eventbus.Bus
	Operations *operations.Service
	// Interrupted lists operations a previous process left unfinished.
	Interrupted   []*operation.Operation
	SchemaVersion int

	db *sql.DB
}

// New resolves paths, opens and migrates the database, wires services and
// recovers operations interrupted by a previous run.
func New(ctx context.Context) (*Container, error) {
	paths, err := appdata.Resolve()
	if err != nil {
		return nil, err
	}
	db, err := sqlite.Open(ctx, paths.Database)
	if err != nil {
		return nil, err
	}
	version, err := sqlite.SchemaVersion(ctx, db)
	if err != nil {
		db.Close()
		return nil, err
	}

	bus := eventbus.New()
	ops := operations.NewService(sqlite.NewOperationRepository(db), bus, system.IDs{}, system.Clock{})

	interrupted, err := ops.RecoverInterrupted(ctx)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("bootstrap: recover interrupted operations: %w", err)
	}

	return &Container{
		Paths:         paths,
		Events:        bus,
		Operations:    ops,
		Interrupted:   interrupted,
		SchemaVersion: version,
		db:            db,
	}, nil
}

// Close releases resources.
func (c *Container) Close() error { return c.db.Close() }
