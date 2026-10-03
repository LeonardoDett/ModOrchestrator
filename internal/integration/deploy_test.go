package integration_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/infrastructure/filesystem"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
)

// countingFS counts the writes the engine makes, to prove that a run wrote
// nothing (INV-DEP-06) or to stop the process after the n-th write.
type countingFS struct {
	ports.FileSystem
	writes atomic.Int64
	// onWrite runs after every successful write with its number.
	onWrite func(n int64)
}

func (c *countingFS) did(err error) error {
	if err == nil {
		n := c.writes.Add(1)
		if c.onWrite != nil {
			c.onWrite(n)
		}
	}
	return err
}

func (c *countingFS) MkdirAll(ctx context.Context, p string) error {
	return c.did(c.FileSystem.MkdirAll(ctx, p))
}
func (c *countingFS) WriteFile(ctx context.Context, p string, d []byte) error {
	return c.did(c.FileSystem.WriteFile(ctx, p, d))
}
func (c *countingFS) Hardlink(ctx context.Context, a, b string) error {
	return c.did(c.FileSystem.Hardlink(ctx, a, b))
}
func (c *countingFS) Symlink(ctx context.Context, a, b string) error {
	return c.did(c.FileSystem.Symlink(ctx, a, b))
}
func (c *countingFS) Copy(ctx context.Context, a, b string) error {
	return c.did(c.FileSystem.Copy(ctx, a, b))
}
func (c *countingFS) Rename(ctx context.Context, a, b string) error {
	return c.did(c.FileSystem.Rename(ctx, a, b))
}
func (c *countingFS) Remove(ctx context.Context, p string) error {
	return c.did(c.FileSystem.Remove(ctx, p))
}
func (c *countingFS) RemoveEmptyDir(ctx context.Context, p string) error {
	return c.did(c.FileSystem.RemoveEmptyDir(ctx, p))
}

// deployMods are the mods of the deploy scenarios: A and B fight over a
// texture, B replaces a file of the base game, C has a folder of its own.
var deployMods = map[string][]string{
	"Alpha":   {"textures/shared.dds", "alpha", "Alpha.esp", "alpha plugin"},
	"Bravo":   {"textures/shared.dds", "bravo", "Skyrim.esm", "patched esm"},
	"Charlie": {"meshes/charlie/c.nif", "charlie"},
}

func (e *env) data(rel string) string {
	return filepath.Join(e.inst.Root, "Data", filepath.FromSlash(rel))
}

func (e *env) staged(m mod.ID, rel string) string {
	return filepath.Join(e.inst.Staging, string(m), filepath.FromSlash(rel))
}

func (e *env) deploy(kind operation.Kind) *operation.Operation {
	e.t.Helper()
	id, err := e.dep.RunSync(ctx, e.inst.ID, kind)
	if err != nil {
		e.t.Fatalf("%s: %v", kind, err)
	}
	return e.op(id)
}

func (e *env) status() deploysvc.StatusView {
	e.t.Helper()
	v, err := e.dep.Status(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	return v
}

func (e *env) wantStatus(kind deploystate.Kind) {
	e.t.Helper()
	if v := e.status(); v.Status.Kind != kind {
		e.t.Fatalf("status = %s/%s, want %s", v.Status.Kind, v.Status.Reason, kind)
	}
}

func fileID(t *testing.T, path string) string {
	t.Helper()
	fi, err := filesystem.New().Stat(ctx, path)
	if err != nil || !fi.Exists {
		t.Fatalf("stat %s: %v", path, err)
	}
	return fi.FileID
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// snapshot is the content of every file below root (folders end in "/").
func snapshot(t *testing.T, root string) map[string]string {
	t.Helper()
	out := map[string]string{}
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || p == root {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			out[rel+"/"] = ""
			return nil
		}
		b, _ := os.ReadFile(p)
		out[rel] = string(b)
		return nil
	})
	return out
}

func diffSnapshots(a, b map[string]string) []string {
	var out []string
	for k, v := range a {
		if w, ok := b[k]; !ok || w != v {
			out = append(out, "-"+k)
		}
	}
	for k := range b {
		if _, ok := a[k]; !ok {
			out = append(out, "+"+k)
		}
	}
	sort.Strings(out)
	return out
}

