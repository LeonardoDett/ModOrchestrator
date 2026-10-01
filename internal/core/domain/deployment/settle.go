package deployment

import (
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// After is what a scan observes once a journal ran, completely or not: the
// commit of a deploy and the recovery of an interrupted one ask the same
// questions (D078).
type After interface {
	// At observes a target location.
	At(loc game.Location) Observation
	// Backup observes a file inside the BackupStore.
	Backup(path relpath.Path) Observation
	// Expected is the evidence a correct link for e has (hardlink: file id
	// of the staging file; symlink: its absolute path; copy: its size and
	// time). ok=false when the staging file cannot be read: nothing can
	// then be confirmed for that link.
	Expected(e Entry) (Evidence, bool)
}

// Outcome is the observed result of one journal action.
type Outcome struct {
	Index int
	// Done: the intended effect is observed. A done action that did not
	// take effect (removed by a tool in the meantime, failed half-way) is
	// reported as not done and the entry reflects reality.
	Done bool
}

// Settle derives the applied entries from the previous manifest and the
// actions of a journal, confirming each effect by observation (INV-DEP-05):
// a link is recorded only if the location holds exactly the planned file, a
// backup only if the original sits in the BackupStore with its identity, a
// removal only if the file is gone. Skipped actions are ignored. Entries not
// touched by the journal are kept as they were.
func Settle(prev []Entry, j *Journal, after After) ([]Entry, []Outcome) {
	cur := make(map[string]Entry, len(prev))
	for _, e := range prev {
		cur[e.key()] = e
	}
	put := func(e Entry) { cur[e.key()] = e }
	drop := func(kind EntryKind, loc game.Location) { delete(cur, string(kind)+"|"+loc.Key()) }
	matches := func(e Entry, obs Observation) (Entry, bool) {
		want, ok := after.Expected(e)
		if !ok || !obs.Exists || obs.IsDir || !want.Matches(obs.Evidence, e.Method) {
			return Entry{}, false
		}
		got := e
		got.Evidence = obs.Evidence
		if got.Evidence.Hash == "" {
			got.Evidence.Hash = want.Hash
		}
		return got, true
	}

	var outcomes []Outcome
	for i, a := range j.Actions {
		if j.State(i) == StateSkipped {
			continue
		}
		obs := after.At(a.Location)
		done := false
		switch a.Kind {
		case ActionCreate:
			if e, ok := matches(*a.Desired, obs); ok {
				put(e)
				done = true
			}
		case ActionBackupAndCreate:
			if a.Backup != nil {
				b := after.Backup(a.Backup.BackupPath)
				if b.Exists && !b.IsDir && a.Backup.Evidence.SameOriginal(b.Evidence) {
					put(*a.Backup)
				}
			}
			if e, ok := matches(*a.Desired, obs); ok {
				put(e)
				done = true
			}
		case ActionReplaceManaged:
			if e, ok := matches(*a.Desired, obs); ok {
				put(e)
				done = true
			} else if a.Current != nil && (!obs.Exists || !a.Current.Evidence.Matches(obs.Evidence, a.Current.Method)) {
				// Neither the new nor the old file: whatever is there is
				// not the manager's any more.
				drop(KindLink, a.Location)
			}
		case ActionRemoveManaged:
			// Done once our file is gone; whatever sits there now (the
			// original restored by the next action, or a tool's file) is
			// not the manager's.
			if a.Current != nil && (!obs.Exists || obs.IsDir || !a.Current.Evidence.Matches(obs.Evidence, a.Current.Method)) {
				drop(KindLink, a.Location)
				done = true
			}
		case ActionRestoreBackup:
			if a.Current != nil {
				b := after.Backup(a.Current.BackupPath)
				if !b.Exists && obs.Exists && a.Current.Evidence.SameOriginal(obs.Evidence) {
					drop(KindBackup, a.Location)
					done = true
				}
			}
		case ActionMkdir:
			if obs.Exists && obs.IsDir {
				put(Entry{Location: a.Location, Kind: KindDir})
				done = true
			}
		case ActionRemoveDir:
			if !obs.Exists {
				drop(KindDir, a.Location)
				done = true
			}
		}
		outcomes = append(outcomes, Outcome{Index: i, Done: done})
	}
	out := make([]Entry, 0, len(cur))
	for _, e := range cur {
		out = append(out, e)
	}
	return out, outcomes
}
