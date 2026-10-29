package integration_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	"modorchestrator/internal/adapters/generic"
	diagsvc "modorchestrator/internal/core/application/diagnostics"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// D145: every installed mod keeps .modorchestrator-mod.json in its staging
// folder, written after each change of its metadata. The file never enters
// the installation, the deploy or the conflicts. Generic adapter: the
// feature belongs to the core and holds for every game.

func (e *env) metadata(id mod.ID) mod.Metadata {
	e.t.Helper()
	data, err := os.ReadFile(filepath.Join(e.inst.Staging, string(id), game.ModMetadataFile))
	if err != nil {
		e.t.Fatalf("metadata of %s: %v", id, err)
	}
	md, err := mod.ParseMetadata(data, string(id))
	if err != nil {
		e.t.Fatal(err)
	}
	return md
}

func (e *env) row(id mod.ID) library.ModRow {
	e.t.Helper()
	for _, r := range e.rows() {
		if r.ID == id {
			return r
		}
	}
	e.t.Fatalf("mod %s is not in the library", id)
	return library.ModRow{}
}

func TestModMetadataFollowsTheLibrary(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	// An archive that carries a file named like the metadata does not get
	// to install it.
	ids := e.installFiles(map[string][]string{
		"Alpha": {"a.txt", "a", "shared.txt", "1", game.ModMetadataFile, `{"formatVersion":1,"modId":"evil"}`},
		"Beta":  {"b.txt", "b"},
	}, "Alpha", "Beta")
	a, b := ids[0], ids[1]

	md := e.metadata(a)
	if md.Mod != a || md.Instance != e.inst.ID || md.Name != "Alpha" || md.Archive == nil || md.Archive.OriginalName != "Alpha.zip" {
		t.Fatalf("metadata after install: %+v", md)
	}
	if slices.ContainsFunc(e.files(a), func(f string) bool { return strings.Contains(strings.ToLower(f), ".modorchestrator") }) {
		t.Fatalf("the metadata entered the installation: %v", e.files(a))
	}

	// Editing attributes, the category and renaming the category rewrite it.
	if err := e.lib.SetAttributes(ctx, a, library.AttributesInput{Name: "My Alpha", Version: "2.0", Notes: "keep", Tags: []string{"ui"}}); err != nil {
		t.Fatal(err)
	}
	cat, err := e.lib.SaveCategory(ctx, e.inst.ID, library.CategoryInput{Name: "Interface"})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.lib.SetCategory(ctx, e.inst.ID, []mod.ID{a}, cat); err != nil {
		t.Fatal(err)
	}
	if _, err := e.lib.SaveCategory(ctx, e.inst.ID, library.CategoryInput{ID: cat, Name: "UI"}); err != nil {
		t.Fatal(err)
	}
	md = e.metadata(a)
	if md.Attributes.Name != "My Alpha" || md.Attributes.Version != "2.0" || md.Attributes.Notes != "keep" ||
		md.Category == nil || md.Category.ID != cat || md.Category.Name != "UI" {
		t.Fatalf("metadata after edits: %+v %+v", md.Attributes, md.Category)
	}

	// Reinstalling swaps the folder: the file is in the final one.
	ops, err := e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{a})
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if op := e.op(ops[0]); op.Status != operation.StatusSucceeded {
		t.Fatalf("reinstall: %+v", op)
	}
	if md = e.metadata(a); md.Attributes.Name != "My Alpha" {
		t.Fatalf("metadata after reinstall: %+v", md.Attributes)
	}
	if _, err := os.Stat(filepath.Join(e.inst.Staging, string(a)+".replaced")); !os.IsNotExist(err) {
		t.Fatalf("old folder left: %v", err)
	}

	// Deploy and conflicts never see the file.
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	if got := tree(t, filepath.Join(e.dir, "Game", "Mods")); slices.ContainsFunc(got, func(f string) bool { return strings.Contains(strings.ToLower(f), "modorchestrator-mod") }) {
		t.Fatalf("metadata deployed: %v", got)
	}
	if v := e.pairs(); len(v.Pairs) != 0 {
		t.Fatalf("mods with only their metadata in common must not conflict: %+v", v.Pairs)
	}
	_ = b

	// Mods from before D145 get the file at startup.
	if err := os.Remove(filepath.Join(e.inst.Staging, string(b), game.ModMetadataFile)); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.problem(diagnostic.CodeModMetadataStale); !ok {
		t.Fatalf("missing metadata is not reported: %+v", e.problems().Items)
	}
	if err := e.lib.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	if md := e.metadata(b); md.Name != "Beta" {
		t.Fatalf("backfilled metadata: %+v", md)
	}
}

