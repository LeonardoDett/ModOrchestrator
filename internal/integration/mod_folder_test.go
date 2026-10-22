package integration_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/syndtr/goleveldb/leveldb"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/imports"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// folderGame is a test adapter whose default mod type puts each mod in a
// folder of its own (D144), as no built-in game does yet; its "loose" mod
// type merges into the same target.
type folderGame struct{}

const (
	folderGameID game.ID        = "folders"
	folderTarget game.TargetID  = "mods"
	looseType    game.ModTypeID = "loose"
)

func (folderGame) Name() string    { return "folders" }
func (folderGame) Version() string { return "1" }

func (folderGame) Definitions() []game.Definition {
	return []game.Definition{{
		ID: folderGameID, Name: "Folder game",
		Capabilities: game.NewCapabilities(game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller),
		Targets:      []game.TargetID{folderTarget},
		ModTypes: []game.ModType{
			{ID: game.DefaultModType, Name: "Default", Target: folderTarget, Layout: game.LayoutModFolder},
			{ID: looseType, Name: "Loose", Target: folderTarget, Layout: game.LayoutMerge},
		},
	}}
}

func (a folderGame) InstanceDefinition(game.ID, []game.Target) (game.Definition, error) {
	d := a.Definitions()[0]
	return d, d.Validate()
}

func (folderGame) ValidateRoot(ctx context.Context, fs ports.FileReader, _ game.ID, root string) error {
	if info, err := fs.Stat(ctx, root); err != nil || !info.Exists || !info.IsDir {
		return &game.RootError{Reason: game.RootNotFound}
	}
	return nil
}

func (folderGame) Targets(_ game.ID, root string, _ []game.TargetSpec) ([]game.Target, error) {
	return []game.Target{{ID: folderTarget, Path: game.JoinPath(root, "Mods")}}, nil
}

func (folderGame) RootHints(game.ID) ports.RootHints { return ports.RootHints{} }

// ContentFlags records what it was given, so a test can prove it sees the
// paths relative to the mod's root.
func (folderGame) ContentFlags(_ game.ID, footprint []game.Location) []mod.ContentFlag {
	var out []mod.ContentFlag
	for _, l := range footprint {
		if l.Path.Key() == "readme.txt" {
			out = append(out, "readme_at_root")
		}
	}
	return out
}

func folderEnv(t *testing.T) (*env, string) {
	t.Helper()
	var root string
	e := newEnvWith(t, envOptions{
		adapters: []ports.GameAdapter{folderGame{}},
		setup: func(dir string) games.Setup {
			root = filepath.Join(dir, "Game")
			if err := os.MkdirAll(filepath.Join(root, "Mods"), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, "Mods", "keep.txt"), []byte("x"), 0o644); err != nil {
				t.Fatal(err)
			}
			return games.Setup{
				Game: folderGameID, Root: root, Method: game.MethodCopy,
				Folders: games.Folders{
					Staging: filepath.Join(dir, "mo", "staging"), ArchiveStore: filepath.Join(dir, "mo", "archives"),
					BackupStore: filepath.Join(dir, "mo", "backups"),
				},
			}
		},
	})
	return e, root
}

