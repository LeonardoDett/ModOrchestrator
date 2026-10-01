package deployment

import (
	"fmt"
	"slices"
	"strings"
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
	ActionMkdir           ActionKind = "mkdir"
	ActionRemoveDir       ActionKind = "rmdir_managed"
)

// applyRank is the safe execution order of core/04 §5 (apply). A managed
// replacement is created under a temporary name and renamed over the old
// file (D078), so it has no separate removal part and runs with the
// creations: the location is never left empty.
var applyRank = map[ActionKind]int{
	ActionRemoveManaged:   0,
	ActionRestoreBackup:   1,
	ActionMkdir:           2,
	ActionBackupAndCreate: 3,
	ActionCreate:          4,
	ActionReplaceManaged:  4,
	ActionRemoveDir:       5,
	ActionKeep:            6,
}

// Action is one planned filesystem change.
type Action struct {
	Kind     ActionKind
	Location game.Location
	// Desired is the link entry to create (create, replace, backup+create),
	// with the expected evidence filled by the application when known.
	Desired *Entry
	// Current is the manifest entry the action acts upon (replace, remove,
	// restore, rmdir).
	Current *Entry
	// Backup is the backup entry a backup_and_create records: where the
	// original goes and, as evidence, what the original looked like when
	// it was planned (the move keeps its file identity).
	Backup *Entry
}

// SortForApply orders actions for safe execution: removals first, folders
// before the files they hold, creations after backups, and empty-folder
// cleanup last, deepest folder first. Ties are ordered by location.
func SortForApply(actions []Action) []Action {
	out := slices.Clone(actions)
	slices.SortStableFunc(out, func(a, b Action) int {
		if d := applyRank[a.Kind] - applyRank[b.Kind]; d != 0 {
			return d
		}
		c := strings.Compare(a.Location.Key(), b.Location.Key())
		if a.Kind == ActionRemoveDir {
			return -c // children ("a/b") before parents ("a")
		}
		return c
	})
	return out
}

// JournalKind says which operation wrote the journal.
type JournalKind string

const (
	JournalDeploy JournalKind = "deploy"
	JournalPurge  JournalKind = "purge"
)

// ActionState is the progress of one journal action.
type ActionState string

const (
	// StatePending: not executed yet, or executed without the mark being
	// written (an interruption can leave either; recovery observes).
	StatePending ActionState = "pending"
	// StateDone: executed; its effect is confirmed by observation at
	// commit or recovery, never assumed.
	StateDone ActionState = "done"
	// StateSkipped: not executed because the location diverged right
	// before acting (race with an external tool) or the action failed
	// before writing anything. Recovery ignores it.
	StateSkipped ActionState = "skipped"
)

// Journal is a plan being executed. It is written before the first
// filesystem change (INV-DEP-03) and removed on commit. Finding one at start
// means the deploy was interrupted (diagnostic deploy_interrupted); recovery
// observes the effect of every action and records only what is confirmed,
// never a blind undo (D035).
type Journal struct {
	Instance  game.InstanceID
	Operation operation.ID
	Kind      JournalKind
	// Profile and Fingerprint are what the new manifest records when every
	// action took effect.
	Profile     ProfileID
	Fingerprint Fingerprint
	StartedAt   time.Time
	Actions     []Action
	states      []ActionState
}

// NewJournal records the actions in apply order. Keep actions are dropped:
// they change nothing.
func NewJournal(instance game.InstanceID, op operation.ID, kind JournalKind, prof ProfileID, fp Fingerprint, actions []Action, now time.Time) (*Journal, error) {
	if instance == "" || op == "" {
		return nil, fmt.Errorf("%w: journal needs instance and operation", ErrInvalid)
	}
	if kind != JournalDeploy && kind != JournalPurge {
		return nil, fmt.Errorf("%w: unknown journal kind %q", ErrInvalid, kind)
	}
	acts := slices.DeleteFunc(SortForApply(actions), func(a Action) bool { return a.Kind == ActionKeep })
	states := make([]ActionState, len(acts))
	for i := range states {
		states[i] = StatePending
	}
	return &Journal{Instance: instance, Operation: op, Kind: kind, Profile: prof, Fingerprint: fp, StartedAt: now, Actions: acts, states: states}, nil
}

// RestoreJournal rebuilds a persisted journal with its progress.
func RestoreJournal(j Journal, states []ActionState) (*Journal, error) {
	if len(states) != len(j.Actions) {
		return nil, fmt.Errorf("%w: journal progress does not match its actions", ErrInvalid)
	}
	for _, s := range states {
		if s != StatePending && s != StateDone && s != StateSkipped {
			return nil, fmt.Errorf("%w: unknown action state %q", ErrInvalid, s)
		}
	}
	j.states = slices.Clone(states)
	return &j, nil
}

// Mark records the progress of action i.
func (j *Journal) Mark(i int, s ActionState) error {
	if i < 0 || i >= len(j.Actions) {
		return fmt.Errorf("%w: journal has no action %d", ErrInvalid, i)
	}
	j.states[i] = s
	return nil
}

// States returns the progress, one state per action.
func (j *Journal) States() []ActionState { return slices.Clone(j.states) }

// State returns the progress of action i.
func (j *Journal) State(i int) ActionState { return j.states[i] }

// Pending returns the indexes of actions not executed yet.
func (j *Journal) Pending() []int {
	var out []int
	for i, s := range j.states {
		if s == StatePending {
			out = append(out, i)
		}
	}
	return out
}
