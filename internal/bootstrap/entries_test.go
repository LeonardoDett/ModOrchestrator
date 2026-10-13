package bootstrap

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
)

// D117 on a real database: an instance written by a version that knew only
// the template game gets an entry of its own at startup, the entry is
// stored, and the next start finds nothing left to do.
func TestStartupMigratesCustomGamesToEntries(t *testing.T) {
	dir := t.TempDir()
	c, err := startIn(t, dir)
	if err != nil {
		t.Fatal(err)
	}
	c.Close()

	root := filepath.Join(t.TempDir(), "Stardew")
	if err := os.MkdirAll(filepath.Join(root, "Mods"), 0o755); err != nil {
		t.Fatal(err)
	}
	mo := t.TempDir()
	ctx := context.Background()
	db, err := sqlite.Open(ctx, filepath.Join(dir, "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	legacy := game.Instance{
		ID: "old", Game: "generic", Adapter: "generic", AdapterVersion: "1", DisplayName: "Stardew Valley",
		Root: root, Staging: filepath.Join(mo, "staging"), ArchiveStore: filepath.Join(mo, "archives"), BackupStore: filepath.Join(mo, "backups"),
		Targets:         []game.Target{{ID: "mods", Path: filepath.Join(root, "Mods")}},
		PreferredMethod: game.MethodHardlink, Store: "manual", Executable: "Stardew.exe",
	}
	if err := sqlite.NewGameInstanceRepository(db).Save(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	db.Close()

	if c, err = startIn(t, dir); err != nil {
		t.Fatal(err)
	}
	inst, err := c.Games.Instances.Get(ctx, "old")
	if err != nil || inst.Game != "user.stardew-valley" || inst.AdapterVersion != "2" || inst.Root != root || len(inst.Targets) != 1 || inst.Targets[0] != legacy.Targets[0] {
		t.Fatalf("instance = %+v, %v", inst, err)
	}
	m, err := c.Games.Details(ctx, "old")
	if err != nil || m.Unavailable || m.Definition.Name != "Stardew Valley" || !m.Definition.Capabilities.Has(game.CapLaunch) {
		t.Fatalf("details = %+v, %v", m, err)
	}
	c.Close()

	// The entry was stored: a new start serves it and migrates nothing.
	if c, err = startIn(t, dir); err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	entries, err := c.Games.ListEntries(ctx)
	if err != nil || len(entries) != 1 || entries[0].Manifest.ID != "user.stardew-valley" || entries[0].Instances != 1 {
		t.Fatalf("entries = %+v, %v", entries, err)
	}
	if again, _ := c.Games.Instances.Get(ctx, "old"); again.Game != inst.Game {
		t.Fatalf("game changed again: %q", again.Game)
	}
}