// F7 demonstration: first deploy with a base file preserved, a second deploy
// that does nothing, a diff that touches only what changed, purge back to
// the original game and deploy again to the same state.
func TestDeployPurgeDeploy(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.write(e.data("user.ini"), "mine")
	original := snapshot(t, e.inst.Root)
	ids := e.installFiles(deployMods, "Alpha", "Bravo", "Charlie")
	alpha, bravo, charlie := ids[0], ids[1], ids[2]
	e.wantStatus(deploystate.NeverDeployed)

	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %s %+v", o.Status, o.Error)
	}
	e.wantStatus(deploystate.InSync)
	// Hardlinks to the staging; the higher priority wins the texture.
	if fileID(t, e.data("textures/shared.dds")) != fileID(t, e.staged(bravo, "textures/shared.dds")) {
		t.Fatal("winner is deployed as a hardlink of its staging file")
	}
	if readFile(t, e.data("Skyrim.esm")) != "patched esm" {
		t.Fatal("mod file replaces the base file")
	}
	if got := readFile(t, filepath.Join(e.inst.BackupStore, "data", "Skyrim.esm")); got != "esm" {
		t.Fatalf("original kept in the BackupStore (D034): %q", got)
	}
	if _, err := os.Stat(filepath.Join(e.inst.Root, "Data", game.DeploymentMarker)); err != nil {
		t.Fatal("deployment marker written in the target")
	}
	if readFile(t, e.data("user.ini")) != "mine" {
		t.Fatal("unmanaged file untouched")
	}

	// INV-DEP-04: a second deploy has an empty plan and writes nothing.
	plan, err := e.dep.Preview(ctx, e.inst.ID, false)
	if err != nil || !plan.Empty {
		t.Fatalf("second plan must be empty: %+v %v", plan.Summary, err)
	}
	before := fileID(t, e.data("Alpha.esp"))
	e.deploy(deploysvc.KindDeploy)
	if fileID(t, e.data("Alpha.esp")) != before {
		t.Fatal("unchanged locations are not touched")
	}

	// Disabling one mod removes only its files and the folders it created.
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{charlie}, false); err != nil {
		t.Fatal(err)
	}
	e.wantStatus(deploystate.Pending)
	plan, _ = e.dep.Preview(ctx, e.inst.ID, false)
	if plan.Summary.Remove != 1 || plan.Summary.Create != 0 || plan.Summary.Replace != 0 || plan.Summary.RemoveDir != 2 {
		t.Fatalf("diff plan = %+v", plan.Summary)
	}
	e.deploy(deploysvc.KindDeploy)
	if _, err := os.Stat(e.data("meshes")); !os.IsNotExist(err) {
		t.Fatal("folders created by the manager are removed when empty")
	}
	if fileID(t, e.data("Alpha.esp")) != before {
		t.Fatal("only the changed locations are touched")
	}
	e.wantStatus(deploystate.InSync)
	deployed := snapshot(t, e.inst.Root)

	// Purge restores the original game exactly.
	if o := e.deploy(deploysvc.KindPurge); o.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %s %+v %v", o.Status, o.Error, o.Error.Params)
	}
	if d := diffSnapshots(original, snapshot(t, e.inst.Root)); len(d) != 0 {
		t.Fatalf("purge must bring the game back: %v", d)
	}
	e.wantStatus(deploystate.NeverDeployed)
	if entries, _ := os.ReadDir(e.inst.Staging); len(entries) < 3 {
		t.Fatal("purge never uninstalls mods")
	}

	// INV-DEP-07: deploy after purge restores the state before the purge.
	e.deploy(deploysvc.KindDeploy)
	if d := diffSnapshots(deployed, snapshot(t, e.inst.Root)); len(d) != 0 {
		t.Fatalf("purge then deploy differs: %v", d)
	}
	_ = alpha
}

