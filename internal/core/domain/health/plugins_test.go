package health

import (
	"testing"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

func pluginCodes(ds []diagnostic.Diagnostic) map[diagnostic.Code]diagnostic.Diagnostic {
	out := map[diagnostic.Code]diagnostic.Diagnostic{}
	for _, d := range ds {
		out[d.Code] = d
	}
	return out
}

func TestMissingMasterOffersTheDisabledProvider(t *testing.T) {
	ds, err := PluginChecks(PluginFacts{
		Plugins: []PluginFact{
			{Name: "Skyrim.esm", Enabled: true, Implicit: true},
			{Name: "Patch.esp", Enabled: true, Masters: []plugin.Name{"Skyrim.esm", "Lib.esm"}, Mod: "m1", ModName: "Patch"},
		},
		Disabled: map[string]Provider{"lib.esm": {Mod: "m2", ModName: "Lib"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	d, ok := pluginCodes(ds)[diagnostic.CodePluginMissingMaster]
	if !ok || d.Params["master"] != "Lib.esm" {
		t.Fatalf("missing master expected: %+v", ds)
	}
	if d.Actions[0].ID != ActionEnableMod || d.Actions[0].Target.ID != "m2" || d.Actions[len(d.Actions)-1].ID != ActionDisablePlugin {
		t.Fatalf("actions must enable the provider and offer to deactivate: %+v", d.Actions)
	}
}

func TestInactiveMasterAndLimitsAndExternalOrder(t *testing.T) {
	ds, err := PluginChecks(PluginFacts{
		Plugins: []PluginFact{
			{Name: "Lib.esm", Enabled: false},
			{Name: "Patch.esp", Enabled: true, Masters: []plugin.Name{"Lib.esm"}},
			{Name: "Off.esp", Enabled: false, Masters: []plugin.Name{"Nowhere.esm"}},
		},
		Limits:             []plugin.LimitUsage{{Kind: "full", Used: 255, Max: 254}, {Kind: "light", Used: 3, Max: 4096}},
		External:           true,
		ExternalViolations: []ordering.Edge{{Before: "lib.esm", After: "patch.esp", Ref: "adapter:master"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	c := pluginCodes(ds)
	if _, ok := c[diagnostic.CodePluginMissingMaster]; ok {
		t.Fatal("an inactive plugin with a missing master is no problem")
	}
	if c[diagnostic.CodePluginDisabledMaster].Actions[0].ID != ActionEnablePlugin {
		t.Fatal("inactive master must offer to activate it")
	}
	if c[diagnostic.CodePluginLimitExceeded].Params["kind"] != "full" {
		t.Fatal("full plugin limit exceeded expected")
	}
	if _, ok := c[diagnostic.CodeLoadOrderExternalChange]; !ok {
		t.Fatal("external change of the load order file expected")
	}
	if c[diagnostic.CodePluginMasterOrder].Params["master"] != "Lib.esm" {
		t.Fatalf("external order breaking a master: %+v", c[diagnostic.CodePluginMasterOrder])
	}
}
