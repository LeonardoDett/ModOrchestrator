package gamesflow_test

import (
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/domain/game"
)

func featureOf(t *testing.T, list []games.InstanceFeature, id game.Capability) games.InstanceFeature {
	t.Helper()
	i := slices.IndexFunc(list, func(f games.InstanceFeature) bool { return f.ID == id })
	if i < 0 {
		t.Fatalf("no feature %q", id)
	}
	return list[i]
}

// D115: the user turns optional features on and off per instance; the
// workspace follows what is in effect; base features and features the game
// does not offer are refused with a reason.
func TestFeaturesOfAnInstanceAreTurnedOnAndOff(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Store: "steam"})
	if err != nil {
		t.Fatal(err)
	}
	id := res.Instance
	items := func() []games.WorkspaceItem {
		w, err := e.svc.Workspace(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return w.Items
	}
	if it := items(); !slices.Contains(it, games.ItemPlugins) || !slices.Contains(it, games.ItemLoadOrder) {
		t.Fatalf("everything starts on: %v", it)
	}

	if err := e.svc.SetFeature(ctx, id, game.CapPlugins, false); err != nil {
		t.Fatal(err)
	}
	if it := items(); slices.Contains(it, games.ItemPlugins) || slices.Contains(it, games.ItemLoadOrder) || !slices.Contains(it, games.ItemMods) {
		t.Fatalf("plugins off: %v", it)
	}
	list, err := e.svc.Features(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if f := featureOf(t, list, game.CapPlugins); f.Status != games.FeatureAvailable || f.Enabled || f.Effective {
		t.Errorf("plugins = %+v", f)
	}
	// Load order keeps the choice of the user and says what holds it back.
	if f := featureOf(t, list, game.CapLoadOrder); !f.Enabled || f.Effective || !slices.Equal(f.BlockedBy, []game.Capability{game.CapPlugins}) {
		t.Errorf("load order = %+v", f)
	}
	if f := featureOf(t, list, game.CapExternalChanges); f.Class != game.ClassBase || !f.Enabled || !f.Effective {
		t.Errorf("external changes = %+v", f)
	}
	if f := featureOf(t, list, game.CapSaveGames); f.Status != games.FeatureNotApplicable || f.Enabled || f.Effective {
		t.Errorf("save games = %+v", f)
	}
	m, err := e.svc.Details(ctx, id)
	if err != nil || m.Definition.Capabilities.Has(game.CapPlugins) || !m.Definition.Capabilities.Has(game.CapLaunch) {
		t.Fatalf("details show what is in effect: %v, %v", m.Definition.Capabilities.List(), err)
	}

	for want, change := range map[string]func() error{
		games.CodeFeatureLocked:      func() error { return e.svc.SetFeature(ctx, id, game.CapExternalChanges, false) },
		games.CodeFeatureUnavailable: func() error { return e.svc.SetFeature(ctx, id, game.CapSaveGames, true) },
		games.CodeFeatureRequires:    func() error { return e.svc.SetFeature(ctx, id, game.CapLoadOrder, true) },
	} {
		if got := code(t, change()); got != want {
			t.Errorf("got %s, want %s", got, want)
		}
	}

	if err := e.svc.SetFeature(ctx, id, game.CapPlugins, true); err != nil {
		t.Fatal(err)
	}
	if it := items(); !slices.Contains(it, games.ItemPlugins) || !slices.Contains(it, games.ItemLoadOrder) {
		t.Fatalf("back on: %v", it)
	}
	for _, w := range e.fs.Writes {
		if strings.HasPrefix(w, root) {
			t.Fatalf("changing a feature wrote in the game: %v", e.fs.Writes)
		}
	}
}

// A game with no optional process has nothing to turn off.
func TestGenericGameOffersNoOptionalFeature(t *testing.T) {
	e := newEnv()
	e.fs.AddDir(`C:\Games\Valheim`)
	res, err := e.svc.Manage(ctx, games.Setup{
		Game: "generic", Name: "Valheim", Root: `C:\Games\Valheim`,
		Targets: []game.TargetSpec{{ID: "mods", Path: "Mods"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	list, err := e.svc.Features(ctx, res.Instance)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range list {
		if f.Class == game.ClassOptional && f.Status != games.FeatureNotApplicable {
			t.Errorf("generic offers %+v", f)
		}
	}
	if got := code(t, e.svc.SetFeature(ctx, res.Instance, game.CapPlugins, false)); got != games.CodeFeatureUnavailable {
		t.Errorf("got %s", got)
	}
}