// INV-EXT-01 / INV-DEP-01: a managed file edited outside is never
// overwritten or deleted without a decision, in deploy and purge; an
// auto-deploy that meets it writes nothing (INV-DEP-06).
func TestExternalChangeKeepsItsLocation(t *testing.T) {
	var counter *countingFS
	e := newEnvWith(t, envOptions{method: game.MethodHardlink, fs: func(f ports.FileSystem) ports.FileSystem {
		counter = &countingFS{FileSystem: f}
		return counter
	}})
	ids := e.installFiles(deployMods, "Alpha", "Bravo")
	e.deploy(deploysvc.KindDeploy)

	// A tool saves Alpha.esp by "write temp + rename": a different file.
	if err := os.Remove(e.data("Alpha.esp")); err != nil {
		t.Fatal(err)
	}
	e.write(e.data("Alpha.esp"), "cleaned by a tool")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[0]}, false); err != nil {
		t.Fatal(err)
	}

	writes := counter.writes.Load()
	id, err := e.dep.AutoDeploy(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(id); o.Status != operation.StatusFailed || o.Error.Code != deploysvc.CodeNeedsDecision {
		t.Fatalf("auto-deploy must stop before deciding: %s %+v", o.Status, o.Error)
	}
	if counter.writes.Load() != writes {
		t.Fatal("auto-deploy wrote although the plan needed a decision (INV-DEP-06)")
	}
	if v := e.status(); v.Status.Kind != deploystate.Blocked || v.Status.Reason != deploystate.ReasonNeedsDecision {
		t.Fatalf("status = %+v", v.Status)
	}

	// The manual deploy stops at await_decision and lists the change.
	op, err := e.dep.Deploy(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	view := e.waitDeployDecision(op)
	if view.ChangeCount != 1 || view.Changes[0].Location.Path.String() != "Alpha.esp" || view.Changes[0].Kind != "replaced" {
		t.Fatalf("decision view = %+v", view)
	}
	if err := e.dep.ResolveDecision(e.inst.ID, op, nil, nil); err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(op); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy with the change left untouched: %s %+v", o.Status, o.Error)
	}
	if readFile(t, e.data("Alpha.esp")) != "cleaned by a tool" {
		t.Fatal("the external file is never overwritten")
	}
	if _, err := os.Stat(e.data("textures/shared.dds")); err != nil {
		t.Fatal("the rest of the plan ran")
	}
	if v := e.status(); v.Status.Kind != deploystate.Blocked || v.Status.Reason != deploystate.ReasonExternalChanges || v.ExternalChanges != 1 {
		t.Fatalf("the untouched change keeps the status blocked: %+v %d", v.Status, v.ExternalChanges)
	}

	// Purge also leaves it where it is.
	op, err = e.dep.Purge(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	e.waitDeployDecision(op)
	if err := e.dep.ResolveDecision(e.inst.ID, op, nil, nil); err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if readFile(t, e.data("Alpha.esp")) != "cleaned by a tool" || readFile(t, e.data("Skyrim.esm")) != "esm" {
		t.Fatal("purge removes ours, restores the original and keeps the external file")
	}
}

func (e *env) waitDeployDecision(op operation.ID) deploysvc.PlanView {
	e.t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if v, ok := e.dep.PendingDecision(e.inst.ID); ok && v.Operation == op {
			return v
		}
		time.Sleep(5 * time.Millisecond)
	}
	e.t.Fatalf("deploy %s never waited for a decision: %+v", op, e.op(op))
	return deploysvc.PlanView{}
}

// INV-DEP-08: another manager's marker blocks the deploy with nothing
// written.
func TestForeignDeploymentBlocksDeploy(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Alpha")
	e.write(e.data("vortex.deployment.json"), "{}")
	o := e.deploy(deploysvc.KindDeploy)
	if o.Status != operation.StatusFailed || o.Error.Code != deploysvc.CodeForeign || o.Error.Params["kind"] != "vortex" {
		t.Fatalf("deploy = %s %+v", o.Status, o.Error)
	}
	if _, err := os.Stat(e.data("Alpha.esp")); !os.IsNotExist(err) {
		t.Fatal("nothing is written while another manager deployed")
	}
	if v := e.status(); v.Status.Kind != deploystate.Blocked || v.Status.Reason != deploystate.ReasonForeignDeployment {
		t.Fatalf("status = %+v", v.Status)
	}
	_ = os.Remove(e.data("vortex.deployment.json"))
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("after removal: %+v", o.Error)
	}
}

