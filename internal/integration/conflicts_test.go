package integration_test

import (
	"slices"
	"testing"

	conflictsvc "modorchestrator/internal/core/application/conflicts"
	profilesvc "modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
)

// installFiles imports one mod per name with the given path → content
// pairs and returns the ids in install order.
func (e *env) installFiles(mods map[string][]string, names ...string) []mod.ID {
	e.t.Helper()
	var paths []string
	for _, n := range names {
		paths = append(paths, e.zipFile(n+".zip", mods[n]...))
	}
	e.importAndWait(paths...)
	byName := map[string]mod.ID{}
	for _, r := range e.rows() {
		byName[r.Name] = r.ID
	}
	out := make([]mod.ID, len(names))
	for i, n := range names {
		if out[i] = byName[n]; out[i] == "" {
			e.t.Fatalf("mod %s not installed", n)
		}
	}
	return out
}

func dataLoc(p string) game.Location {
	return game.Location{Target: "data", Path: relpath.MustParse(p)}
}

func (e *env) pairs() conflictsvc.PairsView {
	e.t.Helper()
	v, err := e.conf.Pairs(ctx, e.inst.ID, false, "")
	if err != nil {
		e.t.Fatal(err)
	}
	return v
}

func (e *env) winnerAt(a, b mod.ID, path string) mod.ID {
	e.t.Helper()
	d, err := e.conf.PairDetail(ctx, e.inst.ID, a, b, false)
	if err != nil {
		e.t.Fatal(err)
	}
	for _, f := range d.Files {
		if f.Location.Key() == dataLoc(path).Key() {
			return f.Winner
		}
	}
	e.t.Fatalf("%s is not disputed by the pair", path)
	return ""
}

// F6 demonstration: two overlapping texture mods; choose the winner by pair
// and then one specific file for the other mod (plano F6, core/05 §9).
func TestConflictDemonstration(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"TexA": {"textures/armor.dds", "a-armor", "textures/sky.dds", "a-sky", "textures/a-only.dds", "a"},
		"TexB": {"textures/armor.dds", "b-armor!", "textures/sky.dds", "b-sky!"},
	}, "TexA", "TexB")
	a, b := ids[0], ids[1]

	// INV-CON-02: a conflict alone creates no rule and no override.
	v := e.pairs()
	if len(v.Pairs) != 1 || v.Pairs[0].Files != 2 || v.Pairs[0].Decision != conflictsvc.DecisionOrder || !v.Pairs[0].NeedsReview {
		t.Fatalf("pairs = %+v", v)
	}
	if v.Pairs[0].Winner().ID != b {
		t.Fatalf("the higher priority wins by default (INV-CON-01): %+v", v.Pairs[0])
	}
	if set, _ := e.rules.Get(ctx, e.inst.ID); set != nil && len(set.OrderRules()) > 0 {
		t.Fatalf("INV-CON-02: rules created by a conflict: %+v", set.OrderRules())
	}

	// Choose by pair: "TexA vence TexB" creates a rule; the preview shows
	// the move, the save reviews the pair.
	decision := []profilesvc.PairDecision{{Mod: a, Opponent: b, Choice: profilesvc.ChoiceWins}}
	prev, err := e.conf.PreviewPairDecisions(ctx, e.inst.ID, decision)
	if err != nil || len(prev.Profiles) != 1 || len(prev.Profiles[0].Moves) != 1 {
		t.Fatalf("preview = %+v, %v", prev, err)
	}
	if err := e.conf.DecidePairs(ctx, e.inst.ID, decision); err != nil {
		t.Fatal(err)
	}
	v = e.pairs()
	if p := v.Pairs[0]; p.Decision != conflictsvc.DecisionRule || p.Winner().ID != a || !p.Reviewed || p.Rule == nil || p.Rule.Winner != a {
		t.Fatalf("after the rule: %+v", p)
	}

	// Then one file for the other mod: only that location changes winner,
	// and the indicator of A becomes "mixed".
	if err := e.conf.SetFileOverrides(ctx, e.inst.ID, b, []game.Location{dataLoc("textures/sky.dds")}); err != nil {
		t.Fatal(err)
	}
	if w := e.winnerAt(a, b, "textures/sky.dds"); w != b {
		t.Fatalf("override winner = %s", w)
	}
	if w := e.winnerAt(a, b, "textures/armor.dds"); w != a {
		t.Fatalf("armor winner = %s", w)
	}
	mc, err := e.conf.ModConflicts(ctx, e.inst.ID, a)
	if err != nil || mc.Indicator != conflict.IndicatorMixed || len(mc.Opponents) != 1 || mc.Opponents[0].Wins != 1 || mc.Opponents[0].Loses != 1 {
		t.Fatalf("mod conflicts of A = %+v, %v", mc, err)
	}
	if p := e.pairs().Pairs[0]; p.Decision != conflictsvc.DecisionMixed || !p.Reviewed {
		t.Fatalf("pair after override: %+v", p)
	}
	files, err := e.conf.ModFiles(ctx, e.inst.ID, a, "", 0, 100)
	if err != nil || files.Total != 3 {
		t.Fatalf("files = %+v, %v", files, err)
	}
	states := map[string]conflictsvc.FileState{}
	for _, f := range files.Files {
		states[f.Location.Path.String()] = f.State
	}
	if states["textures/armor.dds"] != conflictsvc.FileWins || states["textures/sky.dds"] != conflictsvc.FileLoses || states["textures/a-only.dds"] != conflictsvc.FileNoConflict {
		t.Fatalf("file states = %+v", states)
	}

	// Back to the default and back to the order.
	if err := e.conf.ClearFileOverrides(ctx, e.inst.ID, []game.Location{dataLoc("textures/sky.dds")}); err != nil {
		t.Fatal(err)
	}
	if err := e.conf.DecidePairs(ctx, e.inst.ID, []profilesvc.PairDecision{{Mod: a, Opponent: b, Choice: profilesvc.ChoiceOrder}}); err != nil {
		t.Fatal(err)
	}
	if set, _ := e.rules.Get(ctx, e.inst.ID); len(set.OrderRules()) != 0 {
		t.Fatalf("the user rule is removed: %+v", set.OrderRules())
	}
	if p := e.pairs().Pairs[0]; p.Decision != conflictsvc.DecisionOrder || p.Winner().ID != a {
		t.Fatalf("removing a rule never moves anything (A stays above): %+v", p)
	}
	e.checkOrderInvariants()
}

