package conflict

import (
	"fmt"
	"math/rand"
	"slices"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
)

func slots(enabled map[mod.ID]bool, order ...mod.ID) []Slot {
	out := make([]Slot, len(order))
	for i, m := range order {
		out[i] = Slot{Mod: m, Enabled: enabled == nil || enabled[m]}
	}
	return out
}

func indexOf(insts ...*mod.Installation) *Index {
	x := NewIndex()
	for _, i := range insts {
		x.Put(i)
	}
	return x
}

// INV-CON-01/04: the incremental evaluation agrees with the full
// calculation for random profiles, overrides, exclusions and rules.
func TestEvaluateAgreesWithCalculate(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	paths := []string{"a.dds", "b.dds", "c.nif", "d/e.esp", "d/f.bsa", "g.txt"}
	for round := 0; round < 300; round++ {
		n := 2 + rng.Intn(5)
		var order []mod.ID
		insts := map[mod.ID]*mod.Installation{}
		x := NewIndex()
		for i := 0; i < n; i++ {
			m := mod.ID(fmt.Sprintf("m%d", i))
			var files []string
			for _, p := range paths {
				if rng.Intn(2) == 0 {
					files = append(files, fmt.Sprintf("%s=h%d", p, rng.Intn(2)))
				}
			}
			if len(files) == 0 {
				files = []string{"own" + string(m)}
			}
			insts[m] = install(t, m, files...)
			x.Put(insts[m])
			order = append(order, m)
		}
		rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
		enabledSet := map[mod.ID]bool{}
		var enabled []mod.ID
		for _, m := range order {
			if rng.Intn(4) > 0 {
				enabledSet[m] = true
				enabled = append(enabled, m)
			}
		}
		intent, _ := override.New("i1")
		for _, p := range paths {
			switch rng.Intn(4) {
			case 0:
				_ = intent.SetOverride(loc(p), order[rng.Intn(n)], t0)
			case 1:
				_ = intent.Exclude(order[rng.Intn(n)], loc(p), t0)
			}
		}
		var edges []ordering.Edge
		for i := 0; i+1 < len(order); i++ {
			if rng.Intn(3) == 0 {
				edges = append(edges, ordering.Edge{Before: ordering.Item(order[i]), After: ordering.Item(order[i+1]), Ref: "r"})
			}
		}
		full := Calculate(Input{Enabled: enabled, Installations: insts, Intent: intent, RuleEdges: edges})
		ev := x.Evaluate(EvalInput{Order: slots(enabledSet, order...), Intent: intent, RuleEdges: edges})
		if !slices.EqualFunc(full.Conflicts, ev.Conflicts, func(a, b FileConflict) bool {
			return a.Location.Key() == b.Location.Key() && slices.Equal(a.Providers, b.Providers) && a.Winner == b.Winner && a.Resolution == b.Resolution
		}) {
			t.Fatalf("round %d: conflicts differ\nfull %+v\nindex %+v", round, full.Conflicts, ev.Conflicts)
		}
		staleKeys := func(list []StaleOverride) []string {
			var out []string
			for _, s := range list {
				out = append(out, s.Override.Location.Key())
			}
			return out
		}
		if !slices.Equal(staleKeys(full.Stale), staleKeys(ev.Stale)) {
			t.Fatalf("round %d: stale differ %v vs %v", round, staleKeys(full.Stale), staleKeys(ev.Stale))
		}
	}
}

func TestIndexIsIncremental(t *testing.T) {
	a, b := install(t, "a", "x", "y"), install(t, "b", "x")
	x := indexOf(a, b)
	ev := x.Evaluate(EvalInput{Order: slots(nil, "a", "b")})
	if len(ev.Conflicts) != 1 || ev.Conflicts[0].Winner != "b" {
		t.Fatalf("conflicts = %+v", ev.Conflicts)
	}
	// A reinstall with another footprint replaces only that mod.
	b2, _ := mod.NewInstallation("inst-b2", "b", "i1", "basic", nil, []mod.File{{Source: relpath.MustParse("y"), Dest: loc("y"), Size: 1}}, t0)
	x.Put(b2)
	ev = x.Evaluate(EvalInput{Order: slots(nil, "a", "b")})
	if len(ev.Conflicts) != 1 || ev.Conflicts[0].Location.Key() != loc("y").Key() {
		t.Fatalf("after reinstall = %+v", ev.Conflicts)
	}
	x.Remove("b")
	if ev = x.Evaluate(EvalInput{Order: slots(nil, "a")}); len(ev.Conflicts) != 0 || len(x.contested) != 0 {
		t.Fatalf("after removal = %+v", ev.Conflicts)
	}
	if id, ok := x.Installation("a"); !ok || id != a.ID {
		t.Fatalf("a indexed as %q", id)
	}
}

func TestDisabledProvidersArePotentialOnly(t *testing.T) {
	x := indexOf(install(t, "a", "x"), install(t, "b", "x"))
	order := slots(map[mod.ID]bool{"a": true}, "a", "b")
	if ev := x.Evaluate(EvalInput{Order: order}); len(ev.Conflicts) != 0 {
		t.Fatalf("a disabled mod does not conflict: %+v", ev.Conflicts)
	}
	ev := x.Evaluate(EvalInput{Order: order, IncludeDisabled: true})
	if len(ev.Conflicts) != 1 || !ev.Conflicts[0].Potential {
		t.Fatalf("potential conflict expected: %+v", ev.Conflicts)
	}
	if p := Pairs(ev.Conflicts); len(p) != 1 || !p[0].Potential {
		t.Fatalf("potential pair: %+v", p)
	}
}

