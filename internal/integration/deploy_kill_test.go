package integration_test

import (
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
)

// killMods cover every action of a plan: removal with restore of an
// original (Bravo off), backup of an original (Delta on), replacement
// (shared.dds changes winner), new folders and removal of folders (Echo
// off, Delta on).
var killMods = map[string][]string{
	"Alpha":   {"textures/shared.dds", "alpha", "Alpha.esp", "alpha plugin"},
	"Bravo":   {"textures/shared.dds", "bravo", "Skyrim.esm", "patched esm"},
	"Charlie": {"meshes/charlie/c.nif", "c", "meshes/charlie/d.nif", "d"},
	"Delta":   {"Update.esm", "patched update", "textures/delta/x.dds", "x", "textures/shared.dds", "delta"},
	"Echo":    {"scripts/echo/e.pex", "e"},
}

const (
	envKillDir   = "MO_KILL_DIR"
	envKillAfter = "MO_KILL_AFTER"
	envKillKind  = "MO_KILL_KIND"
)

// killScenario prepares a game with a first deploy done and a second
// desired state that exercises every action. It returns the snapshot of
// the untouched game and the mod ids by name.
func killScenario(t *testing.T, dir string, o envOptions) (*env, map[string]string, map[string]mod.ID) {
	t.Helper()
	o.dir, o.dbPath, o.method = dir, filepath.Join(dir, "state.db"), game.MethodHardlink
	e := newEnvWith(t, o)
	e.write(e.data("Update.esm"), "update")
	e.write(e.data("user.ini"), "mine")
	original := snapshot(t, e.inst.Root)
	names := []string{"Alpha", "Bravo", "Charlie", "Delta", "Echo"}
	ids := e.installFiles(killMods, names...)
	byName := map[string]mod.ID{}
	for i, n := range names {
		byName[n] = ids[i]
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{byName["Delta"]}, false); err != nil {
		t.Fatal(err)
	}
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("first deploy: %+v", o.Error)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{byName["Bravo"], byName["Echo"]}, false); err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{byName["Delta"]}, true); err != nil {
		t.Fatal(err)
	}
	return e, original, byName
}

// TestDeployKillHelper is the child process of TestKillDuringDeploy: it
// runs one deploy or purge over the shared database and dies right after
// its n-th write to disk, without running any deferred code.
func TestDeployKillHelper(t *testing.T) {
	dir := os.Getenv(envKillDir)
	if dir == "" {
		t.Skip("child process of TestKillDuringDeploy")
	}
	after, _ := strconv.ParseInt(os.Getenv(envKillAfter), 10, 64)
	e := newEnvWith(t, envOptions{dir: dir, dbPath: filepath.Join(dir, "state.db"), existing: true,
		fs: func(f ports.FileSystem) ports.FileSystem {
			return &countingFS{FileSystem: f, onWrite: func(n int64) {
				if n == after {
					os.Exit(3) // the process dies: no defer, no commit, no cleanup
				}
			}}
		}})
	kind := operation.Kind(os.Getenv(envKillKind))
	if _, err := e.dep.RunSync(ctx, e.inst.ID, kind); err != nil {
		t.Fatal(err)
	}
}

// core/04 §14: kill the process in the middle of apply at 20 random points;
// after reopening and reconciling, observed = desired and no unmanaged file
// was lost (INV-DEP-01/02/05, D035).
func TestKillDuringDeploy(t *testing.T) {
	if os.Getenv(envKillDir) != "" {
		t.Skip("running as the child")
	}
	seed := uint64(time.Now().UnixNano())
	if s := os.Getenv("MO_KILL_SEED"); s != "" {
		seed, _ = strconv.ParseUint(s, 10, 64)
	}
	t.Logf("seed %d (set MO_KILL_SEED to repeat)", seed)
	rng := rand.New(rand.NewPCG(seed, 1))

	writes := map[operation.Kind]int64{}
	for _, kind := range []operation.Kind{deploysvc.KindDeploy, deploysvc.KindPurge} {
		writes[kind] = measureWrites(t, kind)
	}
	points := 0
	for _, kind := range []operation.Kind{deploysvc.KindDeploy, deploysvc.KindPurge} {
		n := 14
		if kind == deploysvc.KindPurge {
			n = 6
		}
		for range n {
			after := 1 + rng.Int64N(writes[kind])
			points++
			t.Run(string(kind)+"/after-"+strconv.FormatInt(after, 10), func(t *testing.T) {
				killAndRecover(t, kind, after)
			})
		}
	}
	if points != 20 {
		t.Fatalf("%d kill points", points)
	}
}

// measureWrites counts the disk writes of the operation in a scenario run
// to completion, so kill points cover the whole apply.
func measureWrites(t *testing.T, kind operation.Kind) int64 {
	t.Helper()
	var counter *countingFS
	e, _, _ := killScenario(t, t.TempDir(), envOptions{fs: func(f ports.FileSystem) ports.FileSystem {
		counter = &countingFS{FileSystem: f}
		return counter
	}})
	if kind == deploysvc.KindPurge {
		e.deploy(deploysvc.KindDeploy)
	}
	start := counter.writes.Load()
	if o := e.deploy(kind); o.Status != operation.StatusSucceeded {
		t.Fatalf("%s: %+v", kind, o.Error)
	}
	n := counter.writes.Load() - start
	if n < 8 {
		t.Fatalf("%s wrote only %d times", kind, n)
	}
	return n
}