// failingWrites fails the writes of metadata files while on is set.
type failingWrites struct {
	ports.FileSystem
	on *atomic.Bool
}

func (f failingWrites) WriteFile(ctx context.Context, path string, data []byte) error {
	if f.on.Load() && strings.HasSuffix(strings.ToLower(path), game.ModMetadataFile) {
		return errors.New("disk refused")
	}
	return f.FileSystem.WriteFile(ctx, path, data)
}

// A metadata file that cannot be written never undoes the change: it
// becomes mod_metadata_stale, and "Regravar metadados" fixes it.
func TestMetadataWriteFailureIsADiagnostic(t *testing.T) {
	var on atomic.Bool
	e := newEnvWith(t, envOptions{generic: true, fs: func(f ports.FileSystem) ports.FileSystem { return failingWrites{f, &on} }})
	id := e.installFiles(map[string][]string{"Alpha": {"a.txt", "a"}}, "Alpha")[0]

	on.Store(true)
	if err := e.lib.SetAttributes(ctx, id, library.AttributesInput{Name: "Renamed"}); err != nil {
		t.Fatalf("the edit must not fail with the metadata: %v", err)
	}
	if e.row(id).Name != "Renamed" {
		t.Fatal("the edit was undone")
	}
	it, ok := e.problem(diagnostic.CodeModMetadataStale)
	if !ok || it.Params["count"] != "1" || it.Module != diagnostic.ModuleLibrary {
		t.Fatalf("stale metadata diagnostic: %+v %v", it, ok)
	}
	if e.metadata(id).Attributes.Name == "Renamed" {
		t.Fatal("the file could not have been written")
	}

	on.Store(false)
	if _, err := e.diag.Execute(ctx, e.inst.ID, it.Key, diagsvc.ActionRewriteMetadata, 0); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.problem(diagnostic.CodeModMetadataStale); ok {
		t.Fatal("the diagnostic stays after rewriting")
	}
	if e.metadata(id).Attributes.Name != "Renamed" {
		t.Fatal("rewrite did not write the current metadata")
	}
}