// core/05 §5.1: redundancy needs the same size and the same hash; equal
// sizes with unknown hashes ask for hashing instead of guessing.
func TestRedundancyByHashOnDemand(t *testing.T) {
	x := indexOf(install(t, "a", "x", "y"), install(t, "b", "x", "y"))
	order := slots(nil, "a", "b")
	ev := x.Evaluate(EvalInput{Order: order})
	if len(ev.NeedHash) != 4 || ev.Conflicts[0].Resolution != ResolutionOrder {
		t.Fatalf("unknown hashes are requested, not assumed: %+v", ev)
	}
	known := map[string]string{"a|x": "h1", "b|x": "h1", "a|y": "h1", "b|y": "h2"}
	hash := func(m mod.ID, f mod.File) (string, bool) {
		h, ok := known[string(m)+"|"+f.Dest.Path.Key()]
		return h, ok
	}
	ev = x.Evaluate(EvalInput{Order: order, Hash: hash})
	if len(ev.NeedHash) != 0 || ev.Conflicts[0].Resolution != ResolutionRedundant || ev.Conflicts[1].Resolution != ResolutionOrder {
		t.Fatalf("x redundant, y not: %+v", ev.Conflicts)
	}
	if got := ModIndicator("a", ev.Provided["a"], ev.Conflicts); got != IndicatorFullyOverwritten {
		t.Fatalf("a loses y and x is redundant: %s", got)
	}
	// Different sizes never need a hash.
	sz := func(m mod.ID, size int64) *mod.Installation {
		i, _ := mod.NewInstallation(mod.InstallationID("s-"+m), m, "i1", "basic", nil, []mod.File{{Source: relpath.MustParse("z"), Dest: loc("z"), Size: size}}, t0)
		return i
	}
	x = indexOf(sz("a", 1), sz("b", 2))
	if ev := x.Evaluate(EvalInput{Order: order}); len(ev.NeedHash) != 0 {
		t.Fatalf("different sizes: %+v", ev.NeedHash)
	}
}

// INV-CON-03: stale overrides and exclusions are ignored and reported with
// the reason.
func TestStaleOverridesAndExclusions(t *testing.T) {
	x := indexOf(install(t, "a", "x", "y"), install(t, "b", "x"), install(t, "c", "x"))
	intent, _ := override.New("i1")
	_ = intent.SetOverride(loc("x"), "c", t0)    // c disabled
	_ = intent.SetOverride(loc("y"), "b", t0)    // b does not provide y
	_ = intent.SetOverride(loc("w"), "gone", t0) // mod removed
	_ = intent.Exclude("b", loc("y"), t0)        // b never provided y
	_ = intent.Exclude("gone", loc("x"), t0)     // mod removed
	_ = intent.Exclude("a", loc("x"), t0)        // valid
	ev := x.Evaluate(EvalInput{Order: slots(map[mod.ID]bool{"a": true, "b": true}, "a", "b", "c"), Intent: intent})
	reasons := map[string]StaleReason{}
	for _, s := range ev.Stale {
		reasons[s.Override.Location.Path.Key()] = s.Reason
	}
	if reasons["x"] != StaleDisabled || reasons["y"] != StaleNotProvider || reasons["w"] != StaleMissing {
		t.Fatalf("stale overrides = %+v", ev.Stale)
	}
	if len(ev.StaleExclusions) != 2 || ev.Provided["a"] != 1 || ev.Provided["b"] != 1 {
		t.Fatalf("exclusions %+v provided %+v", ev.StaleExclusions, ev.Provided)
	}
	// a hides x, so among enabled mods only b provides it.
	if len(ev.Conflicts) != 0 {
		t.Fatalf("conflicts = %+v", ev.Conflicts)
	}
}

// Performance goal (00-visao-e-escopo.md): recalculating after enabling one
// mod stays under 500 ms with 200,000 locations and 1,000 mods.
func TestEvaluatePerformanceGoal(t *testing.T) {
	if testing.Short() {
		t.Skip("performance goal")
	}
	const mods, files = 1000, 200
	x := NewIndex()
	var order []Slot
	for i := 0; i < mods; i++ {
		m := mod.ID(fmt.Sprintf("m%04d", i))
		fs := make([]mod.File, files)
		for j := 0; j < files; j++ {
			// Every mod shares a quarter of its files with the previous
			// mod, so there are many contested locations.
			n := i*files + j
			if j < files/4 && i > 0 {
				n = (i-1)*files + j
			}
			p := relpath.MustParse(fmt.Sprintf("textures/m%d/f%d.dds", n/files, n%files))
			fs[j] = mod.File{Source: p, Dest: game.Location{Target: "data", Path: p}, Size: int64(1000 + j)}
		}
		inst, err := mod.NewInstallation(mod.InstallationID("i"+m), m, "i1", "basic", nil, fs, t0)
		if err != nil {
			t.Fatal(err)
		}
		x.Put(inst)
		order = append(order, Slot{Mod: m, Enabled: i%2 == 0})
	}
	order[1].Enabled = true // "habilitar um mod"
	start := time.Now()
	ev := x.Evaluate(EvalInput{Order: order})
	Pairs(ev.Conflicts)
	for _, s := range order {
		ModIndicator(s.Mod, ev.Provided[s.Mod], ev.Conflicts)
	}
	if d := time.Since(start); d > 500*time.Millisecond {
		t.Fatalf("recalculation took %s", d)
	}
	if len(ev.Conflicts) == 0 {
		t.Fatal("fixture has no conflicts")
	}
}
