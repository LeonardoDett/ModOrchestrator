// Package externalchange classifies divergences between the applied state
// (manifest) and the observed filesystem, and validates the decisions the
// user may take about them (core/09). State category: calculated, except
// the "leave unmanaged" decision (Unmanaged), which is persisted. An
// external change is never assumed to belong to the manager and is never
// settled silently (D008, INV-EXT-02); generated files are never deleted
// automatically (D046, INV-EXT-03).
package externalchange

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

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
	// (D040). It has no file entry; detection arrives with F11.
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
	// Wanted: the desired state still deploys the location.
	Wanted bool
	// Retained: the archive of the mod is kept, so a hardlink edit can be
	// reverted by reinstalling (core/09 §4).
	Retained bool
	// MatchesOriginal: a replaced location now holds a file identical to
	// the original kept in the BackupStore (the store put it back).
	MatchesOriginal bool
	// HintUnmanaged: the adapter suggests leaving this generated file
	// unmanaged (core/12 §9).
	HintUnmanaged bool
}

// Managed reports whether the location belongs to the manager.
func (c Change) Managed() bool { return c.Expected != nil }

// Method is the deployment method of the managed entry ("" otherwise).
func (c Change) Method() game.DeploymentMethod {
	if c.Expected == nil {
		return ""
	}
	return c.Expected.Method
}

// Classify compares a manifest link entry with what a scan observed. It
// returns false when the observation confirms the entry. An edit through a
// hardlink keeps the file identity: it is told apart by the size, time or
// hash recorded when the link was verified.
func Classify(entry deployment.Entry, obs deployment.Observation) (Change, bool) {
	c := Change{Location: entry.Location, Expected: &entry, Observed: obs}
	switch {
	case obs.Unreadable:
		c.Kind = KindPermission
	case !obs.Exists:
		c.Kind = KindMissing
	case obs.IsDir:
		c.Kind = KindReplaced
	case !entry.Evidence.Matches(obs.Evidence, entry.Method):
		if entry.Method == game.MethodCopy {
			c.Kind = KindModified
		} else {
			c.Kind = KindReplaced
		}
	case entry.Method == game.MethodHardlink && contentChanged(entry.Evidence, obs.Evidence):
		c.Kind = KindModified
	default:
		return Change{}, false
	}
	return c, true
}

// Unexpected builds the change for a file found in a managed folder (or a
// known tool output) without manifest entry, created after the deployment
// started.
func Unexpected(loc game.Location, obs deployment.Observation) (Change, error) {
	if err := loc.Validate(); err != nil {
		return Change{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if !obs.Exists || obs.IsDir {
		return Change{}, fmt.Errorf("%w: an unexpected file must exist", ErrInvalid)
	}
	return Change{Location: loc, Kind: KindUnexpected, Observed: obs}, nil
}

func contentChanged(recorded, obs deployment.Evidence) bool {
	if obs.Size != recorded.Size {
		return true
	}
	if !recorded.ModTime.IsZero() && !obs.ModTime.IsZero() && !recorded.ModTime.Equal(obs.ModTime) {
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

// Actions returns the actions offered for a change, the suggested one first
// when there is a suggestion (Suggested).
func Actions(c Change) []Action {
	switch c.Kind {
	case KindMissing:
		return []Action{ActionRestore, ActionAcceptRemoval, ActionIgnoreNow}
	case KindModified:
		if c.Method() == game.MethodHardlink {
			if c.Retained {
				return []Action{ActionKeepChange, ActionRevert, ActionIgnoreNow}
			}
			return []Action{ActionKeepChange, ActionIgnoreNow}
		}
		return []Action{ActionSaveToMod, ActionRevert, ActionIgnoreNow}
	case KindReplaced:
		if c.MatchesOriginal {
			return []Action{ActionRevert, ActionSaveToMod, ActionIgnoreNow}
		}
		return []Action{ActionSaveToMod, ActionRevert, ActionIgnoreNow}
	case KindUnexpected:
		if c.HintUnmanaged {
			return []Action{ActionLeaveUnmanaged, ActionCapture, ActionIgnoreNow}
		}
		return []Action{ActionCapture, ActionLeaveUnmanaged, ActionIgnoreNow}
	case KindPermission:
		return []Action{ActionRetry, ActionIgnoreNow}
	case KindLoadOrder:
		return []Action{ActionRestoreLoadOrder, ActionImportLoadOrder}
	}
	return nil
}

// Suggested is the action pre-selected in the dialog (core/09 §4 "Padrão
// sugerido"). Generated files have none unless the adapter hints them: the
// user must choose (an undecided row is left as it is).
func Suggested(c Change) Action {
	if c.Kind == KindUnexpected && !c.HintUnmanaged {
		return ""
	}
	if a := Actions(c); len(a) > 0 {
		return a[0]
	}
	return ""
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
	if !slices.Contains(Actions(d.Change), d.Action) {
		return fmt.Errorf("%w: %s is not allowed for a %s change", ErrInvalid, d.Action, d.Change.Kind)
	}
	if d.CaptureInto != "" && d.Action != ActionCapture {
		return fmt.Errorf("%w: only captures have a target mod", ErrInvalid)
	}
	return nil
}

// Unmanaged is the persisted decision "leave as unmanaged" for a generated
// file (core/09 §4, D046): the location is never listed as unexpected again
// and the file is never touched.
type Unmanaged struct {
	Instance  game.InstanceID
	Location  game.Location
	DecidedAt time.Time
}

// NewUnmanaged validates the decision.
func NewUnmanaged(instance game.InstanceID, loc game.Location, at time.Time) (Unmanaged, error) {
	if instance == "" {
		return Unmanaged{}, fmt.Errorf("%w: decision needs an instance", ErrInvalid)
	}
	if err := loc.Validate(); err != nil {
		return Unmanaged{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	return Unmanaged{Instance: instance, Location: loc, DecidedAt: at}, nil
}

// IsOwnFile reports whether a file name is one the manager writes in a
// target (markers and the temporary name of a replacement): such files are
// never unexpected.
func IsOwnFile(name string) bool {
	n := strings.ToLower(name)
	return strings.HasPrefix(n, ".modorchestrator-") || strings.HasSuffix(n, ".modorchestrator-tmp")
}