func killAndRecover(t *testing.T, kind operation.Kind, after int64) {
	dir := t.TempDir()
	e, original, ids := killScenario(t, dir, envOptions{})
	if kind == deploysvc.KindPurge {
		e.deploy(deploysvc.KindDeploy)
	}
	// Release the database so only the child writes to it.
	e.auto.Close()
	e.dep.Wait()
	_ = e.db.Close()

	cmd := exec.Command(os.Args[0], "-test.run=^TestDeployKillHelper$", "-test.count=1")
	cmd.Env = append(os.Environ(), envKillDir+"="+dir, envKillAfter+"="+strconv.FormatInt(after, 10), envKillKind+"="+string(kind))
	out, err := cmd.CombinedOutput()
	if err != nil {
		var exit *exec.ExitError
		if !errorsAs(err, &exit) || exit.ExitCode() != 3 {
			t.Fatalf("child: %v\n%s", err, out)
		}
	}

	// Reopen as a new process would.
	r := newEnvWith(t, envOptions{dir: dir, dbPath: filepath.Join(dir, "state.db"), existing: true})
	interrupted, err := r.dep.Interrupted(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(interrupted, r.inst.ID) {
		if v := r.status(); v.Status.Kind != deploystate.Unknown || v.Status.Reason != deploystate.ReasonJournalPending {
			t.Fatalf("interrupted status = %+v", v.Status)
		}
		if _, err := r.dep.Deploy(ctx, r.inst.ID); codeOf(err) != deploysvc.CodeInterrupted {
			t.Fatalf("deploy before reconciling: %v", err)
		}
		op, err := r.dep.Reconcile(ctx, r.inst.ID)
		if err != nil {
			t.Fatal(err)
		}
		r.dep.Wait()
		if o := r.op(op); o.Status != operation.StatusSucceeded {
			t.Fatalf("reconcile: %s %+v", o.Status, o.Error)
		}
	} else if after <= 2 {
		t.Logf("killed before the journal (write %d)", after)
	}
	assertNoTemp(t, r.inst.Root)

	if kind == deploysvc.KindPurge {
		if v := r.status(); v.Status.Kind == deploystate.Unknown {
			t.Fatalf("status after reconcile = %+v", v.Status)
		}
		// Finish the purge if the kill came before its journal.
		if h, err := sqliteHeader(r); err == nil && h.Entries > 0 {
			r.deploy(deploysvc.KindPurge)
		}
		if d := diffSnapshots(original, snapshot(t, r.inst.Root)); len(d) != 0 {
			t.Fatalf("purge after a kill must give the original game back: %v", d)
		}
		return
	}
	if o := r.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy after recovery: %+v", o.Error)
	}
	r.wantStatus(deploystate.InSync)
	assertDesired(t, r, ids)
	// And nothing unmanaged was lost: purge gives the original game back.
	if o := r.deploy(deploysvc.KindPurge); o.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", o.Error)
	}
	if d := diffSnapshots(original, snapshot(t, r.inst.Root)); len(d) != 0 {
		t.Fatalf("original game changed: %v", d)
	}
}

func assertDesired(t *testing.T, r *env, ids map[string]mod.ID) {
	t.Helper()
	want := map[string]string{
		"Alpha.esp":            "Alpha",
		"textures/shared.dds":  "Delta",
		"Update.esm":           "Delta",
		"textures/delta/x.dds": "Delta",
		"meshes/charlie/c.nif": "Charlie",
		"meshes/charlie/d.nif": "Charlie",
	}
	for rel, m := range want {
		if fileID(t, r.data(rel)) != fileID(t, r.staged(ids[m], rel)) {
			t.Fatalf("%s is not %s's file", rel, m)
		}
	}
	if readFile(t, r.data("Skyrim.esm")) != "esm" || readFile(t, r.data("user.ini")) != "mine" {
		t.Fatal("originals and unmanaged files are where they were")
	}
	if readFile(t, filepath.Join(r.inst.BackupStore, "data", "Update.esm")) != "update" {
		t.Fatal("the replaced original is in the BackupStore")
	}
	if _, err := os.Stat(r.data("scripts")); !os.IsNotExist(err) {
		t.Fatal("folders the manager created are gone when empty")
	}
}

func assertNoTemp(t *testing.T, root string) {
	t.Helper()
	for p := range snapshot(t, root) {
		if strings.Contains(p, ".modorchestrator-tmp") {
			t.Fatalf("temporary file left in the game: %s", p)
		}
	}
}

func errorsAs(err error, target **exec.ExitError) bool {
	e, ok := err.(*exec.ExitError)
	if ok {
		*target = e
	}
	return ok
}

func sqliteHeader(r *env) (deployment.Header, error) {
	return sqlite.NewManifestRepository(r.db).Header(ctx, r.inst.ID)
}
