package integration_test

import (
	"bytes"
	"reflect"
	"testing"

	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
)

// Expose only the plugin contract of the existing adapter, so the same
// fixture can exercise both presence and absence of PluginChecker.
type pluginSupportOnly struct {
	ports.GameAdapter
	ports.PluginSupport
}

func (a pluginSupportOnly) Definitions() []game.Definition {
	d := a.GameAdapter.Definitions()[0]
	d.Capabilities = game.NewCapabilities(game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller, game.CapPlugins)
	return []game.Definition{d}
}

func (a pluginSupportOnly) InstanceDefinition(game.ID, []game.Target) (game.Definition, error) {
	return a.Definitions()[0], nil
}

const codeHeaderProbe diagnostic.Code = "header_probe"

type headerChecker struct {
	pluginSupportOnly
	game  game.ID
	files []ports.PluginFile
	calls int
}

func (a *headerChecker) Catalog() ports.AdapterCatalog {
	return ports.AdapterCatalog{
		Diagnostics: []diagnostic.CodeSpec{{Code: codeHeaderProbe, Module: diagnostic.ModulePlugins}},
		Messages:    map[string]map[string]string{"en": {"diag.code.header_probe": "Header check"}},
	}
}

func (a *headerChecker) PluginChecks(id game.ID, active []ports.PluginFile) []diagnostic.Spec {
	a.calls++
	a.game, a.files = id, append([]ports.PluginFile(nil), active...)
	return []diagnostic.Spec{{
		Code: codeHeaderProbe, Severity: diagnostic.SeverityWarning,
		Params:   diagnostic.Params{"check": "header"},
		Evidence: []diagnostic.Evidence{{Kind: "plugin_header"}},
		Related:  []event.EntityRef{{Kind: "plugin", ID: "good.esp"}},
	}}
}

func TestPluginChecksUseReadableActiveHeaders(t *testing.T) {
	e := pluginEnv(t)
	good := tes4(0)
	ids := e.pluginMods(map[string][]byte{"Good.esp": good, "Broken.esp": []byte("bad header")}, "Good.esp", "Broken.esp")
	a := &headerChecker{pluginSupportOnly: pluginSupportOnly{GameAdapter: skyrimse.Adapter{}, PluginSupport: skyrimse.Adapter{}}}
	registry, err := games.NewRegistry(a)
	if err != nil {
		t.Fatal(err)
	}
	e.plug.Registry = registry
	ds, err := e.plug.Diagnostics(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if a.calls != 1 || a.game != e.inst.Game {
		t.Fatalf("checker calls=%d, game=%s", a.calls, a.game)
	}
	header, err := (skyrimse.Adapter{}).ReadHeader(e.inst.Game, "Good.esp", bytes.NewReader(good))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, f := range a.files {
		if f.Name == "Broken.esp" {
			t.Fatalf("unreadable header passed to adapter: %+v", f)
		}
		if f.Name == "Good.esp" {
			found = true
			if !reflect.DeepEqual(f.Header, header) || f.Mod != ids["Good.esp"] || f.ModName != "Good.esp" {
				t.Fatalf("plugin file = %+v, want header %+v", f, header)
			}
		}
	}
	if !found {
		t.Fatalf("active readable plugin omitted: %+v", a.files)
	}
	checked, unreadable := false, false
	for _, d := range ds {
		if d.Code == codeHeaderProbe {
			checked = true
			if d.Severity != diagnostic.SeverityWarning || d.Params["check"] != "header" || len(d.Related) != 1 || d.Related[0].ID != "good.esp" {
				t.Fatalf("adapter diagnostic = %+v", d)
			}
		}
		if d.Code == diagnostic.CodePluginHeaderUnreadable {
			unreadable = true
		}
	}
	if !checked || !unreadable {
		t.Fatalf("diagnostics = %+v", ds)
	}
}

func TestPluginsWithoutPluginChecker(t *testing.T) {
	e := pluginEnv(t)
	e.pluginMods(map[string][]byte{"Good.esp": tes4(0)}, "Good.esp")
	a := pluginSupportOnly{GameAdapter: skyrimse.Adapter{}, PluginSupport: skyrimse.Adapter{}}
	registry, err := games.NewRegistry(a)
	if err != nil {
		t.Fatal(err)
	}
	e.plug.Registry = registry
	ds, err := e.plug.Diagnostics(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(ds) != 0 {
		t.Fatalf("unexpected extra diagnostics = %+v", ds)
	}
}

var _ ports.PluginChecker = (*headerChecker)(nil)
var _ ports.PluginSupport = pluginSupportOnly{}
