// Package diagnostic models actionable problems (core/10 §1). State
// category: calculated. A diagnostic is derived from current facts by health
// checks and recomputed rather than stored as truth; only suppressions are
// persisted. It is not a log line, not a notification and not history.
//
// Diagnostics carry codes and parameters, never display text: the UI
// translates them (D044, INV-OPS-05).
package diagnostic

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

// ErrInvalid is returned when a diagnostic is not actionable enough.
var ErrInvalid = errors.New("diagnostic: invalid")

// Severity of a problem. "Blocking" in the UI means SeverityError with a
// non-empty Blocks list.
type Severity string

const (
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityError   Severity = "error"
)

func (s Severity) valid() bool {
	return s == SeverityInfo || s == SeverityWarning || s == SeverityError
}

// Code identifies the health check that produced the problem (catalog in
// core/10 §1.1). Codes are stable: the UI and suppressions depend on them.
type Code string

// Key is the stable identity of a diagnostic: the same problem about the same
// entities always has the same key, so suppression and "new since" survive
// recomputation.
type Key string

// Params are the values the UI interpolates into the translated text.
type Params map[string]string

// Evidence is a verifiable fact supporting the diagnostic, as data.
type Evidence struct {
	// Kind names the fact ("location", "rule", "plugin_master"...).
	Kind   string
	Ref    *event.EntityRef
	Params Params
}

// Action is something the user can do. ID names the action; the UI renders
// its label from the catalog; Target points to where it applies. Without
// NavigateTo the action is a command the backend executes
// (ExecuteDiagnosticAction); with it, the UI opens that place (a screen or a
// dialog) where the problem is solved (core/10 §1.2, INV-OPS-06).
type Action struct {
	ID         string
	Params     Params
	Target     *event.EntityRef
	NavigateTo string
}

// IsCommand reports whether the backend executes the action.
func (a Action) IsCommand() bool { return a.NavigateTo == "" }

// Spec is the input to New.
type Spec struct {
	Code     Code
	Severity Severity
	Params   Params
	Evidence []Evidence
	Actions  []Action
	// Blocks lists the operation kinds this problem prevents. Only the
	// operations that depend on the failing requirement are blocked.
	Blocks  []operation.Kind
	Related []event.EntityRef
}

// Diagnostic is an actionable problem.
type Diagnostic struct {
	Key      Key
	Code     Code
	Severity Severity
	Params   Params
	Evidence []Evidence
	Actions  []Action
	Blocks   []operation.Kind
	Related  []event.EntityRef
}

// New validates a diagnostic:
//   - it needs a code, a known severity and at least one evidence;
//   - errors need at least one action (INV-OPS-06);
//   - only errors may block operations;
//   - actions need an id.
func New(s Spec) (Diagnostic, error) {
	if s.Code == "" {
		return Diagnostic{}, fmt.Errorf("%w: needs a code", ErrInvalid)
	}
	if !s.Severity.valid() {
		return Diagnostic{}, fmt.Errorf("%w: unknown severity %q", ErrInvalid, s.Severity)
	}
	if len(s.Evidence) == 0 {
		return Diagnostic{}, fmt.Errorf("%w: %s has no evidence", ErrInvalid, s.Code)
	}
	if s.Severity == SeverityError && len(s.Actions) == 0 {
		return Diagnostic{}, fmt.Errorf("%w: error %s has no suggested action", ErrInvalid, s.Code)
	}
	if len(s.Blocks) > 0 && s.Severity != SeverityError {
		return Diagnostic{}, fmt.Errorf("%w: only errors may block operations", ErrInvalid)
	}
	for _, a := range s.Actions {
		if strings.TrimSpace(a.ID) == "" {
			return Diagnostic{}, fmt.Errorf("%w: action needs an id", ErrInvalid)
		}
	}
	related := slices.Clone(s.Related)
	slices.SortFunc(related, compareRefs)
	related = slices.Compact(related)
	return Diagnostic{
		Key:  NewKey(s.Code, related...),
		Code: s.Code, Severity: s.Severity, Params: maps.Clone(s.Params),
		Evidence: slices.Clone(s.Evidence), Actions: slices.Clone(s.Actions),
		Blocks: slices.Clone(s.Blocks), Related: related,
	}, nil
}

// NewKey derives the stable key of a problem about the given entities. The
// order of the entities does not matter.
func NewKey(code Code, related ...event.EntityRef) Key {
	refs := slices.Clone(related)
	slices.SortFunc(refs, compareRefs)
	refs = slices.Compact(refs)
	h := sha256.New()
	fmt.Fprintf(h, "%q", code)
	for _, r := range refs {
		fmt.Fprintf(h, " %q:%q", r.Kind, r.ID)
	}
	return Key(string(code) + "#" + hex.EncodeToString(h.Sum(nil))[:16])
}

// IsBlocking reports whether the diagnostic blocks any operation.
func (d Diagnostic) IsBlocking() bool { return len(d.Blocks) > 0 }

// BlocksOperation reports whether the diagnostic prevents kind.
func (d Diagnostic) BlocksOperation(kind operation.Kind) bool { return slices.Contains(d.Blocks, kind) }

// Blocking returns the diagnostics that prevent kind.
func Blocking(ds []Diagnostic, kind operation.Kind) []Diagnostic {
	var out []Diagnostic
	for _, d := range ds {
		if d.BlocksOperation(kind) {
			out = append(out, d)
		}
	}
	return out
}

// Suppression hides a diagnostic by key, or every diagnostic of a code
// ("não mostrar este tipo"). Persisted; blocking diagnostics are never
// hidden (core/10 §1.2).
type Suppression struct {
	Key       Key
	Code      Code
	CreatedAt time.Time
}

// NewSuppression validates that exactly one of key or code is set.
func NewSuppression(key Key, code Code, now time.Time) (Suppression, error) {
	if (key == "") == (code == "") {
		return Suppression{}, fmt.Errorf("%w: suppression targets a key or a code", ErrInvalid)
	}
	return Suppression{Key: key, Code: code, CreatedAt: now}, nil
}

// Hides reports whether the suppression hides d.
func (s Suppression) Hides(d Diagnostic) bool {
	if d.IsBlocking() {
		return false
	}
	return (s.Key != "" && s.Key == d.Key) || (s.Code != "" && s.Code == d.Code)
}

// Visible filters out suppressed diagnostics.
func Visible(ds []Diagnostic, sups []Suppression) []Diagnostic {
	return slices.DeleteFunc(slices.Clone(ds), func(d Diagnostic) bool {
		return slices.ContainsFunc(sups, func(s Suppression) bool { return s.Hides(d) })
	})
}

// Presence is the delivery record of a diagnostic: when it was first seen
// in a row of evaluations. It is persisted so a problem notifies once when
// it appears, not on every recalculation (core/10 §2).
type Presence struct {
	Key       Key
	Code      Code
	Severity  Severity
	FirstSeen time.Time
}

func compareRefs(a, b event.EntityRef) int {
	if c := strings.Compare(a.Kind, b.Kind); c != 0 {
		return c
	}
	return strings.Compare(a.ID, b.ID)
}
