package externalchange

import (
	"errors"
	"slices"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

var (
	loc = game.Location{Target: "data", Path: relpath.MustParse("a.esp")}
	t0  = time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
)

func entry(m game.DeploymentMethod) deployment.Entry {
	return deployment.Entry{Location: loc, Kind: deployment.KindLink, Mod: "m1", Installation: "i", Source: relpath.MustParse("a.esp"), Method: m,
		Evidence: deployment.Evidence{FileID: "v:1", Size: 10, ModTime: t0, Hash: "h"}}
}

func obs(fileID string, size int64, at time.Time) deployment.Observation {
	return deployment.Observation{Exists: true, Evidence: deployment.Evidence{FileID: fileID, Size: size, ModTime: at}}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		name   string
		method game.DeploymentMethod
		obs    deployment.Observation
		want   Kind
	}{
		{"missing", game.MethodHardlink, deployment.Observation{}, KindMissing},
		{"unreadable is never absent", game.MethodHardlink, deployment.Observation{Unreadable: true}, KindPermission},
		{"other file at the location", game.MethodHardlink, obs("v:2", 10, t0), KindReplaced},
		{"a folder at the location", game.MethodHardlink, deployment.Observation{Exists: true, IsDir: true}, KindReplaced},
		{"edited through the hardlink (size)", game.MethodHardlink, obs("v:1", 12, t0), KindModified},
		{"edited through the hardlink (time)", game.MethodHardlink, obs("v:1", 10, t0.Add(time.Minute)), KindModified},
		{"copy edited", game.MethodCopy, obs("v:9", 11, t0.Add(time.Minute)), KindModified},
		{"symlink pointing elsewhere", game.MethodSymlink, deployment.Observation{Exists: true, Evidence: deployment.Evidence{LinkTarget: `C:\x`}}, KindReplaced},
	}
	for _, c := range cases {
		e := entry(c.method)
		if c.method == game.MethodSymlink {
			e.Evidence.LinkTarget = `C:\staging\m1\a.esp`
		}
		got, found := Classify(e, c.obs)
		if !found || got.Kind != c.want || !got.Managed() {
			t.Errorf("%s: got %+v, want %s", c.name, got, c.want)
		}
	}
	if _, found := Classify(entry(game.MethodHardlink), obs("v:1", 10, t0)); found {
		t.Fatal("matching evidence is not a change")
	}
}

// The actions offered follow core/09 §4, the suggestion first.
func TestActionsBySituation(t *testing.T) {
	hard, _ := Classify(entry(game.MethodHardlink), obs("v:1", 12, t0))
	if a := Actions(hard); !slices.Equal(a, []Action{ActionKeepChange, ActionIgnoreNow}) {
		t.Fatalf("hardlink edit without a retained archive cannot be reverted: %v", a)
	}
	hard.Retained = true
	if Suggested(hard) != ActionKeepChange || !slices.Contains(Actions(hard), ActionRevert) {
		t.Fatalf("hardlink edit: %v", Actions(hard))
	}
	copied, _ := Classify(entry(game.MethodCopy), obs("v:9", 11, t0))
	if Suggested(copied) != ActionSaveToMod {
		t.Fatal("an edited copy suggests saving it to the mod")
	}
	replaced, _ := Classify(entry(game.MethodHardlink), obs("v:2", 10, t0))
	if Suggested(replaced) != ActionSaveToMod {
		t.Fatal("a different file suggests saving it")
	}
	replaced.MatchesOriginal = true
	if Suggested(replaced) != ActionRevert {
		t.Fatal("the store putting the original back suggests reverting")
	}
	missing, _ := Classify(entry(game.MethodHardlink), deployment.Observation{})
	if Suggested(missing) != ActionRestore {
		t.Fatal("a missing file suggests restoring it")
	}
	if err := (Decision{Change: hard, Action: ActionCapture}).Validate(); !errors.Is(err, ErrInvalid) {
		t.Fatal("capture is not offered for a modified managed file")
	}
}

// INV-EXT-03: no decision about a generated file can delete it; none is
// pre-selected unless the adapter hints "leave unmanaged".
func TestGeneratedFiles(t *testing.T) {
	u, err := Unexpected(loc, obs("v:9", 1, t0))
	if err != nil || u.Managed() {
		t.Fatalf("unexpected: %v", err)
	}
	if Suggested(u) != "" {
		t.Fatal("nothing is pre-selected for generated files")
	}
	for _, a := range Actions(u) {
		if a == ActionRevert || a == ActionRestore || a == ActionAcceptRemoval {
			t.Fatal("generated files can never be removed by a decision (INV-EXT-03)")
		}
	}
	if err := (Decision{Change: u, Action: ActionCapture, CaptureInto: "gen"}).Validate(); err != nil {
		t.Fatal(err)
	}
	u.HintUnmanaged = true
	if Suggested(u) != ActionLeaveUnmanaged {
		t.Fatal("a hinted log file suggests leaving it unmanaged")
	}
	if _, err := Unexpected(loc, deployment.Observation{Exists: true, IsDir: true}); !errors.Is(err, ErrInvalid) {
		t.Fatal("a folder is not a generated file")
	}
	if _, err := NewUnmanaged("", loc, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("decision needs an instance")
	}
}

func TestOwnFiles(t *testing.T) {
	for _, n := range []string{".modorchestrator-deployment.json", "a.esp.modorchestrator-tmp"} {
		if !IsOwnFile(n) {
			t.Errorf("%s is the manager's", n)
		}
	}
	if IsOwnFile("nemesis.log") {
		t.Fatal("a tool's file is not ours")
	}
}

func TestHints(t *testing.T) {
	d := game.Definition{UnmanagedHints: []game.FilePattern{{Target: "data", Glob: "*.log"}}}
	if !d.HintsUnmanaged(game.Location{Target: "data", Path: relpath.MustParse("Nemesis.LOG")}) {
		t.Fatal("patterns ignore case")
	}
	if d.HintsUnmanaged(game.Location{Target: "data", Path: relpath.MustParse("logs/a.log")}) {
		t.Fatal("*.log only matches the root of the target")
	}
}
