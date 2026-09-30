// Package externalchange classifies divergences between the applied state
// (manifest) and the observed filesystem, and validates the decisions the
// user may take about them (core/09). State category: calculated. An
// external change is never assumed to belong to the manager and is never
// settled silently (D008, INV-EXT-02); generated files are never deleted
// automatically (D046, INV-EXT-03).
package externalchange

import (
	"errors"
	"fmt"
	"slices"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// ErrInvalid is returned for inconsistent changes or decisions.
var ErrInvalid = errors.New("externalchange: invalid")

// Kind classifies a divergence (core/09 §2).
type Kind string

const (
	KindMissing    Kind = "missing"
	KindModified   Kind = "modified"
	KindReplaced   Kind = "replaced"
	KindUnexpected Kind = "unexpected"
	KindPermission Kind = "permission"
	// KindLoadOrder: the game's load order file differs from the last write
	// (D040). It has no file entry.
	KindLoadOrder Kind = "load_order"
)

// Change is one observed divergence.
type Change struct {
	Location game.Location
	Kind     Kind
	// Expected is the manifest link entry; nil for unexpected files and
	// load order changes, which the manager does not own.
	Expected *deployment.Entry
	Observed deployment.Observation
}

// Managed reports whether the location belongs to the manager.
func (c Change) Managed() bool { return c.Expected != nil }

// Classify compares a manifest link entry with what a scan observed. It
// returns false when the observation confirms the entry. recorded is the
// file of the installation (size/hash registered at install), used to tell
// an edit through a hardlink (same file, new content) from a match.
func Classify(entry deployment.Entry, obs deployment.Observation, recorded mod.File) (Change, bool) {
	c := Change{Location: entry.Location, Expected: &entry, Observed: obs}
	switch {
	case obs.Unreadable:
		c.Kind = KindPermission
	case !obs.Exists:
		c.Kind = KindMissing
	case !entry.Evidence.Matches(obs.Evidence, entry.Method):
		if entry.Method == game.MethodCopy {
			c.Kind = KindModified
		} else {
			c.Kind = KindReplaced
		}
	case entry.Method == game.MethodHardlink && contentChanged(recorded, obs.Evidence):
		c.Kind = KindModified
	default:
		return Change{}, false
	}
	return c, true
}

// Unexpected builds the change for a file found in a managed folder without
// manifest entry, created after the last deploy.
func Unexpected(loc game.Location, obs deployment.Observation) (Change, error) {
	if err := loc.Validate(); err != nil {
		return Change{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if !obs.Exists {
		return Change{}, fmt.Errorf("%w: an unexpected file must exist", ErrInvalid)
	}
	return Change{Location: loc, Kind: KindUnexpected, Observed: obs}, nil
}

func contentChanged(recorded mod.File, obs deployment.Evidence) bool {
	if obs.Size != recorded.Size {
		return true
	}
	return recorded.Hash != "" && obs.Hash != "" && recorded.Hash != obs.Hash
}

// Action is what the user decides about a change (core/09 §4).
type Action string

const (
	ActionRestore          Action = "restore"         // recreate the managed file
	ActionAcceptRemoval    Action = "accept_removal"  // becomes a FileExclusion
	ActionKeepChange       Action = "keep_change"     // hardlink edit already in staging
	ActionRevert           Action = "revert"          // put the managed file back
	ActionSaveToMod        Action = "save_to_mod"     // copy the observed file into the mod
	ActionCapture          Action = "capture"         // move generated files into a mod (D046)
	ActionLeaveUnmanaged   Action = "leave_unmanaged" // remember and never list again
	ActionIgnoreNow        Action = "ignore_now"      // skip for this operation only
	ActionRetry            Action = "retry"           // try reading again
	ActionImportLoadOrder  Action = "import_load_order"
	ActionRestoreLoadOrder Action = "restore_load_order"
)

// Allowed returns the actions offered for a change, suggested one first.
// method is the deployment method of the managed entry ("" otherwise).
func Allowed(kind Kind, method game.DeploymentMethod) []Action {
	switch kind {
	case KindMissing:
		return []Action{ActionRestore, ActionAcceptRemoval, ActionIgnoreNow}
	case KindModified:
		if method == game.MethodHardlink {
			return []Action{ActionKeepChange, ActionRevert, ActionIgnoreNow}
		}
		return []Action{ActionSaveToMod, ActionRevert, ActionIgnoreNow}
	case KindReplaced:
		return []Action{ActionRevert, ActionSaveToMod, ActionIgnoreNow}
	case KindUnexpected:
		// No suggestion: the UI must not pre-select (core/09 §4).
		return []Action{ActionCapture, ActionLeaveUnmanaged, ActionIgnoreNow}
	case KindPermission:
		return []Action{ActionRetry, ActionIgnoreNow}
	case KindLoadOrder:
		return []Action{ActionRestoreLoadOrder, ActionImportLoadOrder}
	}
	return nil
}

// Decision is the user's choice for one change.
type Decision struct {
	Change Change
	Action Action
	// CaptureInto is the existing mod receiving captured files; empty means
	// a new mod (only for ActionCapture).
	CaptureInto mod.ID
}

// Validate checks that the action is offered for the change.
func (d Decision) Validate() error {
	method := game.DeploymentMethod("")
	if d.Change.Expected != nil {
		method = d.Change.Expected.Method
	}
	if !slices.Contains(Allowed(d.Change.Kind, method), d.Action) {
		return fmt.Errorf("%w: %s is not allowed for a %s change", ErrInvalid, d.Action, d.Change.Kind)
	}
	if d.CaptureInto != "" && d.Action != ActionCapture {
		return fmt.Errorf("%w: only captures have a target mod", ErrInvalid)
	}
	return nil
}
