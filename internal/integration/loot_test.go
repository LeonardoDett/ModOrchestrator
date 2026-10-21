package integration_test

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"testing"

	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/application/loot"
	pluginsvc "modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/infrastructure/system"
)

// lootSwitch is plugins.lootProvider for the test.
type lootSwitch struct{ on bool }

func (s *lootSwitch) AppValue(context.Context, string) (appsettings.Effective, error) {
	return appsettings.Effective{Value: "en"}, nil
}

func (s *lootSwitch) InstanceValue(_ context.Context, _, key string) (appsettings.Effective, error) {
	if key != loot.SettingKey {
		return appsettings.Effective{}, errors.New("unknown")
	}
	if s.on {
		return appsettings.Effective{Value: "true"}, nil
	}
	return appsettings.Effective{Value: "false"}, nil
}

type instanceGetter struct{ e *env }

func (g instanceGetter) Get(_ context.Context, id game.InstanceID) (game.Instance, error) {
	if id != g.e.inst.ID {
		return game.Instance{}, ports.ErrNotFound
	}
	return g.e.inst, nil
}

type registryOf struct{ a ports.GameAdapter }

func (r registryOf) ByName(string) (ports.GameAdapter, bool) { return r.a, true }

// D141: with the LOOT data of the shipped masterlist, SkyUI (group "Fixes &
// Resources") loads before RaceMenu (after SkyUI), RaceMenu without SKSE
// gets the requirement error, and turning the provider off removes both.
func TestLootDataOrdersAndDiagnoses(t *testing.T) {
	e := pluginEnv(t)
	sw := &lootSwitch{on: true}
	l := loot.New(loot.Deps{
		Registry: registryOf{skyrimse.Adapter{}}, Instances: instanceGetter{e}, FS: e.plug.FS, Folders: testFolders{root: filepath.Join(e.dir, "LocalAppData")},
		Settings: sw, Dir: filepath.Join(e.dir, "loot"), Plugins: e.plug, Clock: system.Clock{},
	})
	e.plug.Providers = []pluginsvc.Provider{l}
	// RaceMenu first in the mod order: without LOOT it would load first.
	e.pluginMods(map[string][]byte{
		"RaceMenu.esp": tes4(0, "Skyrim.esm"),
		"SkyUI_SE.esp": tes4(0, "Skyrim.esm"),
	}, "RaceMenu.esp", "SkyUI_SE.esp")
	got := e.order()
	if slices.Index(got, "SkyUI_SE.esp") > slices.Index(got, "RaceMenu.esp") {
		t.Fatalf("LOOT data must put SkyUI first: %v", got)
	}
	ds, err := e.plug.Diagnostics(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !hasCode(ds, diagnostic.CodePluginRequirementMissing, "RaceMenu.esp") {
		t.Fatalf("SKSE requirement missing must be reported: %+v", ds)
	}
	rules, err := e.plug.RulesAndGroups(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	var lootRule plugin.RuleID
	for _, r := range rules.Rules {
		if r.Source == string(loot.SourceLoot) && r.Plugin == "RaceMenu.esp" {
			lootRule = r.ID
		}
	}
	if lootRule == "" {
		t.Fatalf("the LOOT rule must be listed: %+v", rules.Rules)
	}
	if err := e.plug.RemovePluginRule(ctx, e.inst.ID, lootRule); err == nil {
		t.Fatal("a LOOT rule cannot be removed, only disabled")
	}
	if err := e.plug.SetPluginRuleDisabled(ctx, e.inst.ID, lootRule, true); err != nil {
		t.Fatal(err)
	}
	// SKSE installed: the requirement holds.
	e.write(filepath.Join(e.inst.Root, "skse64_loader.exe"), "x")
	ds, _ = e.plug.Diagnostics(ctx, e.inst.ID)
	if hasCode(ds, diagnostic.CodePluginRequirementMissing, "RaceMenu.esp") {
		t.Fatal("the requirement is met once SKSE exists")
	}
	sw.on = false
	ds, _ = e.plug.Diagnostics(ctx, e.inst.ID)
	for _, d := range ds {
		if d.Code == diagnostic.CodePluginProviderMessage || d.Code == diagnostic.CodePluginRequirementMissing {
			t.Fatalf("provider off: no LOOT diagnostics, got %s", d.Code)
		}
	}
}

func hasCode(ds []diagnostic.Diagnostic, c diagnostic.Code, p string) bool {
	for _, d := range ds {
		if d.Code == c && d.Params["plugin"] == p {
			return true
		}
	}
	return false
}
