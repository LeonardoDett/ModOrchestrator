// Package dependency evaluates requirements between entities (core/06). A
// Dependency is a requirement to evaluate: mod-to-mod requirements come from
// rules.DependencyRule (instance intent), plugin masters and frameworks come
// from the adapter. A Result is the calculated evaluation against current
// facts. The validator that produces Results is phase F9. Evidence is data
// (parameters), never display text (D044).
package dependency

import (
	"errors"
	"fmt"
	"maps"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/relpath"
)

// ErrInvalid is returned for malformed dependencies or results.
var ErrInvalid = errors.New("dependency: invalid")

// Kind is what is required.
type Kind string

const (
	KindMod        Kind = "mod"
	KindPlugin     Kind = "plugin"
	KindFile       Kind = "file"
	KindCapability Kind = "capability"
)

// Status is the outcome of evaluating a dependency.
type Status string

const (
	StatusSatisfied    Status = "satisfied"
	StatusMissing      Status = "missing"
	StatusDisabled     Status = "disabled"
	StatusWrongVersion Status = "wrong_version"
	StatusConflicting  Status = "conflicting"
	StatusUnknown      Status = "unknown"
)

// ID identifies a declared dependency.
type ID string

// Dependency is a declared requirement of Source on Target.
type Dependency struct {
	ID     ID
	Source event.EntityRef
	Kind   Kind
	// Target identifies the required entity: mod id, plugin name, relative
	// file path or capability name, depending on Kind.
	Target string
	// Version is an optional constraint, interpreted by the validator.
	Version  string
	Optional bool
}

// Validate checks the declaration.
func (d Dependency) Validate() error {
	if d.ID == "" || d.Source.IsZero() || d.Target == "" {
		return fmt.Errorf("%w: dependency needs id, source and target", ErrInvalid)
	}
	switch d.Kind {
	case KindMod, KindPlugin, KindCapability:
	case KindFile:
		if _, err := relpath.Parse(d.Target); err != nil {
			return fmt.Errorf("%w: file target: %v", ErrInvalid, err)
		}
	default:
		return fmt.Errorf("%w: unknown kind %q", ErrInvalid, d.Kind)
	}
	return nil
}

// Result is the calculated state of one dependency.
type Result struct {
	Dependency Dependency
	Status     Status
	// Evidence explains the status as parameters; required whenever it is
	// not satisfied.
	Evidence map[string]string
}

// NewResult validates an evaluation.
func NewResult(d Dependency, s Status, evidence map[string]string) (Result, error) {
	if err := d.Validate(); err != nil {
		return Result{}, err
	}
	switch s {
	case StatusSatisfied:
	case StatusMissing, StatusDisabled, StatusWrongVersion, StatusConflicting, StatusUnknown:
		if len(evidence) == 0 {
			return Result{}, fmt.Errorf("%w: %s dependency needs evidence", ErrInvalid, s)
		}
	default:
		return Result{}, fmt.Errorf("%w: unknown status %q", ErrInvalid, s)
	}
	return Result{Dependency: d, Status: s, Evidence: maps.Clone(evidence)}, nil
}

// Broken reports whether a required dependency is not satisfied. Optional
// dependencies are never broken; they may still be reported as information.
func (r Result) Broken() bool {
	return !r.Dependency.Optional && r.Status != StatusSatisfied
}
