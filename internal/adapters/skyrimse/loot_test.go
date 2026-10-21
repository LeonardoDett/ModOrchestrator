package skyrimse

import (
	"testing"
	"time"

	"modorchestrator/internal/core/application/loot"
)

// The masterlist shipped with the app parses and its conditions are all in
// the syntax the provider reads (D141).
func TestShippedLootMasterlist(t *testing.T) {
	lg, ok := (&Adapter{}).LootGame(GameID)
	if !ok || lg.Repository != "skyrimse" || lg.Folder == "" || lg.Date.IsZero() {
		t.Fatalf("LOOT declaration: %+v", lg)
	}
	start := time.Now()
	m, err := loot.Parse(lg.Masterlist, lg.Prelude)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("parsed in %v: %d groups, %d globals, %d plugins", time.Since(start), len(m.Groups), len(m.Globals), len(m.Plugins))
	if len(m.Groups) < 10 || len(m.Plugins) < 1000 {
		t.Fatalf("too little: %d groups, %d plugins", len(m.Groups), len(m.Plugins))
	}
	var conds []string
	for _, g := range m.Globals {
		conds = append(conds, g.Condition)
	}
	dirty := false
	for _, p := range m.Plugins {
		for _, f := range append(append(append([]loot.File{}, p.After...), p.Req...), p.Inc...) {
			conds = append(conds, f.Condition)
		}
		for _, msg := range p.Msg {
			conds = append(conds, msg.Condition)
		}
		for _, d := range p.Dirty {
			conds = append(conds, d.Condition)
			dirty = dirty || (p.Name == "Update.esm" && d.CRC != 0 && d.ITM > 0)
		}
	}
	if !dirty {
		t.Error("Update.esm dirty data missing")
	}
	for _, c := range conds {
		if _, err := loot.ParseCondition(c); err != nil {
			t.Errorf("%v", err)
		}
	}
	if _, ok := (&Adapter{}).LootGame("other"); ok {
		t.Error("only Skyrim SE has LOOT data")
	}
}
