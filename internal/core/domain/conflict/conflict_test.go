package conflict

import (
	"fmt"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func loc(p string) game.Location { return game.Location{Target: "data", Path: relpath.MustParse(p)} }

// install builds an installation; files are "path" or "path=hash".
func install(t *testing.T, m mod.ID, files ...string) *mod.Installation {
	t.Helper()
	var fs []mod.File
	for _, f := range files {
		path, hash := f, ""
		for i := range f {
			if f[i] == '=' {
				path, hash = f[:i], f[i+1:]
			}
		}
		fs = append(fs, mod.File{Source: relpath.MustParse(path), Dest: loc(path), Size: 1, Hash: hash})
	}
	inst, err := mod.NewInstallation(mod.InstallationID("inst-"+m), m, "i1", "basic", nil, fs, t0)
	if err != nil {
		t.Fatal(err)
	}
	return inst
}

func calc(t *testing.T, intent *override.Set, edges []ordering.Edge, insts ...*mod.Installation) Result {
	t.Helper()
	in := Input{Installations: map[mod.ID]*mod.Installation{}, Intent: intent, RuleEdges: edges}
	for _, i := range insts {
		in.Enabled = append(in.Enabled, i.Mod)
		in.Installations[i.Mod] = i
	}
	return Calculate(in)
}

func winnerAt(r Result, p string) mod.ID {
	for _, w := range r.Winners {
		if w.Location.Key() == loc(p).Key() {
			return w.Mod
		}
	}
	return ""
}

func TestHighestPriorityWinsByDefault(t *testing.T) {
	r := calc(t, nil, nil, install(t, "a", "x.dds", "only-a.dds"), install(t, "b", "X.DDS"))
	if winnerAt(r, "x.dds") != "b" || winnerAt(r, "only-a.dds") != "a" {
		t.Fatalf("winners = %+v", r.Winners)
	}
	if len(r.Winners) != 2 || len(r.Conflicts) != 1 || r.Conflicts[0].Resolution != ResolutionOrder {
		t.Fatalf("one location per winner, one conflict decided by order: %+v", r)
	}
}

func TestRuleExplainsButDoesNotChangeWinner(t *testing.T) {
	// The profile order already satisfies "b wins a" (a before b).
	edges := []ordering.Edge{{Before: "a", After: "c", Ref: "r1"}, {Before: "c", After: "b", Ref: "r2"}}
	r := calc(t, nil, edges, install(t, "a", "x"), install(t, "c", "y"), install(t, "b", "x"))
	if r.Conflicts[0].Winner != "b" || r.Conflicts[0].Resolution != ResolutionRule {
		t.Fatalf("transitive rule a<c<b explains the winner: %+v", r.Conflicts[0])
	}
}

func TestOverrideWinsAndStaleIsReported(t *testing.T) {
	intent, _ := override.New("i1")
	_ = intent.SetOverride(loc("x"), "a", t0)
	_ = intent.SetOverride(loc("gone"), "a", t0)
	_ = intent.SetOverride(loc("y"), "z", t0)
	r := calc(t, intent, nil, install(t, "a", "x"), install(t, "b", "x"))
	if r.Conflicts[0].Winner != "a" || r.Conflicts[0].Resolution != ResolutionOverride {
		t.Fatalf("override must win: %+v", r.Conflicts[0])
	}
	if len(r.Stale) != 2 || r.Stale[0].Reason != StaleNotProvider || r.Stale[1].Reason != StaleDisabled {
		t.Fatalf("stale overrides must be reported (INV-CON-03): %+v", r.Stale)
	}
}

func TestExclusionAndRedundancy(t *testing.T) {
	intent, _ := override.New("i1")
	_ = intent.Exclude("b", loc("x"), t0)
	r := calc(t, intent, nil, install(t, "a", "x", "same=h1"), install(t, "b", "x", "same=h1"))
	if winnerAt(r, "x") != "a" {
		t.Fatal("excluded file is not provided")
	}
	if len(r.Conflicts) != 1 || r.Conflicts[0].Resolution != ResolutionRedundant {
		t.Fatalf("identical content is redundant: %+v", r.Conflicts)
	}
	r = calc(t, nil, nil, install(t, "a", "same"), install(t, "b", "same"))
	if r.Conflicts[0].Resolution == ResolutionRedundant {
		t.Fatal("unknown hash is never assumed redundant")
	}
}

func TestPairsAndIndicators(t *testing.T) {
	r := calc(t, nil, nil, install(t, "a", "1", "2", "own"), install(t, "b", "1", "2"), install(t, "c", "3"))
	pairs := Pairs(r.Conflicts)
	if len(pairs) != 1 || pairs[0].WinsB != 2 || pairs[0].WinsA != 0 || pairs[0].Contested == "" {
		t.Fatalf("pairs = %+v", pairs)
	}
	if got := ModIndicator("a", 3, r.Conflicts); got != IndicatorLosesAll {
		t.Fatalf("a loses its conflicts but keeps own: %s", got)
	}
	if got := ModIndicator("b", 2, r.Conflicts); got != IndicatorWinsAll {
		t.Fatalf("b = %s", got)
	}
	if got := ModIndicator("c", 1, r.Conflicts); got != IndicatorNone {
		t.Fatalf("c = %s", got)
	}
	r = calc(t, nil, nil, install(t, "a", "1"), install(t, "b", "1"))
	if got := ModIndicator("a", 1, r.Conflicts); got != IndicatorFullyOverwritten {
		t.Fatalf("a is useless in this setup: %s", got)
	}
}

func TestScale(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	var insts []*mod.Installation
	for m := range 200 {
		files := make([]string, 500)
		for f := range files {
			files[f] = fmt.Sprintf("meshes/%d.nif", (m*250+f)%60000)
		}
		insts = append(insts, install(t, mod.ID(fmt.Sprintf("m%03d", m)), files...))
	}
	start := time.Now()
	r := calc(t, nil, nil, insts...)
	if len(r.Winners) != 50250 || len(r.Conflicts) == 0 {
		t.Fatalf("winners=%d conflicts=%d", len(r.Winners), len(r.Conflicts))
	}
	t.Logf("100k files, 50k locations: %v", time.Since(start))
}
