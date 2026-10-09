package integration_test

import (
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
)

// F14: kill the process at random points of the library and maintenance
// operations (import, reinstall, move staging, move ArchiveStore). After a
// restart runs the startup recovery, the library is consistent
// (INV-LIB-01, INV-OPS-03), no temporary work is left, deploy works, and
// purge gives the original game back (nothing unmanaged lost).

const envMaintKind = "MO_KILL_MAINT"

// maintKinds are the interrupted scenarios; each runs from the same
// committed starting point.
var maintKinds = []string{"import", "reinstall", "move_staging", "move_archives"}

var maintMods = map[string][]string{
	"Alpha": {"textures/shared.dds", "alpha", "Alpha.esp", "alpha plugin"},
	"Bravo": {"textures/shared.dds", "bravo", "meshes/bravo/b.nif", "b"},
	"Golf":  {"textures/golf/g.dds", "g", "Golf.esp", "golf plugin", "meshes/golf/a.nif", "a", "meshes/golf/b.nif", "b"},
}

// maintScenario: two mods installed and deployed with hardlinks, a user
// file in the game.
func maintScenario(t *testing.T, dir string, o envOptions) (*env, map[string]string) {
	t.Helper()
	o.dir, o.dbPath, o.method = dir, filepath.Join(dir, "state.db"), game.MethodHardlink
	e := newEnvWith(t, o)
	e.write(e.data("user.ini"), "mine")
	original := snapshot(t, e.inst.Root)
	e.installFiles(maintMods, "Alpha", "Bravo")
	e.zipFile("Golf.zip", maintMods["Golf"]...)
	if op := e.deploy(deploysvc.KindDeploy); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op.Error)
	}
	return e, original
}

// runMaint runs one scenario to its end (or to the kill).
func runMaint(t *testing.T, e *env, kind string) {
	t.Helper()
	var op operation.ID
	var err error
	switch kind {
	case "import":
		var ids []operation.ID
		ids, err = e.lib.ImportFiles(ctx, e.inst.ID, []string{filepath.Join(e.dir, "downloads", "Golf.zip")})
		if len(ids) > 0 {
			op = ids[0]
		}
		e.lib.Wait()
	case "reinstall":
		var ids []operation.ID
		ids, err = e.lib.ReinstallMods(ctx, e.inst.ID, []mod.ID{modNamed(t, e, "Alpha")})
		if len(ids) > 0 {
			op = ids[0]
		}
		e.lib.Wait()
	case "move_staging":
		op, err = e.dep.MoveStaging(ctx, e.inst.ID, filepath.Join(e.dir, "mo", "staging2"))
		e.dep.Wait()
	case "move_archives":
		op, err = e.dep.MoveArchiveStore(ctx, e.inst.ID, filepath.Join(e.dir, "mo", "archives2"))
		e.dep.Wait()
	}
	if err != nil {
		t.Fatal(err)
	}
	if o := e.op(op); o.Status != operation.StatusSucceeded {
		t.Fatalf("%s: %s %+v", kind, o.Status, o.Error)
	}
}

func modState(r *env, name string) mod.State {
	for _, row := range r.rows() {
		if row.Name == name {
			return row.State
		}
	}
	return ""
}

func modNamed(t *testing.T, e *env, name string) mod.ID {
	t.Helper()
	for _, r := range e.rows() {
		if r.Name == name {
			return r.ID
		}
	}
	t.Fatalf("no mod %s", name)
	return ""
}

// TestMaintKillHelper is the child process of TestKillDuringMaintenance.
func TestMaintKillHelper(t *testing.T) {
	dir := os.Getenv(envKillDir)
	if dir == "" || os.Getenv(envMaintKind) == "" {
		t.Skip("child process of TestKillDuringMaintenance")
	}
	after, _ := strconv.ParseInt(os.Getenv(envKillAfter), 10, 64)
	e := newEnvWith(t, envOptions{dir: dir, dbPath: filepath.Join(dir, "state.db"), existing: true,
		fs: func(f ports.FileSystem) ports.FileSystem {
			return &countingFS{FileSystem: f, onWrite: func(n int64) {
				if n == after {
					os.Exit(3)
				}
			}}
		}})
	runMaint(t, e, os.Getenv(envMaintKind))
}

