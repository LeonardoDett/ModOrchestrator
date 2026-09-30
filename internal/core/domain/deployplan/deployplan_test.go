package deployplan

import (
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

func hardlink(mod.ID) game.DeploymentMethod { return game.MethodHardlink }

// apply simulates a verified execution: every create/replace becomes a
// manifest entry whose evidence is what the scan will observe next time.
func apply(t *testing.T, d Desired, p Plan, dirs ...string) (*deployment.Manifest, map[string]deployment.Observation) {
	t.Helper()
	obs := map[string]deployment.Observation{}
	var entries []deployment.Entry
	for _, f := range d.Files {
		ev := deployment.Evidence{FileID: "v:" + f.Location.Key() + string(f.Mod), Size: 1}
		entries = append(entries, deployment.Entry{Location: f.Location, Kind: deployment.KindLink, Mod: f.Mod, Installation: f.Installation, Source: f.Source, Method: f.Method, Evidence: ev})
		obs[f.Location.Key()] = deployment.Observation{Exists: true, Evidence: ev}
	}
	for _, a := range p.Actions {
		if a.Kind == deployment.ActionBackupAndCreate {
			entries = append(entries, deployment.Entry{Location: a.Location, Kind: deployment.KindBackup, BackupPath: a.Location.Path})
		}
	}
	for _, dir := range dirs {
		entries = append(entries, deployment.Entry{Location: loc(dir), Kind: deployment.KindDir})
	}
	m, err := deployment.NewManifest("i1", d.Profile, d.Fingerprint, "op", t0, entries)
	if err != nil {
		t.Fatal(err)
	}
	return m, obs
}

func TestFirstDeployAndIdempotence(t *testing.T) {
	d := BuildDesired("p1", []conflict.Winner{winner("a.esp", "m1"), winner("meshes/x.nif", "m2")}, hardlink)
	observed := map[string]deployment.Observation{
		loc("a.esp").Key():        {Exists: true, Evidence: deployment.Evidence{FileID: "v:orig"}}, // unmanaged original
		loc("meshes/x.nif").Key(): {},
	}
	p := Build(d, nil, observed)
	if p.Summary.Create != 1 || p.Summary.BackupAndCreate != 1 || p.NeedsDecision() {
		t.Fatalf("first deploy: %+v", p.Summary)
	}
	m, obs := apply(t, d, p, "meshes")
	again := Build(d, m, obs)
	if !again.Empty() || again.Summary.Keep != 2 {
		t.Fatalf("second plan must be empty (INV-DEP-04): %+v", again.Summary)
	}
}

func TestDiffOnlyTouchesChangedLocations(t *testing.T) {
	d1 := BuildDesired("p1", []conflict.Winner{winner("a", "m1"), winner("b", "m1"), winner("c/d", "m1")}, hardlink)
	m, obs := apply(t, d1, Build(d1, nil, map[string]deployment.Observation{loc("a").Key(): {}, loc("b").Key(): {}, loc("c/d").Key(): {}}), "c")
	d2 := BuildDesired("p1", []conflict.Winner{winner("a", "m1"), winner("b", "m2")}, hardlink)
	if d1.Fingerprint == d2.Fingerprint {
		t.Fatal("different desired states need different fingerprints")
	}
	p := Build(d2, m, obs)
	s := p.Summary
	if s.Keep != 1 || s.Replace != 1 || s.Remove != 1 || s.RemoveDir != 1 || s.Create != 0 {
		t.Fatalf("diff = %+v", s)
	}
	if p.Actions[0].Kind != deployment.ActionRemoveManaged {
		t.Fatalf("removals run first: %v", p.Actions[0].Kind)
	}
}

func TestExternalChangeBlocksItsLocation(t *testing.T) {
	d := BuildDesired("p1", []conflict.Winner{winner("a", "m1"), winner("b", "m1")}, hardlink)
	m, obs := apply(t, d, Build(d, nil, map[string]deployment.Observation{loc("a").Key(): {}, loc("b").Key(): {}}))
	obs[loc("a").Key()] = deployment.Observation{Exists: true, Evidence: deployment.Evidence{FileID: "v:steam-restored"}}
	delete(obs, loc("b").Key()) // not observed: never treated as absent
	p := Build(d, m, obs)
	if !p.NeedsDecision() || len(p.Changes) != 2 || p.Summary.Keep != 0 {
		t.Fatalf("both locations need triage, nothing else planned: %+v", p)
	}
	for _, a := range p.Actions {
		if a.Kind != deployment.ActionKeep {
			t.Fatalf("no action may touch a divergent location: %+v", a)
		}
	}
}

func TestPurgeRemovesAndRestores(t *testing.T) {
	d := BuildDesired("p1", []conflict.Winner{winner("a", "m1")}, hardlink)
	first := Build(d, nil, map[string]deployment.Observation{loc("a").Key(): {Exists: true, Evidence: deployment.Evidence{FileID: "v:orig"}}})
	m, obs := apply(t, d, first)
	p := BuildPurge(m, obs)
	if p.Summary.Remove != 1 || p.Summary.RestoreBackup != 1 {
		t.Fatalf("purge must remove the link and restore the original: %+v", p.Summary)
	}
}
