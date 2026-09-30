package deployment

import (
	"fmt"
	"slices"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// ActionKind is one step of a deployment plan (core/04 §4).
type ActionKind string

const (
	ActionCreate          ActionKind = "create"
	ActionKeep            ActionKind = "keep"
	ActionReplaceManaged  ActionKind = "replace_managed"
	ActionRemoveManaged   ActionKind = "remove_managed"
	ActionBackupAndCreate ActionKind = "backup_and_create"
	ActionRestoreBackup   ActionKind = "restore_backup"
	ActionRemoveDir       ActionKind = "rmdir_managed"
)

// applyRank is the safe execution order of core/04 §5 (apply).
var applyRank = map[ActionKind]int{
	ActionRemoveManaged:   0,
	ActionReplaceManaged:  1,
	ActionRestoreBackup:   2,
	ActionBackupAndCreate: 3,
	ActionCreate:          4,
	ActionRemoveDir:       5,
	ActionKeep:            6,
}

// Action is one planned filesystem change.
type Action struct {
	Kind     ActionKind
	Location game.Location
	// Desired is the link entry to create (create, replace, backup+create),
	// without evidence yet.
	Desired *Entry
	// Current is the manifest entry the action acts upon (replace, remove,
	// restore, rmdir).
	Current *Entry
}

// SortForApply orders actions for safe execution: removals first, creations
// after backups, empty-folder cleanup last; ties by location.
func SortForApply(actions []Action) []Action {
	out := slices.Clone(actions)
	slices.SortStableFunc(out, func(a, b Action) int {
		if d := applyRank[a.Kind] - applyRank[b.Kind]; d != 0 {
			return d
		}
		if a.Location.Key() < b.Location.Key() {
			return -1
		}
		if a.Location.Key() > b.Location.Key() {
			return 1
		}
		return 0
	})
	return out
}

// Journal is a plan being executed. It is written before the first
// filesystem change (INV-DEP-03) and removed on commit. Finding one at start
// means the deploy was interrupted (diagnostic deploy_interrupted); recovery
// is a new deploy from the observed state, never a blind undo (D035).
type Journal struct {
	Instance  game.InstanceID
	Operation operation.ID
	StartedAt time.Time
	Actions   []Action
	done      []bool
}

// NewJournal records the actions in apply order. Keep actions are dropped:
// they change nothing.
func NewJournal(instance game.InstanceID, op operation.ID, actions []Action, now time.Time) (*Journal, error) {
	if instance == "" || op == "" {
		return nil, fmt.Errorf("%w: journal needs instance and operation", ErrInvalid)
	}
	acts := slices.DeleteFunc(SortForApply(actions), func(a Action) bool { return a.Kind == ActionKeep })
	return &Journal{Instance: instance, Operation: op, StartedAt: now, Actions: acts, done: make([]bool, len(acts))}, nil
}

// RestoreJournal rebuilds a persisted journal with its progress.
func RestoreJournal(j Journal, done []bool) (*Journal, error) {
	if len(done) != len(j.Actions) {
		return nil, fmt.Errorf("%w: journal progress does not match its actions", ErrInvalid)
	}
	j.done = slices.Clone(done)
	return &j, nil
}

// MarkDone records that action i was executed and verified.
func (j *Journal) MarkDone(i int) error {
	if i < 0 || i >= len(j.Actions) {
		return fmt.Errorf("%w: journal has no action %d", ErrInvalid, i)
	}
	j.done[i] = true
	return nil
}

// Done returns the progress, one flag per action.
func (j *Journal) Done() []bool { return slices.Clone(j.done) }

// Pending returns the indexes of actions not executed yet.
func (j *Journal) Pending() []int {
	var out []int
	for i, d := range j.done {
		if !d {
			out = append(out, i)
		}
	}
	return out
}
