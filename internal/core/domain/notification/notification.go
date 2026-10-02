// Package notification models the user-facing delivery of a diagnostic or
// of an operation result (core/10 §2). It is separate from the diagnostic it
// points to, from history and from the technical log. Its own state is only
// unread/read/dismissed; hiding a problem is a diagnostic suppression, not a
// notification state. Like diagnostics, it carries a code and parameters,
// never display text (D044).
package notification

import (
	"errors"
	"fmt"
	"maps"
	"time"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
)

// Errors returned by notifications.
var (
	ErrInvalid           = errors.New("notification: invalid")
	ErrInvalidTransition = errors.New("notification: invalid state transition")
)

// ID identifies a notification.
type ID string

// Kind says what the notification delivers.
type Kind string

const (
	KindDiagnostic      Kind = "diagnostic"       // a diagnostic appeared (warning or worse)
	KindOperationResult Kind = "operation_result" // an operation ended
	KindInfo            Kind = "info"             // the system did something automatic
)

// State is the delivery state.
type State string

const (
	StateUnread    State = "unread"
	StateRead      State = "read"
	StateDismissed State = "dismissed"
)

// Notification tells the user about something. Ref is the diagnostic key or
// the operation id; Subject points to the screen that resolves it.
type Notification struct {
	ID      ID
	Kind    Kind
	Ref     string
	Code    string
	Params  diagnostic.Params
	Subject event.EntityRef
	// Instance is the game instance it is about ("" for the app).
	Instance string
	// Severity of the diagnostic, or of the operation outcome ("error" for
	// a failure), for the icon (never only colour, D043).
	Severity string
	// Count > 1 when similar notifications were aggregated ("12 mods
	// installed").
	Count     int
	State     State
	CreatedAt time.Time
	UpdatedAt time.Time
}

// New creates an unread notification.
func New(id ID, kind Kind, ref, code string, params diagnostic.Params, subject event.EntityRef, now time.Time) (*Notification, error) {
	if id == "" || ref == "" || code == "" {
		return nil, fmt.Errorf("%w: needs id, ref and code", ErrInvalid)
	}
	switch kind {
	case KindDiagnostic, KindOperationResult, KindInfo:
	default:
		return nil, fmt.Errorf("%w: unknown kind %q", ErrInvalid, kind)
	}
	return &Notification{ID: id, Kind: kind, Ref: ref, Code: code, Params: maps.Clone(params), Subject: subject, Count: 1, State: StateUnread, CreatedAt: now, UpdatedAt: now}, nil
}

// Aggregate folds a similar notification into this one and makes it unread
// again.
func (n *Notification) Aggregate(now time.Time) {
	n.Count++
	n.State = StateUnread
	n.UpdatedAt = now
}

// MarkRead acknowledges the notification.
func (n *Notification) MarkRead(now time.Time) error {
	if n.State != StateUnread {
		return fmt.Errorf("%w: cannot mark %s as read", ErrInvalidTransition, n.State)
	}
	n.State = StateRead
	n.UpdatedAt = now
	return nil
}

// Dismiss removes the notification from the list. It never resolves nor
// hides the underlying diagnostic.
func (n *Notification) Dismiss(now time.Time) {
	n.State = StateDismissed
	n.UpdatedAt = now
}
