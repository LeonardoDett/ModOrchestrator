// Package operations is the application service that runs and tracks
// long operations. Infrastructure is reached only through the ports below.
package operations

import (
	"context"
	"errors"
	"time"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

// ErrNotFound is returned by repositories when an operation does not exist.
var ErrNotFound = errors.New("operations: not found")

// Repository persists operations together with the events produced by each
// transition. Save must be atomic: the operation state and its events are
// committed together or not at all. The store assigns event sequences.
type Repository interface {
	Save(ctx context.Context, op *operation.Operation, events []event.Event) ([]event.Event, error)
	Get(ctx context.Context, id operation.ID) (*operation.Operation, error)
	ListRecent(ctx context.Context, limit int) ([]*operation.Operation, error)
	ListByStatus(ctx context.Context, statuses ...operation.Status) ([]*operation.Operation, error)
	Events(ctx context.Context, id operation.ID) ([]event.Event, error)
}

// Publisher fans committed events out to live subscribers (e.g. the UI
// bridge). Publishing happens only after persistence succeeded.
type Publisher interface {
	Publish(events ...event.Event)
}

// IDGenerator creates unique identifiers.
type IDGenerator interface {
	NewID() string
}

// Clock abstracts time for deterministic tests.
type Clock interface {
	Now() time.Time
}