func TestKillDuringMaintenance(t *testing.T) {
	if os.Getenv(envKillDir) != "" {
		t.Skip("running as the child")
	}
	seed := uint64(time.Now().UnixNano())
	if s := os.Getenv("MO_KILL_SEED"); s != "" {
		seed, _ = strconv.ParseUint(s, 10, 64)
	}
	t.Logf("seed %d (set MO_KILL_SEED to repeat)", seed)
	rng := rand.New(rand.NewPCG(seed, 2))
	perKind := 6
	if testing.Short() {
		perKind = 2
	}
	for _, kind := range maintKinds {
		writes := measureMaintWrites(t, kind)
		t.Logf("%s: %d writes", kind, writes)
		// The first and the last write are always tried; the rest at random.
		points := []int64{1, writes}
		for len(points) < perKind {
			points = append(points, 1+rng.Int64N(writes))
		}
		if os.Getenv("MO_KILL_ALL") != "" { // every write, for the F14 report
			points = points[:0]
			for n := int64(1); n <= writes; n++ {
				points = append(points, n)
			}
		}
		for _, after := range points {
			t.Run(kind+"/after-"+strconv.FormatInt(after, 10), func(t *testing.T) {
				killMaintAndRecover(t, kind, after)
			})
		}
	}
}

func measureMaintWrites(t *testing.T, kind string) int64 {
	t.Helper()
	var counter *countingFS
	e, _ := maintScenario(t, t.TempDir(), envOptions{fs: func(f ports.FileSystem) ports.FileSystem {
		counter = &countingFS{FileSystem: f}
		return counter
	}})
	start := counter.writes.Load()
	runMaint(t, e, kind)
	n := counter.writes.Load() - start
	if n < 2 {
		t.Fatalf("%s wrote only %d times", kind, n)
	}
	return n
}

func killMaintAndRecover(t *testing.T, kind string, after int64) {
	dir := t.TempDir()
	e, original := maintScenario(t, dir, envOptions{})
	e.auto.Close()
	e.dep.Wait()
	e.lib.Wait()
	_ = e.db.Close()

	cmd := exec.Command(os.Args[0], "-test.run=^TestMaintKillHelper$", "-test.count=1")
	cmd.Env = append(os.Environ(), envKillDir+"="+dir, envKillAfter+"="+strconv.FormatInt(after, 10), envMaintKind+"="+kind)
	out, err := cmd.CombinedOutput()
	killed := false
	if err != nil {
		var exit *exec.ExitError
		if !errorsAs(err, &exit) || exit.ExitCode() != 3 {
			t.Fatalf("child: %v\n%s", err, out)
		}
		killed = true
	}
	if !killed && after != 1 {
		t.Logf("the child finished before write %d", after)
	}

	r := newEnvWith(t, envOptions{dir: dir, dbPath: filepath.Join(dir, "state.db"), existing: true})
	recoverLikeStartup(t, r)
	assertLibraryConsistent(t, r)

	// The maintenance can be repeated, or was already done.
	switch kind {
	case "import":
		switch rows := r.rows(); {
		case len(rows) == 2: // killed before the mod existed
			runMaint(t, r, kind)
		case modState(r, "Golf") == mod.StateImported: // archive kept, install undone (core/02 §11)
			ids, err := r.lib.InstallMods(ctx, r.inst.ID, []mod.ID{modNamed(t, r, "Golf")})
			if err != nil {
				t.Fatal(err)
			}
			r.lib.Wait()
			if o := r.op(ids[0]); o.Status != operation.StatusSucceeded {
				t.Fatalf("install: %+v", o.Error)
			}
		}
		if len(r.rows()) != 3 {
			t.Fatalf("mods after import = %+v", r.rows())
		}
	case "reinstall":
		runMaint(t, r, kind)
	}
	assertLibraryConsistent(t, r)
	if o := r.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy after recovery: %+v", o.Error)
	}
	for _, rel := range []string{"Alpha.esp", "meshes/bravo/b.nif", "user.ini"} {
		if _, err := os.Stat(r.data(rel)); err != nil {
			t.Fatalf("%s after deploy: %v", rel, err)
		}
	}
	if o := r.deploy(deploysvc.KindPurge); o.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", o.Error)
	}
	if d := diffSnapshots(original, snapshot(t, r.inst.Root)); len(d) != 0 {
		t.Fatalf("original game changed: %v", d)
	}
}

