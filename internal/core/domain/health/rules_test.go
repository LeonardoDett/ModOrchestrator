package health

import (
	"testing"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/rules"
)

func set(t *testing.T, d rules.Data) *rules.Set {
	t.Helper()
	d.Instance = game.InstanceID("i1")
	s, err := rules.Restore(d)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func facts(enabled map[string]bool, removed ...string) Mods {
	out := Mods{}
	for id, on := range enabled {
		out[mod.ID(id)] = ModFact{ID: mod.ID(id), Name: "Mod " + id, State: mod.StateInstalled, Enabled: on}
	}
	for _, id := range removed {
		out[mod.ID(id)] = ModFact{ID: mod.ID(id), Name: "Mod " + id, State: mod.StateRemoved}
	}
	return out
}

func codes(ds []diagnostic.Diagnostic) map[diagnostic.Code]int {
	out := map[diagnostic.Code]int{}
	for _, d := range ds {
		out[d.Code]++
	}
	return out
}

func TestRequirementStates(t *testing.T) {
	s := set(t, rules.Data{Dependencies: []rules.DependencyRule{
		{ID: "r1", Mod: "a", Target: "b", Kind: rules.Requires, Source: rules.SourceUser},
		{ID: "r2", Mod: "a", Target: "gone", Kind: rules.Requires, Source: rules.SourceMetadata},
		{ID: "r3", Mod: "a", Target: "c", Kind: rules.Recommends, Source: rules.SourceUser},
		{ID: "r4", Mod: "off", Target: "b", Kind: rules.Requires, Source: rules.SourceUser},
	}})
	ds, err := RuleChecks(s, facts(map[string]bool{"a": true, "b": false, "c": false, "off": false}, "gone"))
	if err != nil {
		t.Fatal(err)
	}
	got := codes(ds)
	if got[diagnostic.CodeModRequirementMissing] != 2 || got[diagnostic.CodeModRecommendation] != 1 || len(ds) != 3 {
		t.Fatalf("codes = %v", got)
	}
	for _, d := range ds {
		if d.Code != diagnostic.CodeModRequirementMissing {
			continue
		}
		switch d.Params["status"] {
		case "disabled":
			if d.Actions[0].ID != ActionEnableMod || d.Actions[0].Target.ID != "b" || d.Actions[1].ID != ActionRemoveRule {
				t.Fatalf("disabled requirement offers Enable then Remove rule: %+v", d.Actions)
			}
		case "missing":
			if d.Actions[0].NavigateTo != NavigateImport || d.Actions[1].ID != ActionDisableRule {
				t.Fatalf("missing requirement of metadata offers Import then Disable rule: %+v", d.Actions)
			}
		default:
			t.Fatalf("unexpected status %q", d.Params["status"])
		}
		if d.IsBlocking() {
			t.Fatal("a requirement never blocks deploy (core/06 §4)")
		}
	}
	// Enabling the target resolves the problem: the check is recalculated.
	ds, _ = RuleChecks(s, facts(map[string]bool{"a": true, "b": true, "c": true, "gone": true, "off": false}))
	if len(ds) != 0 {
		t.Fatalf("all satisfied: %v", codes(ds))
	}
}

func TestIncompatibleBlocksDeployWithBothNames(t *testing.T) {
	s := set(t, rules.Data{Incompatibilities: []rules.IncompatibilityRule{{ID: "x", A: "a", B: "b", Source: rules.SourceUser}}})
	ds, _ := RuleChecks(s, facts(map[string]bool{"a": true, "b": true}))
	if len(ds) != 1 || ds[0].Code != diagnostic.CodeModsIncompatible || !ds[0].BlocksOperation(OperationDeploy) {
		t.Fatalf("incompatible mods must block deploy: %+v", ds)
	}
	if ds[0].Params["a"] != "Mod a" || ds[0].Params["b"] != "Mod b" || len(ds[0].Actions) != 3 {
		t.Fatalf("params/actions = %+v / %+v", ds[0].Params, ds[0].Actions)
	}
	if ds, _ := RuleChecks(s, facts(map[string]bool{"a": true, "b": false})); len(ds) != 0 {
		t.Fatal("one disabled side resolves it")
	}
	s.SetDisabled("x", true)
	if ds, _ := RuleChecks(s, facts(map[string]bool{"a": true, "b": true})); len(ds) != 0 {
		t.Fatal("a disabled rule is not evaluated")
	}
}

func TestOrphanAndCycle(t *testing.T) {
	s := set(t, rules.Data{
		Order: []rules.OrderRule{
			{ID: "o1", Before: "a", After: "b", Source: rules.SourceMetadata},
			{ID: "o2", Before: "b", After: "a", Source: rules.SourceMetadata},
			{ID: "o3", Before: "a", After: "gone", Source: rules.SourceUser},
		},
	})
	ds, err := RuleChecks(s, facts(map[string]bool{"a": true, "b": true}, "gone"))
	if err != nil {
		t.Fatal(err)
	}
	got := codes(ds)
	if got[diagnostic.CodeRuleCycle] != 1 || got[diagnostic.CodeRuleOrphan] != 1 {
		t.Fatalf("codes = %v", got)
	}
	for _, d := range ds {
		switch d.Code {
		case diagnostic.CodeRuleCycle:
			if !d.BlocksOperation(OperationDeploy) || !d.BlocksOperation(OperationReorder) || d.Actions[0].NavigateTo == "" {
				t.Fatalf("cycle blocks reorder and deploy and leads to the rules: %+v", d)
			}
		case diagnostic.CodeRuleOrphan:
			if d.Params["missing"] != "Mod gone" || d.Actions[0].ID != ActionRemoveRule {
				t.Fatalf("orphan = %+v", d)
			}
		}
	}
}

func TestEnableImpact(t *testing.T) {
	s := set(t, rules.Data{Dependencies: []rules.DependencyRule{
		{ID: "r1", Mod: "a", Target: "b", Kind: rules.Requires, Source: rules.SourceUser},
		{ID: "r2", Mod: "b", Target: "c", Kind: rules.Requires, Source: rules.SourceUser},
		{ID: "r3", Mod: "a", Target: "d", Kind: rules.Recommends, Source: rules.SourceUser},
		{ID: "r4", Mod: "e", Target: "c", Kind: rules.Requires, Source: rules.SourceUser},
	}})
	m := facts(map[string]bool{"a": false, "b": false, "c": false, "d": false, "e": true})
	if got := EnableImpact(s, m, []mod.ID{"a"}, true); len(got.AlsoEnable) != 2 || got.AlsoEnable[0] != "b" || got.AlsoEnable[1] != "c" {
		t.Fatalf("also enable = %v (transitive requires, no recommendations)", got.AlsoEnable)
	}
	m["c"] = ModFact{ID: "c", Name: "Mod c", State: mod.StateInstalled, Enabled: true}
	if got := EnableImpact(s, m, []mod.ID{"c"}, false); len(got.Affected) != 1 || got.Affected[0] != "e" {
		t.Fatalf("affected = %v (only enabled dependents)", got.Affected)
	}
}
