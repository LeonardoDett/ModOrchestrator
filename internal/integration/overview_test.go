package integration_test

import (
	"testing"

	launchsvc "modorchestrator/internal/core/application/launch"
	overviewsvc "modorchestrator/internal/core/application/overview"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

func (e *env) overview() *overviewsvc.Service {
	return overviewsvc.NewService(overviewsvc.Sources{
		Games: e.games, Instances: sqlite.NewGameInstanceRepository(e.db), Deploy: e.dep, Diagnostics: e.diag,
		Library: e.lib, Conflicts: e.conf, Plugins: e.plug, History: e.hist,
		Settings: appsettings.NewService(sqlite.NewSettingsRepository(e.db), system.Locale{}, settings.V1),
		Facts:    sqlite.NewFacts(e.db),
	})
}

// ui/telas/overview.md: one query with the figures of the game, each from
// its owner; "Primeiros passos" follows the facts and hides once complete
// unless pinned (dashboard.md).
func TestOverviewAndFirstSteps(t *testing.T) {
	e := newEnv(t)
	ov := e.overview()
	steps, err := ov.FirstSteps(ctx)
	if err != nil || steps.Complete || !steps.Steps[0].Done || steps.Steps[1].Done {
		t.Fatalf("first steps = %+v %v", steps, err)
	}
	e.installFiles(map[string][]string{"Alpha": {"textures/a.dds", "a", "Alpha.esp", "alpha"}, "Bravo": {"textures/a.dds", "b"}}, "Alpha", "Bravo")

	v, err := ov.Instance(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if v.Mods == nil || v.Mods.Total != 2 || v.Mods.Enabled != 2 || v.Mods.Files != 3 {
		t.Fatalf("mods = %+v", v.Mods)
	}
	if v.Conflicts == nil || v.Conflicts.Pairs != 1 || v.Conflicts.Unreviewed != 1 {
		t.Fatalf("conflicts = %+v", v.Conflicts)
	}
	if v.Status == nil || v.Plugins == nil || v.Plugins.Active == 0 || len(v.Recent) == 0 {
		t.Fatalf("status/plugins/recent = %+v %+v %d", v.Status, v.Plugins, len(v.Recent))
	}
	if len(v.Attention) == 0 {
		t.Fatal("pending deploy and unreviewed conflicts need attention")
	}

	e.deploy("deploy")
	l := e.launchService(&fakeLauncher{}, nil)
	id, err := l.Launch(ctx, e.inst.ID, launchsvc.Request{Confirmed: true})
	if err != nil {
		t.Fatal(err)
	}
	if o := e.waitLaunch(l, id); o.Status != operation.StatusSucceeded {
		t.Fatalf("launch = %+v", o.Error)
	}
	if steps, _ := ov.FirstSteps(ctx); !steps.Complete {
		t.Fatalf("all done = %+v", steps)
	}
	layout, err := ov.Layout(ctx)
	if err != nil || layout[0].ID != "first_steps" || layout[0].Visible {
		t.Fatalf("complete first steps hide = %+v %v", layout, err)
	}
	e.setApp("ui.dashboard.dashlets", "+first_steps,-whats_new")
	layout, _ = ov.Layout(ctx)
	if !layout[0].Visible || !layout[0].Pinned || layout[1].ID != "whats_new" || layout[1].Visible || !layout[2].Visible {
		t.Fatalf("pinned and hidden = %+v", layout)
	}
	recent, err := ov.RecentGames(ctx)
	if err != nil || len(recent) != 1 || recent[0].LastUsed.IsZero() {
		t.Fatalf("recent = %+v %v", recent, err)
	}
}