// A choice that would close a cycle is refused as a whole with the cycle.
func TestPairDecisionCycleIsRefused(t *testing.T) {
	e := newEnv(t)
	files := map[string][]string{
		"A": {"textures/x.dds", "a", "textures/y.dds", "a"},
		"B": {"textures/x.dds", "bb", "textures/z.dds", "b"},
		"C": {"textures/y.dds", "ccc", "textures/z.dds", "cc"},
	}
	ids := e.installFiles(files, "A", "B", "C")
	if err := e.conf.DecidePairs(ctx, e.inst.ID, []profilesvc.PairDecision{
		{Mod: ids[1], Opponent: ids[0], Choice: profilesvc.ChoiceWins},
		{Mod: ids[2], Opponent: ids[1], Choice: profilesvc.ChoiceWins},
	}); err != nil {
		t.Fatal(err)
	}
	prev, err := e.conf.PreviewPairDecisions(ctx, e.inst.ID, []profilesvc.PairDecision{{Mod: ids[0], Opponent: ids[2], Choice: profilesvc.ChoiceWins}})
	if err != nil || len(prev.Cycle) != 4 {
		t.Fatalf("preview cycle = %+v, %v", prev, err)
	}
	err = e.conf.DecidePairs(ctx, e.inst.ID, []profilesvc.PairDecision{{Mod: ids[0], Opponent: ids[2], Choice: profilesvc.ChoiceWins}})
	if codeOf(err) != profilesvc.CodeRuleCycle {
		t.Fatalf("cycle not refused: %v", err)
	}
	if set, _ := e.rules.Get(ctx, e.inst.ID); len(set.OrderRules()) != 2 {
		t.Fatalf("nothing partial: %+v", set.OrderRules())
	}
}

// core/05 §5.1: identical content is redundant, shown as such and not
// counted as unreviewed.
func TestRedundantConflict(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		// Different archives (no duplicate decision) sharing one file.
		"Same1": {"textures/same.dds", "identical", "textures/one.dds", "1"},
		"Same2": {"textures/same.dds", "identical", "textures/two.dds", "2"},
	}, "Same1", "Same2")
	if err := e.conf.WarmHashes(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	v := e.pairs()
	if len(v.Pairs) != 1 || v.Pairs[0].Decision != conflictsvc.DecisionRedundant || v.Pairs[0].NeedsReview || v.Totals.Unreviewed != 0 || v.PendingHashes != 0 {
		t.Fatalf("redundant pair = %+v", v)
	}
	ind, err := e.conf.Indicators(ctx, e.inst.ID)
	if err != nil || ind[ids[0]].Indicator != conflict.IndicatorRedundantOnly {
		t.Fatalf("indicators = %+v, %v", ind, err)
	}
	d, _ := e.conf.PairDetail(ctx, e.inst.ID, ids[0], ids[1], false)
	if d.Files[0].Providers[0].Hash == "" || d.Files[0].Providers[0].Hash != d.Files[0].Providers[1].Hash {
		t.Fatalf("hashes shown for comparison: %+v", d.Files[0])
	}
}

