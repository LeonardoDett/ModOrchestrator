package deployplan

import (
	"slices"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func loc(p string) game.Location { return game.Location{Target: "data", Path: relpath.MustParse(p)} }

func winner(p string, m mod.ID) conflict.Winner {
	return conflict.Winner{Location: loc(p), Mod: m, Installation: mod.InstallationID("inst-" + m), File: mod.File{Source: relpath.MustParse(p), Dest: loc(p), Size: 1}}
}

func hardlink(mod.ID, game.TargetID) Method { return Method{Method: game.MethodHardlink} }

func desired(fp string, ws ...conflict.Winner) Desired {
	return BuildDesired("p1", deployment.Fingerprint(fp), ws, hardlink)
}

// apply simulates a verified execution: every create/replace becomes a
// manifest entry whose evidence is what the scan will observe next time, and
// every planned folder exists afterwards.
func apply(t *testing.T, d Desired, p Plan) (*deployment.Manifest, map[string]deployment.Observation, map[string]deployment.Observation) {
	t.Helper()
	obs := map[string]deployment.Observation{}
	dirs := map[string]deployment.Observation{}
	var entries []deployment.Entry
	for _, f := range d.Files {
		ev := deployment.Evidence{FileID: "v:" + f.Location.Key() + string(f.Mod), Size: 1}
		entries = append(entries, deployment.Entry{Location: f.Location, Kind: deployment.KindLink, Mod: f.Mod, Installation: f.Installation, Source: f.Source, Method: f.Method, Evidence: ev})
		obs[f.Location.Key()] = deployment.Observation{Exists: true, Evidence: ev}
	}
	for _, a := range p.Actions {
		switch a.Kind {
		case deployment.ActionBackupAndCreate:
			entries = append(entries, *a.Backup)
		case deployment.ActionMkdir:
			entries = append(entries, deployment.Entry{Location: a.Location, Kind: deployment.KindDir})
			dirs[a.Location.Key()] = deployment.Observation{Exists: true, IsDir: true}
		}
	}
	m, err := deployment.NewManifest("i1", d.Profile, d.Fingerprint, "op", t0, entries)
	if err != nil {
		t.Fatal(err)
	}
	return m, obs, dirs
}

func absent(locs ...string) map[string]deployment.Observation {
	out := map[string]deployment.Observation{}
	for _, l := range locs {
		out[loc(l).Key()] = deployment.Observation{}
	}
	return out
}

func kinds(p Plan) []deployment.ActionKind {
	var out []deployment.ActionKind
	for _, a := range p.Actions {
		out = append(out, a.Kind)
	}
	return out
}

func TestFirstDeployAndIdempotence(t *testing.T) {
	d := desired("fp1", winner("a.esp", "m1"), winner("meshes/x.nif", "m2"))
	observed := map[string]deployment.Observation{
		loc("a.esp").Key():        {Exists: true, Evidence: deployment.Evidence{FileID: "v:orig"}}, // unmanaged original
		loc("meshes/x.nif").Key(): {},
	}
	p := Build(Input{Desired: d, Observed: observed})
	if p.Summary.Create != 1 || p.Summary.BackupAndCreate != 1 || p.Summary.Mkdir != 1 || p.NeedsDecision() {
		t.Fatalf("first deploy: %+v", p.Summary)
	}
	if got := kinds(p); !slices.Equal(got, []deployment.ActionKind{deployment.ActionMkdir, deployment.ActionBackupAndCreate, deployment.ActionCreate}) {
		t.Fatalf("folders first, backups before creations: %v", got)
	}
	var b *deployment.Entry
	for _, a := range p.Actions {
		if a.Backup != nil {
			b = a.Backup
		}
	}
	if b == nil || b.Evidence.FileID != "v:orig" || b.BackupPath.String() != "data/a.esp" {
		t.Fatalf("backup keeps the identity of the original: %+v", b)
	}
	m, obs, dirs := apply(t, d, p)
	again := Build(Input{Desired: d, Applied: m, Observed: obs, Dirs: dirs, CleanDirs: true})
	if !again.Empty() || again.Summary.Keep != 2 {
		t.Fatalf("second plan must be empty (INV-DEP-04): %+v", again.Summary)
	}
}

func TestDiffOnlyTouchesChangedLocations(t *testing.T) {
	d1 := desired("fp1", winner("a", "m1"), winner("b", "m1"), winner("c/d", "m1"))
	m, obs, dirs := apply(t, d1, Build(Input{Desired: d1, Observed: absent("a", "b", "c/d")}))
	d2 := desired("fp2", winner("a", "m1"), winner("b", "m2"))
	p := Build(Input{Desired: d2, Applied: m, Observed: obs, Dirs: dirs, CleanDirs: true})
	s := p.Summary
	if s.Keep != 1 || s.Replace != 1 || s.Remove != 1 || s.RemoveDir != 1 || s.Create != 0 {
		t.Fatalf("diff = %+v", s)
	}
	if p.Actions[0].Kind != deployment.ActionRemoveManaged || p.Actions[len(p.Actions)-1].Kind != deployment.ActionKeep {
		t.Fatalf("removals run first: %v", kinds(p))
	}
	if !p.Complete() {
		t.Fatal("nothing to decide")
	}
	// Without the cleanup setting the folder the manager created stays.
	if p := Build(Input{Desired: d2, Applied: m, Observed: obs, Dirs: dirs}); p.Summary.RemoveDir != 0 {
		t.Fatal("folders are removed only when cleanup is on")
	}
}

func TestNestedFoldersAreCreatedOuterFirstAndRemovedInnerFirst(t *testing.T) {
	d := desired("fp1", winner("a/b/c/x", "m1"))
	p := Build(Input{Desired: d, Observed: absent("a/b/c/x"), Dirs: map[string]deployment.Observation{loc("a").Key(): {Exists: true, IsDir: true}}})
	var made []string
	for _, a := range p.Actions {
		if a.Kind == deployment.ActionMkdir {
			made = append(made, a.Location.Path.String())
		}
	}
	if !slices.Equal(made, []string{"a/b", "a/b/c"}) {
		t.Fatalf("only missing folders, outer first: %v", made)
	}
	m, obs, dirs := apply(t, d, p)
	purge := Build(PurgeInput(Input{Desired: d, Applied: m, Observed: obs, Dirs: dirs}))
	var removed []string
	for _, a := range purge.Actions {
		if a.Kind == deployment.ActionRemoveDir {
			removed = append(removed, a.Location.Path.String())
		}
	}
	if !slices.Equal(removed, []string{"a/b/c", "a/b"}) {
		t.Fatalf("only folders the manager created, inner first (INV-DEP-09): %v", removed)
	}
}

func TestExternalChangeBlocksItsLocation(t *testing.T) {
	d := desired("fp1", winner("a", "m1"), winner("b", "m1"))
	m, obs, _ := apply(t, d, Build(Input{Desired: d, Observed: absent("a", "b")}))
	obs[loc("a").Key()] = deployment.Observation{Exists: true, Evidence: deployment.Evidence{FileID: "v:steam-restored"}}
	delete(obs, loc("b").Key()) // not observed: never treated as absent
	p := Build(Input{Desired: d, Applied: m, Observed: obs})
	if !p.NeedsDecision() || len(p.Changes) != 2 || p.Summary.Keep != 0 {
		t.Fatalf("both locations need triage, nothing else planned: %+v", p)
	}
	for _, a := range p.Actions {
		if a.Location.Key() == loc("a").Key() || a.Location.Key() == loc("b").Key() {
			t.Fatalf("no action may touch a divergent location: %+v", a)
		}
	}
	// "Leave untouched" for this run: the plan proceeds without them.
	skip := Build(Input{Desired: d, Applied: m, Observed: obs, Skip: map[string]bool{loc("a").Key(): true, loc("b").Key(): true}})
	if skip.NeedsDecision() || len(skip.Skipped) != 2 || skip.Complete() || len(skip.Actions) != 0 {
		t.Fatalf("skipped locations get no action and the run is partial: %+v", skip)
	}
}

func TestMethodFallbackWaitsForDecision(t *testing.T) {
	method := func(m mod.ID, _ game.TargetID) Method {
		if m == "root-mod" {
			return Method{Method: game.MethodCopy, FallbackFrom: game.MethodSymlink}
		}
		return Method{Method: game.MethodSymlink}
	}
	d := BuildDesired("p1", "fp", []conflict.Winner{winner("a", "m1"), winner("b", "root-mod")}, method)
	p := Build(Input{Desired: d, Observed: absent("a", "b")})
	if len(p.Fallbacks) != 1 || p.Fallbacks[0].From != game.MethodSymlink || p.Fallbacks[0].To != game.MethodCopy || len(p.Actions) != 1 {
		t.Fatalf("the fallback waits, the rest is planned: %+v", p)
	}
	accepted := Build(Input{Desired: d, Observed: absent("a", "b"), AcceptedFallbacks: map[string]bool{p.Fallbacks[0].Key(): true}})
	if accepted.NeedsDecision() || accepted.Summary.Create != 2 || accepted.Summary.ExtraBytes != 1 {
		t.Fatalf("accepted fallback uses the proposed method: %+v", accepted.Summary)
	}
}

func TestBlockedTargetAndOccupiedLocations(t *testing.T) {
	d := desired("fp1", winner("a", "m1"))
	p := Build(Input{Desired: d, Observed: absent("a"), BlockedTargets: map[game.TargetID]bool{"data": true}})
	if len(p.Blocked) != 1 || p.Blocked[0].Reason != BlockTargetUnavailable || len(p.Actions) != 0 {
		t.Fatalf("unavailable target blocks its locations: %+v", p)
	}
	dir := Build(Input{Desired: d, Observed: map[string]deployment.Observation{loc("a").Key(): {Exists: true, IsDir: true}}})
	if len(dir.Blocked) != 1 || dir.Blocked[0].Reason != BlockOccupied {
		t.Fatalf("a folder where a file goes is never moved away: %+v", dir)
	}
}

func TestPurgeRemovesAndRestores(t *testing.T) {
	d := desired("fp1", winner("a", "m1"))
	first := Build(Input{Desired: d, Observed: map[string]deployment.Observation{loc("a").Key(): {Exists: true, Evidence: deployment.Evidence{FileID: "v:orig"}}}})
	m, obs, dirs := apply(t, d, first)
	p := Build(PurgeInput(Input{Desired: d, Applied: m, Observed: obs, Dirs: dirs}))
	if p.Summary.Remove != 1 || p.Summary.RestoreBackup != 1 {
		t.Fatalf("purge must remove the link and restore the original: %+v", p.Summary)
	}
	// The link vanished outside the app: the original still comes back,
	// unless something else now sits there.
	obs[loc("a").Key()] = deployment.Observation{}
	gone := Build(PurgeInput(Input{Desired: d, Applied: m, Observed: obs}))
	if len(gone.Changes) != 1 || gone.Summary.RestoreBackup != 0 {
		t.Fatalf("a missing managed file is an external change first: %+v", gone)
	}
}

func TestBackupWithoutLinkIsRestoredOnlyIfFree(t *testing.T) {
	b := deployment.Entry{Location: loc("a"), Kind: deployment.KindBackup, BackupPath: relpath.MustParse("data/a"), Evidence: deployment.Evidence{FileID: "v:orig"}}
	m, err := deployment.NewManifest("i1", "p1", "fp", "op", t0, []deployment.Entry{b})
	if err != nil {
		t.Fatal(err)
	}
	free := Build(PurgeInput(Input{Applied: m, Observed: absent("a")}))
	if free.Summary.RestoreBackup != 1 {
		t.Fatalf("free location gets its original back: %+v", free.Summary)
	}
	busy := Build(PurgeInput(Input{Applied: m, Observed: map[string]deployment.Observation{loc("a").Key(): {Exists: true, Evidence: deployment.Evidence{FileID: "v:new"}}}}))
	if len(busy.Blocked) != 1 || busy.Summary.RestoreBackup != 0 {
		t.Fatalf("an occupied location never loses its file: %+v", busy)
	}
}

func TestInputFingerprintIsDeterministic(t *testing.T) {
	a := InputFingerprint("p1", []string{"m1 on", "m2 off"})
	if a != InputFingerprint("p1", []string{"m1 on", "m2 off"}) || a == InputFingerprint("p1", []string{"m2 off", "m1 on"}) || a == InputFingerprint("p2", []string{"m1 on", "m2 off"}) {
		t.Fatal("fingerprint depends on every input and its order")
	}
}