// D036: several changes close in time cause one deploy.
func TestAutoDeployCoalesces(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Alpha", "Bravo", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	settingsSvc := e.dep.Settings.(interface {
		SetApp(ctx context.Context, key, value string) error
	})
	if err := settingsSvc.SetApp(ctx, "automation.deployDelayMs", "60000"); err != nil {
		t.Fatal(err)
	}
	e.bus.Subscribe(e.auto.Handle)
	for _, id := range ids {
		if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{id}, false); err != nil {
			t.Fatal(err)
		}
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[0]}, true); err != nil {
		t.Fatal(err)
	}
	e.auto.Flush()
	ops, _ := e.ops.Recent(ctx, 50)
	n := 0
	for _, o := range ops {
		if o.Kind == deploysvc.KindDeploy {
			n++
		}
	}
	if n != 2 { // the manual first deploy and one coalesced auto-deploy
		t.Fatalf("deploy operations = %d", n)
	}
	e.wantStatus(deploystate.InSync)
	if _, err := os.Stat(e.data("Skyrim.esm")); err != nil || readFile(t, e.data("Skyrim.esm")) != "esm" {
		t.Fatal("disabled mod's replacement is undone and the original restored")
	}
	if _, err := os.Stat(e.data("Alpha.esp")); err != nil {
		t.Fatal("re-enabled mod is deployed")
	}
}

// core/04 §5 "Falhas parciais": a file in use fails its location only; the
// manifest reflects reality and the next deploy finishes.
func TestLockedFileFailsOnlyItsLocation(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Alpha", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	// Go opens files without FILE_SHARE_DELETE: removal fails while open.
	h, err := os.Open(e.data("meshes/charlie/c.nif"))
	if err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, false); err != nil {
		t.Fatal(err)
	}
	o := e.deploy(deploysvc.KindDeploy)
	h.Close()
	if o.Status != operation.StatusFailed || o.Error.Code != deploysvc.CodeDeployFailed || o.Error.Params["count"] != "1" ||
		o.Error.Params["first"] != "data:meshes/charlie/c.nif" || o.Error.Params["reason"] != "file_locked" {
		t.Fatalf("deploy = %s %+v", o.Status, o.Error)
	}
	if _, err := os.Stat(e.data("Alpha.esp")); !os.IsNotExist(err) {
		t.Fatal("the other locations were applied")
	}
	v := e.status()
	if v.Status.Kind != deploystate.Failed || len(v.Failures) != 1 {
		t.Fatalf("status = %+v", v)
	}
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("retry: %+v", o.Error)
	}
	if _, err := os.Stat(e.data("meshes")); !os.IsNotExist(err) {
		t.Fatal("retry finished the removal")
	}
	e.wantStatus(deploystate.InSync)
}

