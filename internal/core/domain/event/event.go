// Package event defines the domain event envelope shared by every core
// module. Events describe facts that already happened; they are neither
// diagnostics (actionable problems) nor notifications (user-facing delivery).
package event

import "time"

// Type identifies the kind of fact an event records, e.g. "operation.started".
type Type string

// EntityRef points to the domain entity an event or operation is about.
// Identity is logical (kind + id), never an absolute filesystem path.
type EntityRef struct {
	Kind string
	ID   string
}

// IsZero reports whether the reference is empty.
func (r EntityRef) IsZero() bool { return r.Kind == "" && r.ID == "" }

// Event is an immutable record of something that happened in the core.
//
// Sequence is assigned by the event store when the event is persisted and is
// zero before that; it gives a total order for replay and UI reconciliation.
type Event struct {
	ID          string
	Sequence    int64
	Type        Type
	OccurredAt  time.Time
	OperationID string
	Subject     EntityRef
	Payload     any
}