// D144: mods of a type with a folder per mod are deployed below
// <target>/<mod id>/, never dispute a location, and the purge takes the
// folders away again.
func TestModFolderLayoutDeploysEachModInItsOwnFolder(t *testing.T) {
	e, root := folderEnv(t)
	before := snapshot(t, root)
	ids := e.installFiles(map[string][]string{
		"A": {"a.txt", "from A", "readme.txt", "r"},
		"B": {"a.txt", "from B"},
	}, "A", "B")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	a, _ := e.mods.Get(ctx, ids[0])
	if !slices.Contains(a.Content, "readme_at_root") {
		t.Fatalf("content flags must see paths relative to the mod's root: %v", a.Content)
	}
	if p := e.pairs(); len(p.Pairs) != 0 {
		t.Fatalf("mods in folders of their own must not conflict: %+v", p.Pairs)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	mods := filepath.Join(root, "Mods")
	for i, want := range []string{"from A", "from B"} {
		if got := readFile(t, filepath.Join(mods, string(ids[i]), "a.txt")); got != want {
			t.Fatalf("%s: %q, want %q", ids[i], got, want)
		}
	}
	if _, err := os.Stat(filepath.Join(mods, "a.txt")); !os.IsNotExist(err) {
		t.Fatalf("nothing may be merged into the target: %v", err)
	}

	// A rename and a reinstall keep the folder: it derives from the id.
	if err := e.lib.SetAttributes(ctx, ids[0], library.AttributesInput{Name: "Renamed"}); err != nil {
		t.Fatal(err)
	}
	ops, err := e.lib.ReinstallMods(ctx, e.inst.ID, ids[:1])
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if o := e.op(ops[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("reinstall: %s %+v", o.Status, o.Error)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy after reinstall: %+v", op)
	}
	if got := readFile(t, filepath.Join(mods, string(ids[0]), "a.txt")); got != "from A" {
		t.Fatalf("after reinstall: %q", got)
	}

	if op := e.deploy("purge"); op.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", op)
	}
	if diff := diffSnapshots(before, snapshot(t, root)); len(diff) != 0 {
		t.Fatalf("game after purge differs: %v", diff)
	}
}

// Changing the mod type moves the files between the mod's folder and the
// merged target; the next deploy moves them in the game.
func TestModTypeChangeRelocatesBetweenLayouts(t *testing.T) {
	e, root := folderEnv(t)
	before := snapshot(t, root)
	ids := e.installFiles(map[string][]string{"A": {"a.txt", "a", "b.txt", "b"}}, "A")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	mods := filepath.Join(root, "Mods")
	inFolder := filepath.Join(mods, string(ids[0]), "a.txt")
	merged := filepath.Join(mods, "a.txt")
	if readFile(t, inFolder) != "a" {
		t.Fatal("not deployed in the mod's folder")
	}
	if err := e.lib.SetModType(ctx, ids[0], looseType); err != nil {
		t.Fatal(err)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	if readFile(t, merged) != "a" {
		t.Fatal("not deployed into the merged target")
	}
	if _, err := os.Stat(filepath.Join(mods, string(ids[0]))); !os.IsNotExist(err) {
		t.Fatalf("the mod's folder must leave with its files: %v", err)
	}
	if err := e.lib.SetModType(ctx, ids[0], game.DefaultModType); err != nil {
		t.Fatal(err)
	}
	e.deploy("deploy")
	if readFile(t, inFolder) != "a" {
		t.Fatal("back to the mod's folder")
	}
	if _, err := os.Stat(merged); !os.IsNotExist(err) {
		t.Fatalf("merged copy must leave: %v", err)
	}
	e.deploy("purge")
	if diff := diffSnapshots(before, snapshot(t, root)); len(diff) != 0 {
		t.Fatalf("game after purge differs: %v", diff)
	}
}

// Without the layout (generic adapter) nothing changes: the same mods
// merge into the target and dispute the location.
func TestGenericGameStillMergesMods(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	ids := e.installFiles(map[string][]string{"A": {"a.txt", "from A"}, "B": {"a.txt", "from B"}}, "A", "B")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	if p := e.pairs(); len(p.Pairs) != 1 {
		t.Fatalf("merged mods must conflict: %+v", p.Pairs)
	}
	e.deploy("deploy")
	mods := filepath.Join(e.dir, "Game", "Mods")
	if got := readFile(t, filepath.Join(mods, "a.txt")); got != "from B" {
		t.Fatalf("winner %q", got)
	}
	if _, err := os.Stat(filepath.Join(mods, string(ids[0]))); !os.IsNotExist(err) {
		t.Fatalf("no folder per mod without the layout: %v", err)
	}
}

// A mod imported from Vortex gets the layout of its mod type: in a game
// with a folder per mod, its files go to the folder of the new mod.
func TestImportFromVortexUsesTheModFolderLayout(t *testing.T) {
	e, root := folderEnv(t)
	data := filepath.Join(e.dir, "AppData", "Vortex")
	e.write(filepath.Join(data, "folders", "mods", "A-1", "a.txt"), "a")
	db, err := leveldb.OpenFile(filepath.Join(data, "state.v2"), nil)
	if err != nil {
		t.Fatal(err)
	}
	put := func(v any, key ...string) {
		raw, _ := json.Marshal(v)
		if err := db.Put([]byte(strings.Join(key, "###")), raw, nil); err != nil {
			t.Fatal(err)
		}
	}
	put(root, "settings", "gameMode", "discovered", "folders", "path")
	put("p1", "settings", "profiles", "lastActiveProfile", "folders")
	base := []string{"persistent", "mods", "folders", "A-1"}
	put("A-1", append(base, "id")...)
	put("installed", append(base, "state")...)
	put("A-1", append(base, "installationPath")...)
	put("", append(base, "type")...)
	put("Alpha", append(base, "attributes", "logicalFileName")...)
	put("folders", "persistent", "profiles", "p1", "gameId")
	put("Main", "persistent", "profiles", "p1", "name")
	put(true, "persistent", "profiles", "p1", "modState", "A-1", "enabled")
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	srcs, err := e.imp.Sources(ctx, e.inst.ID)
	if err != nil || len(srcs) != 1 {
		t.Fatalf("sources: %+v %v", srcs, err)
	}
	if op := e.runImport(srcs[0], imports.Options{}); op.Status != operation.StatusSucceeded {
		t.Fatalf("import: %+v", op.Error)
	}
	alpha := e.modsByName()["Alpha"]
	if alpha == nil {
		t.Fatal("Alpha not imported")
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	if got := readFile(t, filepath.Join(root, "Mods", string(alpha.ID), "a.txt")); got != "a" {
		t.Fatalf("imported mod deployed %q", got)
	}
}
