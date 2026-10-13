package integration_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"modorchestrator/internal/adapters/valheim"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/filesystem"
	"modorchestrator/internal/infrastructure/stores"
)

// snapshot lists every file below root with its size.
func folderSnapshot(t *testing.T, root string) []string {
	t.Helper()
	var out []string
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, p)
		if d.IsDir() {
			out = append(out, filepath.ToSlash(rel)+"/")
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		out = append(out, filepath.ToSlash(rel)+" "+info.ModTime().UTC().Format("20060102T150405")+" "+strconv.FormatInt(info.Size(), 10))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(out)
	return out
}

// TestE2EValheimRealInstallation runs the second game (D114) against a real
// installation: it is found through the store, managed, a real mod package
// is imported and deployed into the game folder, the framework check
// answers, and a purge leaves the game folder exactly as it was. The state
// database and the manager's folders are temporary; nothing of the app's
// own data is touched.
//
// It writes into the game folder, so it only runs when asked:
//
//	MO_E2E_VALHEIM_PACKAGE=<folder or archive of a mod package> go test ./internal/integration -run E2EValheim -v
func TestE2EValheimRealInstallation(t *testing.T) {
	pkg := os.Getenv("MO_E2E_VALHEIM_PACKAGE")
	if pkg == "" {
		t.Skip("set MO_E2E_VALHEIM_PACKAGE to run against a real installation")
	}

	// 1. Discovery: the store scanner finds the installation and the
	// definition recognises it (D113).
	fsys := filesystem.New()
	found, err := (&stores.Scanner{FS: fsys, Reg: stores.NewRegistry(), Env: os.Getenv}).Scan(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	def := valheim.Adapter{}.Definitions()[0]
	root := ""
	for _, in := range found {
		if def.Discovery.Matches(in.Store, in.AppID) {
			root = in.Path
			t.Logf("found in %s: %s", in.Store, in.Path)
		}
	}
	if root == "" {
		t.Fatalf("the game was not found among %d store installations", len(found))
	}
	before := folderSnapshot(t, root)
	t.Logf("game folder before: %d entries", len(before))

	// 2. Manage: a temporary database, the manager's folders in a temporary
	// folder of the same volume when possible.
	work := t.TempDir()
	method := game.MethodCopy
	if same, err := fsys.SameVolume(ctx, work, root); err == nil && same {
		method = game.MethodHardlink
	}
	e := newEnvWith(t, envOptions{
		dir: work, method: method, adapters: []ports.GameAdapter{valheim.Adapter{}},
		setup: func(dir string) games.Setup {
			return games.Setup{
				Game: valheim.GameID, Root: root, Method: method,
				Folders: games.Folders{
					Staging: filepath.Join(dir, "mo", "staging"), ArchiveStore: filepath.Join(dir, "mo", "archives"),
					BackupStore: filepath.Join(dir, "mo", "backups"),
				},
			}
		},
	})
	t.Logf("managed as %s, method %s", e.inst.ID, method)
	if got := folderSnapshot(t, root); !slices.Equal(got, before) {
		t.Fatalf("managing the game changed its folder")
	}
	// Whatever happens next, the game folder is given back.
	purged := false
	t.Cleanup(func() {
		if purged {
			return
		}
		if _, err := e.dep.RunSync(ctx, e.inst.ID, "purge"); err != nil && !strings.Contains(err.Error(), "nothing_to_purge") {
			t.Errorf("CLEANUP PURGE FAILED, the game folder may hold deployed files: %v", err)
		}
	})
	w, err := e.games.Workspace(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(w.Items, games.ItemPlugins) || slices.Contains(w.Items, games.ItemLoadOrder) {
		t.Fatalf("workspace %v", w.Items)
	}
	t.Logf("workspace: %v", w.Items)

	// 3. Import a real package and deploy it.
	ops := e.importAndWait(pkg)
	for _, id := range ops {
		if op := e.op(id); op.Status != operation.StatusSucceeded {
			t.Fatalf("import: %+v", op)
		}
	}
	row := e.only()
	t.Logf("installed %q: type %s, %d files, content %v", row.Name, row.Type, row.Files, row.Content)
	// The name comes from the package manifest, not from the imported folder
	// (D118).
	if row.Name == filepath.Base(pkg) {
		t.Errorf("the mod is named after the imported folder: %q", row.Name)
	}
	if row.Type != game.DefaultModType || !slices.Contains(row.Content, valheim.FlagPlugin) {
		t.Fatalf("mod row %+v", row)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{row.ID}, true); err != nil {
		t.Fatal(err)
	}
	plan, err := e.dep.Preview(ctx, e.inst.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("plan: %+v; %d changes, %d blocked, %d fallbacks, %d generated", plan.Summary, plan.ChangeCount, plan.BlockedCount, len(plan.Fallbacks), plan.NewFileCount)
	for _, b := range plan.Blocked {
		t.Logf("blocked: %s (%s)", b.Location, b.Reason)
	}
	for _, f := range plan.Fallbacks {
		t.Logf("fallback: target %s, %s -> %s, %d files", f.Target, f.From, f.To, f.Count)
	}
	for _, c := range plan.Changes {
		t.Logf("change: %s %s", c.Kind, c.Location)
	}
	// Nothing is decided on the user's behalf in a real game folder: a plan
	// that needs a decision stops the test with nothing written.
	if plan.ChangeCount > 0 || plan.BlockedCount > 0 || len(plan.Fallbacks) > 0 {
		t.Fatalf("the deploy needs a decision; nothing was written")
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	var deployed []string
	for _, l := range folderSnapshot(t, root) {
		if !slices.Contains(before, l) {
			deployed = append(deployed, l)
		}
	}
	t.Logf("deployed into the game folder:\n  %s", strings.Join(deployed, "\n  "))
	dll := false
	for _, l := range deployed {
		low := strings.ToLower(l)
		if !strings.HasPrefix(low, "bepinex/") {
			t.Errorf("deployed outside the framework folder: %s", l)
		}
		dll = dll || (strings.HasPrefix(low, "bepinex/plugins/") && strings.Contains(low, ".dll "))
	}
	if !dll {
		t.Fatalf("no DLL below BepInEx/plugins")
	}

	// 4. The framework check answers for this installation.
	diags, _, err := e.diag.Evaluate(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	preloader, _ := os.Stat(filepath.Join(root, "BepInEx", "core", "BepInEx.Preloader.dll"))
	missing := slices.ContainsFunc(diags, func(d diagnostic.Diagnostic) bool { return d.Code == diagnostic.CodeFrameworkMissing })
	for _, d := range diags {
		t.Logf("diagnostic: %s %s %v", d.Severity, d.Code, d.Params)
	}
	if missing == (preloader != nil) {
		t.Fatalf("framework_missing = %v with preloader present = %v", missing, preloader != nil)
	}

	// 5. Purge: the game folder is exactly what it was.
	if op := e.deploy("purge"); op.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", op)
	}
	purged = true
	after := folderSnapshot(t, root)
	if !slices.Equal(after, before) {
		for _, l := range after {
			if !slices.Contains(before, l) {
				t.Errorf("left behind: %s", l)
			}
		}
		for _, l := range before {
			if !slices.Contains(after, l) {
				t.Errorf("missing after purge: %s", l)
			}
		}
		t.Fatal("the game folder is not what it was")
	}
	t.Logf("game folder after purge: %d entries, identical", len(after))
}
