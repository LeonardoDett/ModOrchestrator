package bridge

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"modorchestrator/internal/bootstrap"
	"modorchestrator/internal/infrastructure/appdata"
)

func newGamesApp(t *testing.T) *App {
	t.Helper()
	t.Setenv(appdata.EnvDataDir, t.TempDir())
	c, err := bootstrap.New(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	return NewApp(c)
}

func decodeErr(t *testing.T, err error) Error {
	t.Helper()
	var e Error
	if err == nil || json.Unmarshal([]byte(err.Error()), &e) != nil {
		t.Fatalf("not a coded error: %v", err)
	}
	return e
}

// Demonstration of the phase on real folders: a generic game with two
// targets is verified, managed, shown in the workspace and unmanaged.
func TestBridgeManagesAGenericGameEndToEnd(t *testing.T) {
	app := newGamesApp(t)
	base := t.TempDir()
	root := filepath.Join(base, "Valheim")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	setup := SetupDTO{
		GameID: "generic", Name: "Valheim", Root: root,
		Targets:      []TargetSpecDTO{{ID: "mods", Path: "Mods"}, {ID: "plugins", Path: "BepInEx/plugins"}},
		Staging:      filepath.Join(base, "mo", "staging"),
		ArchiveStore: filepath.Join(base, "mo", "archives"),
		BackupStore:  filepath.Join(base, "mo", "backups"),
	}

	v, err := app.VerifyGameSetup(setup)
	if err != nil || len(v.Problems) != 0 || len(v.Targets) != 2 || !v.Methods[0].Available {
		t.Fatalf("verification = %+v, %v", v, err)
	}
	if _, err := os.Stat(setup.Staging); err == nil {
		t.Fatal("verification must not create anything")
	}

	res, err := app.ManageGame(setup)
	if err != nil {
		t.Fatal(err)
	}
	for _, marker := range []string{
		filepath.Join(setup.Staging, ".modorchestrator-staging"),
		filepath.Join(setup.ArchiveStore, ".modorchestrator-archives"),
		filepath.Join(setup.BackupStore, ".modorchestrator-backups"),
	} {
		if _, err := os.Stat(marker); err != nil {
			t.Errorf("marker missing: %v", err)
		}
	}
	if entries, _ := os.ReadDir(root); len(entries) != 0 {
		t.Fatalf("the game folder must stay untouched: %v", entries)
	}

	view, err := app.GamesView(false)
	if err != nil || len(view.Managed) != 1 || !view.Managed[0].Active || len(view.Managed[0].Targets) != 2 {
		t.Fatalf("view = %+v, %v", view, err)
	}
	ws, err := app.Workspace()
	if err != nil || ws.Active == nil || ws.Active.ID != res.InstanceID {
		t.Fatalf("workspace = %+v, %v", ws, err)
	}
	if slices.Contains(ws.Items, "plugins") || slices.Contains(ws.Items, "load_order") || !slices.Contains(ws.Items, "mods") {
		t.Fatalf("items = %v", ws.Items)
	}
	details, err := app.GameInstanceDetails(res.InstanceID)
	if err != nil || len(details.ModTypes) != 2 || details.ModTypes[0].ID != "default" {
		t.Fatalf("details = %+v, %v", details, err)
	}

	// D115: a game with no optional process has nothing to turn off, and
	// the refusal is coded.
	feats, err := app.InstanceFeatures(res.InstanceID)
	if err != nil || len(feats) == 0 {
		t.Fatalf("features = %+v, %v", feats, err)
	}
	for _, f := range feats {
		if f.Class == "optional" && (f.Status != "not_applicable" || f.Enabled || f.Effective) {
			t.Errorf("generic feature = %+v", f)
		}
		if f.Requires == nil || f.BlockedBy == nil {
			t.Errorf("lists must never be null for the UI: %+v", f)
		}
	}
	if e := decodeErr(t, app.SetInstanceFeature(res.InstanceID, "plugins", false)); e.Code != "feature_unavailable" {
		t.Fatalf("code = %s", e.Code)
	}
	if e := decodeErr(t, app.SetInstanceFeature(res.InstanceID, "installer", false)); e.Code != "feature_locked" {
		t.Fatalf("code = %s", e.Code)
	}

	// Same folder twice is a coded refusal the UI can translate.
	if e := decodeErr(t, func() error { _, err := app.ManageGame(setup); return err }()); e.Code != "root_in_use" {
		t.Fatalf("code = %s", e.Code)
	}

	if _, err := app.UnmanageGame(res.InstanceID, UnmanageOptionsDTO{}); err != nil {
		t.Fatal(err)
	}
	if view, _ := app.GamesView(false); len(view.Managed) != 0 {
		t.Fatal("instance must be gone")
	}
	if _, err := os.Stat(filepath.Join(setup.Staging, ".modorchestrator-staging")); err != nil {
		t.Fatal("staging is kept by default")
	}
}

func TestBridgeRefusesAWrongFolderWithACodedReason(t *testing.T) {
	app := newGamesApp(t)
	empty := t.TempDir()
	check, err := app.ValidateGameRoot("skyrimse", empty)
	if err != nil || check.Problem == nil || check.Problem.Code != "root_invalid" ||
		check.Problem.Params["reason"] != "marker_missing" || check.Problem.Params["marker"] == "" {
		t.Fatalf("check = %+v, %v", check, err)
	}
	if e := decodeErr(t, func() error { _, err := app.ManageGame(SetupDTO{GameID: "skyrimse", Root: empty}); return err }()); e.Code != "root_invalid" {
		t.Fatalf("code = %s", e.Code)
	}
	if e := decodeErr(t, app.SetActiveInstance("missing")); e.Code != "not_found" {
		t.Fatalf("code = %s", e.Code)
	}
	if _, err := app.GamesView(false); err != nil {
		t.Fatal(err)
	}
}

// D113: the registry answers, as data, how each game is served and which
// features it offers.
func TestBridgeGamesSupportDescribesTheRegistry(t *testing.T) {
	app := newGamesApp(t)
	byID := map[string]GameSupportDTO{}
	for _, g := range app.GamesSupport() {
		byID[g.GameID] = g
	}
	feature := func(g GameSupportDTO, id string) FeatureDTO {
		i := slices.IndexFunc(g.Features, func(f FeatureDTO) bool { return f.ID == id })
		if i < 0 {
			t.Fatalf("%s lists no %q", g.GameID, id)
		}
		return g.Features[i]
	}

	custom, ok := byID["generic"]
	if !ok || custom.Support != "custom" || !custom.Custom || len(custom.Stores) != 0 {
		t.Fatalf("generic = %+v", custom)
	}
	if f := feature(custom, "plugins"); f.Status != "not_applicable" || f.Class != "optional" || f.Default {
		t.Errorf("generic plugins = %+v", f)
	}

	full := byID["skyrimse"]
	if full.Support != "full" {
		t.Fatalf("skyrimse = %+v", full)
	}
	if !slices.Equal(full.Stores, []string{"steam", "gog", "epic", "registry"}) {
		t.Fatalf("full game = %+v", full)
	}
	if f := feature(full, "load_order"); f.Status != "available" || f.Class != "optional" || !f.Default || !slices.Equal(f.Requires, []string{"plugins"}) {
		t.Errorf("load_order = %+v", f)
	}
	if f := feature(full, "external_change_strategy"); f.Class != "base" || len(f.Requires) != 0 {
		t.Errorf("external changes = %+v", f)
	}
}
