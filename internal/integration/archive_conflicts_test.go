package integration_test

import (
	"testing"

	"modorchestrator/internal/adapters/gamebryo"
	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/domain/gamearchive"
	"modorchestrator/internal/core/domain/mod"
)

// D147: inside the archives the plugins load, a loose file wins whatever
// the mod order, and among archives the later plugin's wins. The result
// only informs; an archive the adapter does not read is listed as unread.
func TestArchiveConflictsFollowLooseFirstThenLoadOrder(t *testing.T) {
	e := pluginEnv(t)
	bsa := func(paths ...string) string { return string(gamebryo.BuildBSA(skyrimse.ArchiveVersion, paths)) }
	ids := e.installFiles(map[string][]string{
		// C is installed first: its loose file still beats the archives.
		"C":   {"meshes/x.nif", "loose"},
		"A":   {"A.esp", string(tes4(0, "Skyrim.esm")), "A.bsa", bsa(`meshes\x.nif`, `textures\y.dds`, `textures\z.dds`)},
		"B":   {"B.esp", string(tes4(0, "Skyrim.esm")), "B.bsa", bsa(`textures\y.dds`)},
		"Old": {"Old.esp", string(tes4(0, "Skyrim.esm")), "Old.bsa", string(gamebryo.BuildBSA(skyrimse.ArchiveVersionLE, []string{`textures\z.dds`}))},
	}, "C", "A", "B", "Old")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	c, a, b, old := ids[0], ids[1], ids[2], ids[3]
	get := func(m mod.ID) (v struct {
		Supported bool
		Lost, Won int
		Unread    []string
		Against   map[string]bool
		Reason    map[string]gamearchive.Reason
	}) {
		t.Helper()
		r, err := e.conf.ModArchiveConflicts(ctx, e.inst.ID, m)
		if err != nil {
			t.Fatal(err)
		}
		v.Supported, v.Lost, v.Won, v.Unread = r.Supported, r.FilesLost, r.FilesWon, r.Unread
		v.Against, v.Reason = map[string]bool{}, map[string]gamearchive.Reason{}
		for _, o := range r.Opponents {
			k := o.Opponent.Mod.Name + "|" + o.Opponent.Archive
			v.Against[k], v.Reason[k] = o.Wins, o.Reason
		}
		return v
	}
	va := get(a)
	if !va.Supported || va.Lost != 2 || va.Won != 0 {
		t.Fatalf("A: %+v", va)
	}
	if w, ok := va.Against["C|"]; !ok || w || va.Reason["C|"] != gamearchive.ReasonLoose {
		t.Fatalf("A.bsa loses meshes/x.nif to C's loose file: %+v", va)
	}
	if w, ok := va.Against["B|B.bsa"]; !ok || w || va.Reason["B|B.bsa"] != gamearchive.ReasonLoadOrder {
		t.Fatalf("A.bsa loses textures/y.dds to B.bsa, loaded later: %+v", va)
	}
	if vb := get(b); vb.Won != 1 || !vb.Against["A|A.bsa"] {
		t.Fatalf("B: %+v", vb)
	}
	if vc := get(c); vc.Won != 1 || !vc.Against["A|A.bsa"] {
		t.Fatalf("C: %+v", vc)
	}
	// Skyrim LE archive: not read here (archive_wrong_game reports it), so
	// the screen shows the rule instead of a calculation.
	if vo := get(old); len(vo.Unread) != 1 || vo.Unread[0] != "Old.bsa" || len(vo.Against) != 0 {
		t.Fatalf("Old: %+v", vo)
	}
	// Disabling B gives y.dds back to A.bsa.
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{b}, false); err != nil {
		t.Fatal(err)
	}
	if va := get(a); va.Lost != 1 {
		t.Fatalf("A after disabling B: %+v", va)
	}
}

// D112: the generic adapter reads no archive; the query says unsupported.
func TestGenericAdapterHasNoArchiveConflicts(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	ids := e.installFiles(map[string][]string{"A": {"A.esp", "x", "A.bsa", string(gamebryo.BuildBSA(skyrimse.ArchiveVersion, []string{`a\b.nif`}))}}, "A")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	r, err := e.conf.ModArchiveConflicts(ctx, e.inst.ID, ids[0])
	if err != nil || r.Supported || len(r.Opponents) != 0 {
		t.Fatalf("generic: %+v, %v", r, err)
	}
}