// core/04 §10 and §6: moving the staging and changing the method purge,
// do their work and deploy again.
func TestMoveStagingAndChangeMethod(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Alpha", "Bravo")
	e.deploy(deploysvc.KindDeploy)
	old := e.inst.Staging
	to := filepath.Join(e.dir, "mo", "staging2")

	p, err := e.dep.PreviewMoveStaging(ctx, e.inst.ID, to)
	if err != nil || p.Problem != "" || !p.Deployed || !p.SameVolume || p.Bytes == 0 {
		t.Fatalf("preview = %+v %v", p, err)
	}
	if bad, _ := e.dep.PreviewMoveStaging(ctx, e.inst.ID, filepath.Join(e.inst.Root, "Data", "x")); bad.Problem == "" {
		t.Fatal("a staging inside the game is refused (INV-LIB-03)")
	}
	op, err := e.dep.MoveStaging(ctx, e.inst.ID, to)
	if err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(op); o.Status != operation.StatusSucceeded {
		t.Fatalf("move: %s %+v", o.Status, o.Error)
	}
	inst, _ := sqlite.NewGameInstanceRepository(e.db).Get(ctx, e.inst.ID)
	e.inst = inst
	if !game.SamePath(inst.Staging, to) {
		t.Fatalf("staging = %s", inst.Staging)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("old staging removed after the move")
	}
	if fileID(t, e.data("Alpha.esp")) != fileID(t, e.staged(ids[0], "Alpha.esp")) {
		t.Fatal("deployed again from the new staging")
	}
	e.wantStatus(deploystate.InSync)

	methods, _ := e.dep.Methods(ctx, e.inst.ID)
	if !slices.ContainsFunc(methods, func(m deploysvc.MethodStatus) bool { return m.Method == game.MethodCopy && m.Available }) {
		t.Fatalf("methods = %+v", methods)
	}
	op, err = e.dep.ChangeMethod(ctx, e.inst.ID, game.MethodCopy)
	if err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(op); o.Status != operation.StatusSucceeded {
		t.Fatalf("change method: %s %+v", o.Status, o.Error)
	}
	if fileID(t, e.data("Alpha.esp")) == fileID(t, e.staged(ids[0], "Alpha.esp")) || readFile(t, e.data("Alpha.esp")) != "alpha plugin" {
		t.Fatal("files are copies now")
	}
	e.wantStatus(deploystate.InSync)
	if _, err := e.dep.ChangeMethod(ctx, e.inst.ID, game.MethodCopy); codeOf(err) != deploysvc.CodeMethodSame {
		t.Fatalf("same method: %v", err)
	}
}

// A journal left behind blocks deploy until reconciled.
func TestInterruptedJournalBlocksUntilReconciled(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Alpha")
	if _, err := e.dep.Reconcile(ctx, e.inst.ID); codeOf(err) != deploysvc.CodeNoJournal {
		t.Fatalf("nothing to reconcile: %v", err)
	}
	e.deploy(deploysvc.KindDeploy)
	if _, err := e.dep.Purge(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if _, err := e.dep.Purge(ctx, e.inst.ID); codeOf(err) != deploysvc.CodeNothingToPurge {
		t.Fatalf("purge twice: %v", err)
	}
	_ = errors.New
	_ = strings.TrimSpace
}

// core/13 mods.archiveStorePath: changing it moves the retained archives
// (verified copy, instance saved, old folder removed only with its marker);
// the mods keep reinstalling from the new place.
func TestMoveArchiveStore(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Alpha")
	old := e.inst.ArchiveStore
	to := filepath.Join(e.dir, "mo", "archives2")
	p, err := e.dep.PreviewMoveArchives(ctx, e.inst.ID, to)
	if err != nil || p.Problem != "" || p.Bytes == 0 || !p.SameVolume {
		t.Fatalf("preview = %+v %v", p, err)
	}
	if same, _ := e.dep.PreviewMoveArchives(ctx, e.inst.ID, old); same.Problem != deploysvc.CodeArchivesSame {
		t.Fatalf("same folder = %+v", same)
	}
	if bad, _ := e.dep.PreviewMoveArchives(ctx, e.inst.ID, filepath.Join(e.inst.Staging, "x")); bad.Problem == "" {
		t.Fatal("an ArchiveStore inside the staging is refused")
	}
	op, err := e.dep.MoveArchiveStore(ctx, e.inst.ID, to)
	if err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(op); o.Status != operation.StatusSucceeded {
		t.Fatalf("move: %s %+v", o.Status, o.Error)
	}
	inst, _ := sqlite.NewGameInstanceRepository(e.db).Get(ctx, e.inst.ID)
	if !game.SamePath(inst.ArchiveStore, to) {
		t.Fatalf("archive store = %s", inst.ArchiveStore)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("old folder removed")
	}
	if _, err := os.Stat(filepath.Join(to, game.ArchivesMarker)); err != nil {
		t.Fatal("marker of the new folder")
	}
	e.inst = inst
	reinstall, err := e.lib.ReinstallMods(ctx, e.inst.ID, ids)
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	if o := e.op(reinstall[0]); o.Status != operation.StatusSucceeded {
		t.Fatalf("reinstall from the moved archive: %s %+v", o.Status, o.Error)
	}
}
