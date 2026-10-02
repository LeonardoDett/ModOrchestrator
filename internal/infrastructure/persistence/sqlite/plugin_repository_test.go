package sqlite

import (
	"context"
	"reflect"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/rules"
)

func TestPluginRulesRoundTrip(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := NewGameInstanceRepository(db).Save(ctx, sampleInstance("i1", "Main")); err != nil {
		t.Fatal(err)
	}
	repo := NewPluginRuleRepository(db)
	empty, err := repo.Get(ctx, "i1")
	if err != nil || len(empty.Groups()) != 1 {
		t.Fatalf("empty set = %+v, %v", empty, err)
	}
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	set, _ := plugin.NewRules("i1")
	_ = set.AddRule(plugin.Rule{ID: "r1", Plugin: "B.esp", After: "A.esp", Source: rules.SourceUser, CreatedAt: now}, plugin.Check{})
	_ = set.SetGroup(plugin.Group{Name: "Patches", After: []string{plugin.DefaultGroup}}, plugin.Check{})
	_ = set.Assign("Patch.esp", "Patches", plugin.Check{})
	if err := repo.Save(ctx, set); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get(ctx, "i1")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Data(), set.Data()) {
		t.Fatalf("round trip:\n got %+v\nwant %+v", got.Data(), set.Data())
	}

	man := NewManifestRepository(db)
	lo := &deployment.AppliedLoadOrder{Instance: "i1", Profile: "p1", Order: []plugin.Name{"A.esp"}, Enabled: []plugin.Name{"A.esp"}, FileHash: "h1", PendingHash: "h2", PrevOrder: []plugin.Name{"B.esp"}, Original: "load_order/plugins.txt", AppliedAt: now}
	if err := man.SaveLoadOrder(ctx, lo); err != nil {
		t.Fatal(err)
	}
	back, err := man.CurrentLoadOrder(ctx, "i1")
	if err != nil || !back.Ours("h2") || !back.Ours("h1") || back.Ours("h3") || back.Original != lo.Original || len(back.PrevOrder) != 1 {
		t.Fatalf("applied load order: %+v %v", back, err)
	}
}
