package deployment

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func loc(p string) game.Location { return game.Location{Target: "data", Path: relpath.MustParse(p)} }

func link(p string) Entry {
	return Entry{Location: loc(p), Kind: KindLink, Mod: "m1", Installation: "inst", Source: relpath.MustParse(p), Method: game.MethodHardlink, Evidence: Evidence{FileID: "v:1"}}
}

func TestManifestOwnsOnlyItsLinks(t *testing.T) {
	backup := Entry{Location: loc("A.esp"), Kind: KindBackup, BackupPath: relpath.MustParse("b/A.esp")}
	m, err := NewManifest("i1", "p1", "sha256:x", "op1", t0, []Entry{link("z.dds"), link("A.esp"), backup, {Location: loc("meshes"), Kind: KindDir}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := m.Owns(loc("a.ESP")); !ok {
		t.Fatal("manifest must own its links (case-insensitive)")
	}
	if _, ok := m.Backup(loc("a.esp")); !ok {
		t.Fatal("a location may have a link and the backup of the original")
	}
	if _, ok := m.Owns(loc("user.ini")); ok {
		t.Fatal("files outside the manifest are not owned")
	}
	if _, ok := m.Owns(game.Location{Target: "root", Path: relpath.MustParse("A.esp")}); ok {
		t.Fatal("ownership is per target")
	}
	if len(m.Dirs()) != 1 || m.Purged() {
		t.Fatalf("dirs = %v", m.Dirs())
	}
}

func TestManifestValidation(t *testing.T) {
	bad := map[string]Entry{
		"link without source": {Location: loc("a"), Kind: KindLink, Mod: "m", Installation: "i", Method: game.MethodCopy},
		"backup without path": {Location: loc("a"), Kind: KindBackup},
		"unknown kind":        {Location: loc("a"), Kind: "magic"},
	}
	for name, e := range bad {
		if _, err := NewManifest("i1", "p1", "fp", "op", t0, []Entry{e}); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: expected ErrInvalid, got %v", name, err)
		}
	}
	if _, err := NewManifest("i1", "p1", "fp", "op", t0, []Entry{link("a"), link("A")}); !errors.Is(err, ErrInvalid) {
		t.Fatal("same link twice must be rejected")
	}
	if _, err := NewManifest("i1", "", "fp", "op", t0, nil); !errors.Is(err, ErrInvalid) {
		t.Fatal("deploy manifest needs a profile")
	}
	p, err := NewPurged("i1", "op2", t0)
	if err != nil || !p.Purged() || len(p.Entries()) != 0 {
		t.Fatalf("purge manifest: %v", err)
	}
}

func TestEvidenceMatchesPerMethod(t *testing.T) {
	rec := Evidence{FileID: "v:1", LinkTarget: `D:\S\m\a`, Size: 5, ModTime: t0, Hash: "h"}
	if !rec.Matches(Evidence{FileID: "v:1"}, game.MethodHardlink) || rec.Matches(Evidence{FileID: "v:2"}, game.MethodHardlink) {
		t.Fatal("hardlink identity is the file id")
	}
	if !rec.Matches(Evidence{LinkTarget: `d:\s\M\A`}, game.MethodSymlink) {
		t.Fatal("symlink target compares case-insensitively")
	}
	if rec.Matches(Evidence{Size: 5, ModTime: t0, Hash: "other"}, game.MethodCopy) {
		t.Fatal("copy with a different hash does not match")
	}
	if (Evidence{}).Matches(Evidence{}, game.MethodHardlink) {
		t.Fatal("empty evidence never matches")
	}
}

func TestJournalOrdersActionsSafely(t *testing.T) {
	d := link("new")
	cur := link("old")
	j, err := NewJournal("i1", "op1", JournalDeploy, "p1", "fp", []Action{
		{Kind: ActionCreate, Location: loc("new"), Desired: &d},
		{Kind: ActionKeep, Location: loc("same")},
		{Kind: ActionRemoveDir, Location: loc("dir")},
		{Kind: ActionRemoveManaged, Location: loc("old"), Current: &cur},
	}, t0)
	if err != nil {
		t.Fatal(err)
	}
	kinds := []ActionKind{j.Actions[0].Kind, j.Actions[1].Kind, j.Actions[2].Kind}
	if len(j.Actions) != 3 || kinds[0] != ActionRemoveManaged || kinds[1] != ActionCreate || kinds[2] != ActionRemoveDir {
		t.Fatalf("apply order = %v", kinds)
	}
	_ = j.Mark(0, StateDone)
	if p := j.Pending(); len(p) != 2 || p[0] != 1 {
		t.Fatalf("pending = %v", p)
	}
	if _, err := RestoreJournal(*j, []ActionState{StateDone}); !errors.Is(err, ErrInvalid) {
		t.Fatal("progress must match actions")
	}
}