// "Começar do zero" (D100) and managing the game again with the old staging
// and ArchiveStore (D145): the folders are adopted only with the user's
// consent, and every mod folder comes back as a mod, with its metadata when
// it has a valid one and with the folder name when not.
func TestRecoverModsFromStagingAfterStartingOver(t *testing.T) {
	old := newEnvWith(t, envOptions{generic: true})
	ids := old.installFiles(map[string][]string{
		"Alpha": {"a.txt", "a", "sub/deep.txt", "d"},
		"Beta":  {"b.txt", "b"},
	}, "Alpha", "Beta")
	alpha, beta := ids[0], ids[1]
	cat, err := old.lib.SaveCategory(ctx, old.inst.ID, library.CategoryInput{Name: "Armour"})
	if err != nil {
		t.Fatal(err)
	}
	child, err := old.lib.SaveCategory(ctx, old.inst.ID, library.CategoryInput{Name: "Heavy", Parent: cat})
	if err != nil {
		t.Fatal(err)
	}
	if err := old.lib.SetCategory(ctx, old.inst.ID, []mod.ID{alpha}, child); err != nil {
		t.Fatal(err)
	}
	if err := old.lib.SetAttributes(ctx, alpha, library.AttributesInput{Name: "Alpha Plus", Version: "3", Author: "me", Tags: []string{"x"}}); err != nil {
		t.Fatal(err)
	}
	if err := old.prof.SetModsEnabled(ctx, old.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	oldFiles := len(old.files(alpha))
	staging, archives := old.inst.Staging, old.inst.ArchiveStore
	// A folder copied by hand (no metadata) and one with a broken file.
	old.write(filepath.Join(staging, "hand-made", "h.txt"), "h")
	old.write(filepath.Join(staging, "hand-made", "sub", "i.txt"), "i")
	old.write(filepath.Join(staging, "broken", "k.txt"), "k")
	old.write(filepath.Join(staging, "broken", game.ModMetadataFile), `{"formatVersion": 1, "modId": "bro`)
	// Hidden and temporary names are never mods.
	old.write(filepath.Join(staging, ".tmp", "op", "t.txt"), "t")
	old.write(filepath.Join(staging, "x.installing", "t.txt"), "t")

	setup := func(dir string, adopt bool, backups string) games.Setup {
		return games.Setup{
			Game: generic.GameID, Name: "Recovered", Root: filepath.Join(dir, "Game"), Method: game.MethodCopy,
			Targets: genericTargets(nil), AdoptFolders: adopt,
			Folders: games.Folders{Staging: staging, ArchiveStore: archives, BackupStore: backups},
		}
	}

	// A new database (a second environment over the same folders).
	probe := newEnvWith(t, envOptions{dir: t.TempDir(), generic: true})
	v, err := probe.games.Verify(ctx, setup(old.dir, false, filepath.Join(old.dir, "mo", "backups")))
	if err != nil {
		t.Fatal(err)
	}
	orphanWarnings := 0
	for _, w := range v.Warnings {
		if w.Code == games.CodeFolderOrphan {
			orphanWarnings++
		}
	}
	if orphanWarnings != 2 {
		t.Fatalf("staging and archives of a gone instance are warnings: %+v", v.Warnings)
	}
	// The old BackupStore is never adopted.
	if len(v.Problems) != 1 || v.Problems[0].Code != games.CodeFolderForeign || v.Problems[0].Params["reason"] != "other_instance" {
		t.Fatalf("old backups: %+v", v.Problems)
	}
	_, err = probe.games.Manage(ctx, setup(old.dir, false, filepath.Join(old.dir, "mo", "backups-new")))
	if coded(err) != games.CodeStagingForeign {
		t.Fatalf("managing without consent: %v", err)
	}
	var ge interface{ Params() map[string]string }
	if !errors.As(err, &ge) || ge.Params()["reason"] != "orphan" {
		t.Fatalf("refusal reason: %v", err)
	}

	e := newEnvWith(t, envOptions{dir: old.dir, setup: func(dir string) games.Setup {
		return setup(dir, true, filepath.Join(dir, "mo", "backups-new"))
	}})
	if e.inst.Staging != staging {
		t.Fatalf("staging = %s", e.inst.Staging)
	}
	it, ok := e.problem(diagnostic.CodeStagingOrphanFolders)
	if !ok || it.Params["count"] != "4" || it.Params["metadata"] != "2" {
		t.Fatalf("orphan folders: %+v %v", it, ok)
	}
	if _, err := e.diag.Execute(ctx, e.inst.ID, it.Key, diagsvc.ActionRecoverOrphans, 0); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.problem(diagnostic.CodeStagingOrphanFolders); ok {
		t.Fatal("orphans stay after recovery")
	}

	if n := len(e.rows()); n != 4 {
		t.Fatalf("recovered %d mods: %+v", n, e.rows())
	}
	a := e.row(alpha)
	if a.Name != "Alpha Plus" || a.DetectedName != "Alpha" || a.Version != "3" || a.Author != "me" || a.Files != oldFiles ||
		!slices.Equal(a.CategoryPath, []string{"Armour", "Heavy"}) || a.Enabled || !slices.Equal(a.Tags, []string{"x"}) {
		t.Fatalf("alpha: %+v", a)
	}
	if r := e.row(beta); r.Name != "Beta" || r.Enabled {
		t.Fatalf("beta: %+v", r)
	}
	for name, files := range map[string]int{"hand-made": 2, "broken": 1} {
		r := e.row(mod.ID(name))
		if r.Name != name || r.Files != files || r.Enabled || r.Type != game.DefaultModType {
			t.Fatalf("%s: %+v", name, r)
		}
	}
	// The metadata now names the new instance.
	if md := e.metadata(alpha); md.Instance != e.inst.ID {
		t.Fatalf("metadata instance = %s", md.Instance)
	}
	if md := e.metadata("hand-made"); md.Name != "hand-made" {
		t.Fatalf("metadata of a folder without one: %+v", md)
	}

	// The archive is still in the adopted ArchiveStore: reinstall works.
	ops, err := e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{alpha})
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if op := e.op(ops[0]); op.Status != operation.StatusSucceeded {
		t.Fatalf("reinstall of a recovered mod: %+v", op)
	}

	// Recovered mods deploy like any other.
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{alpha, beta}, true); err != nil {
		t.Fatal(err)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
}