// recoverLikeStartup runs what bootstrap.New runs before accepting
// commands.
func recoverLikeStartup(t *testing.T, r *env) {
	t.Helper()
	if _, err := r.ops.RecoverInterrupted(ctx); err != nil {
		t.Fatal(err)
	}
	if err := r.lib.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	if err := r.dep.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	inst, err := sqlite.NewGameInstanceRepository(r.db).Get(ctx, r.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	r.inst = inst
	if ids, _ := r.dep.Interrupted(ctx); len(ids) > 0 {
		op, err := r.dep.Reconcile(ctx, r.inst.ID)
		if err != nil {
			t.Fatal(err)
		}
		r.dep.Wait()
		if o := r.op(op); o.Status != operation.StatusSucceeded {
			t.Fatalf("reconcile: %+v", o.Error)
		}
	}
}

// assertLibraryConsistent: no operation is running or pending
// (INV-OPS-03); every installed mod has all its files in the staging
// (INV-LIB-01); no mod is half installed; no temporary work is left.
func assertLibraryConsistent(t *testing.T, r *env) {
	t.Helper()
	recent, err := r.ops.Recent(ctx, 500)
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range recent {
		if o.Status == operation.StatusRunning || o.Status == operation.StatusPending {
			t.Fatalf("operation %s %s is still %s", o.Kind, o.ID, o.Status)
		}
	}
	for _, row := range r.rows() {
		if row.State == mod.StateImported {
			continue // no Installation: nothing in the staging
		}
		if row.State != mod.StateInstalled {
			t.Fatalf("mod %s is %s", row.Name, row.State)
		}
		page, err := r.lib.Files(ctx, row.ID, "", 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Files) == 0 {
			t.Fatalf("mod %s has no files", row.Name)
		}
		for _, f := range page.Files {
			if _, err := os.Stat(r.staged(row.ID, f.Path)); err != nil {
				t.Fatalf("mod %s: %s missing from the staging %s", row.Name, f.Path, r.inst.Staging)
			}
		}
	}
	for _, root := range []string{r.inst.Staging, r.inst.ArchiveStore} {
		entries, err := os.ReadDir(root)
		if err != nil {
			t.Fatalf("%s: %v", root, err)
		}
		for _, e := range entries {
			n := e.Name()
			if n == ".tmp" || strings.HasSuffix(n, ".installing") || strings.HasSuffix(n, ".replaced") || strings.HasSuffix(n, ".partial") {
				t.Fatalf("temporary work left: %s", filepath.Join(root, n))
			}
		}
	}
	// The other place of an interrupted move is gone.
	for _, other := range []string{filepath.Join(r.dir, "mo", "staging"), filepath.Join(r.dir, "mo", "staging2"),
		filepath.Join(r.dir, "mo", "archives"), filepath.Join(r.dir, "mo", "archives2")} {
		if game.SamePath(other, r.inst.Staging) || game.SamePath(other, r.inst.ArchiveStore) {
			continue
		}
		if _, err := os.Stat(other); err == nil {
			t.Fatalf("leftover folder of an interrupted move: %s", other)
		}
	}
}