// INV-CON-03: an override whose winner is disabled is ignored and becomes
// override_stale; exclusions hide a file and invalidate the review.
func TestStaleOverrideAndExclusion(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"Low":  {"textures/x.dds", "low", "textures/y.dds", "low"},
		"High": {"textures/x.dds", "high!", "textures/y.dds", "high!"},
	}, "Low", "High")
	low, high := ids[0], ids[1]
	if err := e.conf.SetFileOverrides(ctx, e.inst.ID, low, []game.Location{dataLoc("textures/x.dds")}); err != nil {
		t.Fatal(err)
	}
	if err := e.conf.SetFileOverrides(ctx, e.inst.ID, low, []game.Location{dataLoc("textures/none.dds")}); codeOf(err) != conflictsvc.CodeNotProvider {
		t.Fatalf("override for a file the mod lacks: %v", err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{low}, false); err != nil {
		t.Fatal(err)
	}
	v := e.pairs()
	if search, _ := e.conf.Pairs(ctx, e.inst.ID, true, "X.DDS"); len(search.Pairs) != 1 || !search.Pairs[0].Potential {
		t.Fatalf("search by path with disabled mods shown: %+v", search.Pairs)
	}
	if search, _ := e.conf.Pairs(ctx, e.inst.ID, true, "nothing"); len(search.Pairs) != 0 {
		t.Fatalf("search without match: %+v", search.Pairs)
	}
	if len(v.Stale) != 1 || v.Stale[0].Reason != conflict.StaleDisabled || len(v.Pairs) != 0 {
		t.Fatalf("stale = %+v pairs = %+v", v.Stale, v.Pairs)
	}
	ds, err := e.conf.Diagnostics(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(ds, func(d diagnostic.Diagnostic) bool {
		return d.Code == diagnostic.CodeOverrideStale && d.Severity == diagnostic.SeverityWarning && len(d.Actions) == 2
	}) {
		t.Fatalf("override_stale missing: %+v", ds)
	}

	// Enabled again, the override is valid again: nothing was removed.
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{low}, true); err != nil {
		t.Fatal(err)
	}
	if w := e.winnerAt(low, high, "textures/x.dds"); w != low {
		t.Fatalf("override applies again: %s", w)
	}
	if err := e.conf.MarkReviewed(ctx, e.inst.ID, []override.Pair{override.NewPair(low, high)}); err != nil {
		t.Fatal(err)
	}
	if p := e.pairs().Pairs[0]; !p.Reviewed {
		t.Fatalf("review: %+v", p)
	}
	// Hiding y from High changes the disputed set: the review expires.
	if err := e.conf.SetFileExclusions(ctx, e.inst.ID, high, []game.Location{dataLoc("textures/y.dds")}, true); err != nil {
		t.Fatal(err)
	}
	if p := e.pairs().Pairs[0]; p.Reviewed || p.Files != 1 {
		t.Fatalf("review must expire with the disputed set: %+v", p)
	}
	files, _ := e.conf.ModFiles(ctx, e.inst.ID, high, "y.dds", 0, 10)
	if len(files.Files) != 1 || files.Files[0].State != conflictsvc.FileHidden {
		t.Fatalf("hidden file: %+v", files)
	}
	ind, _ := e.conf.Indicators(ctx, e.inst.ID)
	if ind[high].Indicator != conflict.IndicatorFullyOverwritten {
		t.Fatalf("High loses x and hides y, so nothing of it is deployed: %+v", ind[high])
	}
}

// INV-CON-04: conflicts are recalculated from profile + instance; a fresh
// service (no cache) gives the same answer, and removing a mod leaves its
// override reported as stale rather than deleted (INV-LIB-05).
func TestConflictsAreRecalculable(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"M1": {"textures/x.dds", "1", "meshes/m.nif", "1"},
		"M2": {"textures/x.dds", "22", "meshes/m.nif", "22"},
		"M3": {"textures/x.dds", "333"},
	}, "M1", "M2", "M3")
	if err := e.conf.SetFileOverrides(ctx, e.inst.ID, ids[1], []game.Location{dataLoc("meshes/m.nif")}); err != nil {
		t.Fatal(err)
	}
	before := e.pairs()
	fresh := e.newConf()
	after, err := fresh.Pairs(ctx, e.inst.ID, false, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(before.Pairs) != 3 || len(after.Pairs) != len(before.Pairs) || after.Totals != before.Totals {
		t.Fatalf("recalculated differently: %+v vs %+v", before, after)
	}
	if _, err := e.lib.RemoveMods(ctx, e.inst.ID, []mod.ID{ids[1]}, false); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	v := e.pairs()
	if len(v.Pairs) != 1 || len(v.Stale) != 1 || v.Stale[0].Reason != conflict.StaleMissing {
		t.Fatalf("after removal: %+v", v)
	}
}
