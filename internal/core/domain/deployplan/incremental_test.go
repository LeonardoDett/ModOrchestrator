package deployplan

import (
	"fmt"
	"math/rand"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

// D139: a plan restricted to the touched locations (Only) gives the same
// actions and summary as the full plan over a verified manifest whose
// other links are as recorded.
func TestIncrementalPlanMatchesFullPlan(t *testing.T) {
	r := rand.New(rand.NewSource(7))
	targets := []game.TargetID{"data", "data2"}
	dirs := []string{"", "meshes/", "Meshes/a/", "textures/b/", "scripts/"}
	randLoc := func() game.Location {
		p := fmt.Sprintf("%sf%d.dds", dirs[r.Intn(len(dirs))], r.Intn(60))
		return game.Location{Target: targets[r.Intn(len(targets))], Path: relpath.MustParse(p)}
	}
	win := func(l game.Location, m mod.ID) conflict.Winner {
		return conflict.Winner{Location: l, Mod: m, Installation: mod.InstallationID("i-" + m), File: mod.File{Source: l.Path, Dest: l, Size: 3}}
	}
	removedDirs := 0
	for round := 0; round < 200; round++ {
		// Base: what the last deploy applied.
		base := map[string]conflict.Winner{}
		for i := 0; i < 40; i++ {
			l := randLoc()
			base[l.Key()] = win(l, mod.ID(fmt.Sprint("m", r.Intn(5))))
		}
		var ws []conflict.Winner
		for _, w := range base {
			ws = append(ws, w)
		}
		before := BuildDesired("p1", "fp1", ws, hardlink)
		var entries []deployment.Entry
		madeDirs := map[string]bool{}
		for _, f := range before.Files {
			ev := deployment.Evidence{FileID: "v:" + f.Location.Key() + string(f.Mod)}
			entries = append(entries, deployment.Entry{Location: f.Location, Kind: deployment.KindLink, Mod: f.Mod, Installation: f.Installation, Source: f.Source, Method: f.Method, Evidence: ev})
			for _, a := range ancestors(f.Location) {
				if !madeDirs[a.Key()] {
					madeDirs[a.Key()] = true
					entries = append(entries, deployment.Entry{Location: a, Kind: deployment.KindDir})
				}
			}
		}
		m, err := deployment.NewManifest("i1", "p1", "fp1", "op", t0, entries)
		if err != nil {
			t.Fatal(err)
		}
		// Now: some winners change, some go, some are new.
		now := map[string]conflict.Winner{}
		for k, w := range base {
			switch r.Intn(6) {
			case 0: // gone
			case 1:
				now[k] = win(w.Location, "other")
			default:
				now[k] = w
			}
		}
		for i := 0; i < 5; i++ {
			l := randLoc()
			if _, ok := now[l.Key()]; !ok {
				now[l.Key()] = win(l, "new")
			}
		}
		ws = ws[:0]
		for _, w := range now {
			ws = append(ws, w)
		}
		d := BuildDesired("p1", "fp2", ws, hardlink)

		// Observations as a verified manifest leaves them.
		full := map[string]deployment.Observation{}
		for _, e := range m.Links() {
			full[e.Location.Key()] = deployment.Observation{Exists: true, Evidence: e.Evidence}
		}
		for _, f := range d.Files {
			if _, ok := full[f.Location.Key()]; !ok {
				full[f.Location.Key()] = deployment.Observation{}
			}
		}
		dirObs := map[string]deployment.Observation{}
		for k := range madeDirs {
			dirObs[k] = deployment.Observation{Exists: true, IsDir: true}
		}
		// Touched, as the deploy service computes it.
		only := map[string]bool{}
		want := map[string]bool{}
		for _, f := range d.Files {
			want[f.Location.Key()] = true
			if link, ok := m.Owns(f.Location); !ok || !SameFile(f, link) {
				only[f.Location.Key()] = true
			}
		}
		for _, e := range m.Links() {
			if !want[e.Location.Key()] {
				only[e.Location.Key()] = true
			}
		}
		partial := map[string]deployment.Observation{}
		for k := range only {
			partial[k] = full[k]
		}

		a := Build(Input{Desired: d, Applied: m, Observed: full, Dirs: dirObs, CleanDirs: true})
		b := Build(Input{Desired: d, Applied: m, Observed: partial, Dirs: dirObs, CleanDirs: true, Only: only})
		if a.Summary != b.Summary || !slices.Equal(describe(a), describe(b)) {
			t.Fatalf("round %d:\nfull %+v %v\nonly %+v %v", round, a.Summary, describe(a), b.Summary, describe(b))
		}
		removedDirs += a.Summary.RemoveDir
	}
	if removedDirs == 0 {
		t.Fatal("no round removed a folder: the cleanup was not exercised")
	}
}

func describe(p Plan) []string {
	var out []string
	for _, a := range p.Actions {
		out = append(out, string(a.Kind)+" "+a.Location.Key())
	}
	slices.Sort(out)
	return out
}
