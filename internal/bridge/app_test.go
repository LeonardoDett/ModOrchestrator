package bridge

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"modorchestrator/internal/bootstrap"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/infrastructure/appdata"
)

func TestBridgeForwardsOperationEventsAndQueries(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(appdata.EnvDataDir, dir)
	ctx := context.Background()

	c, err := bootstrap.New(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	app := NewApp(c)
	var emitted []EventDTO
	app.emit = func(_ context.Context, name string, data ...any) {
		if name != EventOperation {
			t.Errorf("unexpected channel %s", name)
		}
		emitted = append(emitted, data[0].(EventDTO))
	}
	app.Startup(ctx)
	defer app.Shutdown(ctx)

	id, err := c.Operations.Run(ctx, operations.Spec{Kind: "noop", Steps: []string{"only"}}, func(ctx context.Context, tr *operations.Tracker) error {
		if err := tr.BeginStep(ctx, "only"); err != nil {
			return err
		}
		return tr.CompleteStep(ctx, "only")
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(emitted) != 5 || emitted[len(emitted)-1].Status != "succeeded" {
		t.Fatalf("emitted = %+v", emitted)
	}

	ops, err := app.ListRecentOperations(10)
	if err != nil || len(ops) != 1 || ops[0].ID != string(id) || ops[0].Steps[0].Status != "completed" {
		t.Fatalf("ops = %+v, err = %v", ops, err)
	}
	evs, err := app.GetOperationEvents(string(id))
	if err != nil || len(evs) != len(emitted) {
		t.Fatalf("events = %d, emitted = %d, err = %v", len(evs), len(emitted), err)
	}

	info := app.GetAppInfo()
	if info.DataDir == "" || info.SchemaVersion == 0 {
		t.Fatalf("info = %+v", info)
	}
}

func TestBridgeSettingsLogAndCodedErrors(t *testing.T) {
	t.Setenv(appdata.EnvDataDir, t.TempDir())
	ctx := context.Background()
	c, err := bootstrap.New(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	app := NewApp(c)

	info := app.GetAppInfo()
	if !info.CustomTitleBar || info.LogsDir == "" {
		t.Fatalf("info = %+v", info)
	}

	if err := app.SetAppSetting("ui.language", "pt-BR"); err != nil {
		t.Fatal(err)
	}
	all, err := app.ListAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range all {
		if s.Key == "ui.language" {
			found = s.Value == "pt-BR" && !s.IsDefault && len(s.Options) == 2
		}
	}
	if !found {
		t.Fatalf("ui.language not stored: %+v", all)
	}

	// INV-OPS-05: failures reach the UI as a stable code plus parameters.
	for _, tc := range []struct {
		err  error
		code string
	}{
		{app.SetAppSetting("theme.mode", "sepia"), CodeSettingInvalid},
		{app.SetAppSetting("no.such.key", "x"), CodeSettingUnknown},
		{app.ResetAppSetting("no.such.key"), CodeSettingUnknown},
	} {
		var decoded Error
		if tc.err == nil || json.Unmarshal([]byte(tc.err.Error()), &decoded) != nil {
			t.Fatalf("error %v is not a coded JSON error", tc.err)
		}
		if decoded.Code != tc.code || decoded.Params["key"] == "" || decoded.Detail == "" {
			t.Errorf("decoded = %+v, want code %s with key param", decoded, tc.code)
		}
	}
	// An unknown operation has no events; an error, if any, must be coded.
	if _, err := app.GetOperationEvents("missing"); err != nil && !strings.Contains(err.Error(), `"code"`) {
		t.Errorf("uncoded error %v", err)
	}

	entries, err := app.LogTail(LogFilterDTO{Text: "setting changed"})
	if err != nil || len(entries) != 1 || entries[0].Level != "info" || entries[0].Fields["key"] != "ui.language" {
		t.Fatalf("log = %+v, err = %v", entries, err)
	}
	warns, _ := app.LogTail(LogFilterDTO{Levels: []string{"warn"}})
	if len(warns) != 3 {
		t.Fatalf("each failed call is logged once: %+v", warns)
	}
}

// The Settings tabs come from the catalog: the plugins module contributes
// its tab after Mods, gated by the settings.plugins section, and its keys
// are instance settings like any other (D135).
func TestBridgeSettingsTabsIncludeModuleTabs(t *testing.T) {
	t.Setenv(appdata.EnvDataDir, t.TempDir())
	c, err := bootstrap.New(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	app := NewApp(c)

	got := app.SettingsTabs()
	want := []SettingsTabDTO{{ID: "interface"}, {ID: "application"}, {ID: "mods"}, {ID: "plugins", Section: "settings.plugins"}, {ID: "workarounds"}, {ID: "theme"}}
	if len(got) != len(want) {
		t.Fatalf("tabs = %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("tabs = %+v, want %+v", got, want)
		}
	}
	if err := app.SetInstanceSetting("i1", "plugins.autoSort", "false"); err != nil {
		t.Fatal(err)
	}
	all, err := app.ListInstanceSettings("i1")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range all {
		if s.Key == "plugins.autoSort" {
			found = s.Tab == "plugins" && s.Value == "false"
		}
		if s.Key == "plugins.lootProvider" {
			t.Fatal("a reserved module setting is not listed in V1")
		}
	}
	if !found {
		t.Fatalf("plugins.autoSort missing or wrong: %+v", all)
	}
}
