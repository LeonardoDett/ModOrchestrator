package deployment

import (
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// fakeAfter is a scripted observation after (part of) a journal ran.
type fakeAfter struct {
	at      map[string]Observation
	backups map[string]Observation
	staged  map[string]Evidence // by source path
}

func (f fakeAfter) At(l game.Location) Observation { return f.at[l.Key()] }
func (f fakeAfter) Backup(p relpath.Path) Observation {
	return f.backups[p.Key()]
}
func (f fakeAfter) Expected(e Entry) (Evidence, bool) {
	ev, ok := f.staged[e.Source.Key()]
	return ev, ok
}

func file(id string) Observation {
	return Observation{Exists: true, Evidence: Evidence{FileID: id, Size: 1}}
}

func TestSettleRecordsOnlyObservedEffects(t *testing.T) {
	oldLink := link("old")
	replaced := link("swap")
	newSwap := link("swap")
	newSwap.Mod, newSwap.Source = "m2", relpath.MustParse("swap2")
	created := link("new")
	notMade := link("ghost")
	orig := Entry{Location: loc("base.esm"), Kind: KindBackup, BackupPath: relpath.MustParse("data/base.esm"), Evidence: Evidence{FileID: "v:orig"}}
	overBase := link("base.esm")
	prev := []Entry{oldLink, replaced, {Location: loc("gone"), Kind: KindDir}}
	j, err := NewJournal("i1", "op", JournalDeploy, "p1", "fp", []Action{
		{Kind: ActionRemoveManaged, Location: loc("old"), Current: &oldLink},
		{Kind: ActionReplaceManaged, Location: loc("swap"), Current: &replaced, Desired: &newSwap},
		{Kind: ActionCreate, Location: loc("new"), Desired: &created},
		{Kind: ActionCreate, Location: loc("ghost"), Desired: &notMade},
		{Kind: ActionBackupAndCreate, Location: loc("base.esm"), Desired: &overBase, Backup: &orig},
		{Kind: ActionMkdir, Location: loc("dir")},
		{Kind: ActionRemoveDir, Location: loc("gone"), Current: &Entry{Location: loc("gone"), Kind: KindDir}},
	}, t0)
	if err != nil {
		t.Fatal(err)
	}
	after := fakeAfter{
		at: map[string]Observation{
			loc("swap").Key():     file("s:swap2"),
			loc("new").Key():      file("s:new"),
			loc("base.esm").Key(): file("s:base.esm"),
			loc("dir").Key():      {Exists: true, IsDir: true},
		},
		backups: map[string]Observation{"data/base.esm": file("v:orig")},
		staged:  map[string]Evidence{"swap2": {FileID: "s:swap2"}, "new": {FileID: "s:new"}, "ghost": {FileID: "s:ghost"}, "base.esm": {FileID: "s:base.esm"}},
	}
	entries, outcomes := Settle(prev, j, after)
	m, err := NewManifest("i1", "p1", "fp", "op", t0, entries)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := m.Owns(loc("old")); ok {
		t.Fatal("removed link is dropped")
	}
	if e, ok := m.Owns(loc("swap")); !ok || e.Mod != "m2" || e.Evidence.FileID != "s:swap2" {
		t.Fatalf("replacement recorded with observed evidence: %+v", e)
	}
	if _, ok := m.Owns(loc("ghost")); ok {
		t.Fatal("an action without observed effect is never recorded (INV-DEP-05)")
	}
	if _, ok := m.Backup(loc("base.esm")); !ok {
		t.Fatal("backup recorded when the original sits in the store")
	}
	if len(m.Dirs()) != 1 || m.Dirs()[0].Location.Key() != loc("dir").Key() {
		t.Fatalf("dirs = %+v", m.Dirs())
	}
	done := 0
	for _, o := range outcomes {
		if o.Done {
			done++
		}
	}
	if done != 6 {
		t.Fatalf("6 of 7 actions took effect: %+v", outcomes)
	}
}

func TestSettleAfterInterruption(t *testing.T) {
	cur := link("a")
	want := link("a")
	want.Mod = "m2"
	orig := Entry{Location: loc("b"), Kind: KindBackup, BackupPath: relpath.MustParse("data/b"), Evidence: Evidence{FileID: "v:orig"}}
	over := link("b")
	j, _ := NewJournal("i1", "op", JournalDeploy, "p1", "fp", []Action{
		{Kind: ActionReplaceManaged, Location: loc("a"), Current: &cur, Desired: &want},
		{Kind: ActionBackupAndCreate, Location: loc("b"), Desired: &over, Backup: &orig},
	}, t0)
	// Killed after moving the original away, before the link was made.
	after := fakeAfter{
		at:      map[string]Observation{loc("a").Key(): {Exists: true, Evidence: cur.Evidence}},
		backups: map[string]Observation{"data/b": file("v:orig")},
		staged:  map[string]Evidence{"a": {FileID: "s:a"}, "b": {FileID: "s:b"}},
	}
	entries, _ := Settle([]Entry{cur}, j, after)
	m, _ := NewManifest("i1", "p1", "fp", "op", t0, entries)
	if e, ok := m.Owns(loc("a")); !ok || e.Mod != "m1" {
		t.Fatal("a replacement that did not happen keeps the old entry")
	}
	if _, ok := m.Backup(loc("b")); !ok {
		t.Fatal("the moved original is tracked so purge brings it back")
	}
	if _, ok := m.Owns(loc("b")); ok {
		t.Fatal("no link was made")
	}
	// Skipped actions are ignored even if the location happens to match.
	j2, _ := NewJournal("i1", "op", JournalDeploy, "p1", "fp", []Action{{Kind: ActionMkdir, Location: loc("x")}}, t0)
	_ = j2.Mark(0, StateSkipped)
	entries, _ = Settle(nil, j2, fakeAfter{at: map[string]Observation{loc("x").Key(): {Exists: true, IsDir: true}}})
	if len(entries) != 0 {
		t.Fatal("a folder the manager did not create is never adopted")
	}
}

func TestSettleRestoreAndRemoveDir(t *testing.T) {
	b := Entry{Location: loc("b"), Kind: KindBackup, BackupPath: relpath.MustParse("data/b"), Evidence: Evidence{FileID: "v:orig"}}
	dir := Entry{Location: loc("d"), Kind: KindDir}
	j, _ := NewJournal("i1", "op", JournalPurge, "p1", "", []Action{
		{Kind: ActionRestoreBackup, Location: loc("b"), Current: &b},
		{Kind: ActionRemoveDir, Location: loc("d"), Current: &dir},
	}, t0)
	notYet := fakeAfter{backups: map[string]Observation{"data/b": file("v:orig")}, at: map[string]Observation{loc("d").Key(): {Exists: true, IsDir: true}}}
	if entries, _ := Settle([]Entry{b, dir}, j, notYet); len(entries) != 2 {
		t.Fatal("nothing happened: entries stay")
	}
	done := fakeAfter{at: map[string]Observation{loc("b").Key(): file("v:orig")}}
	if entries, _ := Settle([]Entry{b, dir}, j, done); len(entries) != 0 {
		t.Fatalf("restored and removed: %+v", entries)
	}
}

// A set-aside is confirmed when the found file sits in the BackupStore and
// left the location; only the stale link is forgotten, nothing recorded.
func TestSettleSetAside(t *testing.T) {
	stale := link("a.esp")
	found := Evidence{FileID: "v:found", Size: 1}
	aside := &Entry{Location: loc("a.esp"), Kind: KindBackup, BackupPath: relpath.MustParse("data/a.esp.backup1"), Evidence: found}
	j, err := NewJournal("i1", "op", JournalDeploy, "p1", "fp", []Action{{Kind: ActionSetAside, Location: loc("a.esp"), Current: &stale, Backup: aside}}, t0)
	if err != nil {
		t.Fatal(err)
	}
	_ = j.Mark(0, StateDone)
	moved := fakeAfter{at: map[string]Observation{}, backups: map[string]Observation{aside.BackupPath.Key(): {Exists: true, Evidence: found}}}
	entries, out := Settle([]Entry{stale}, j, moved)
	if len(entries) != 0 || !out[0].Done {
		t.Fatalf("set aside: %+v %+v", entries, out)
	}
	notMoved := fakeAfter{at: map[string]Observation{loc("a.esp").Key(): {Exists: true, Evidence: found}}, backups: map[string]Observation{}}
	entries, out = Settle([]Entry{stale}, j, notMoved)
	if len(entries) != 1 || out[0].Done {
		t.Fatalf("nothing moved, nothing forgotten: %+v %+v", entries, out)
	}
}
