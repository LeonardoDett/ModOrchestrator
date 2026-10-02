package integration_test

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	deploysvc "modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/library"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/externalchange"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

func (e *env) verify() deploysvc.ChangesView {
	e.t.Helper()
	v, err := e.dep.Verify(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	return v
}

func changeAt(v []deploysvc.ChangeView, path string) (deploysvc.ChangeView, bool) {
	i := slices.IndexFunc(v, func(c deploysvc.ChangeView) bool { return c.Location.Key() == dataLoc(path).Key() })
	if i < 0 {
		return deploysvc.ChangeView{}, false
	}
	return v[i], true
}

// decide runs a manual deploy, waits at await_decision and answers.
func (e *env) decide(ds ...deploysvc.DecisionInput) (deploysvc.PlanView, *operation.Operation) {
	e.t.Helper()
	op, err := e.dep.Deploy(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	view := e.waitDeployDecision(op)
	if err := e.dep.ResolveDecision(e.inst.ID, op, nil, ds); err != nil {
		e.t.Fatal(err)
	}
	e.dep.Wait()
	e.lib.Wait()
	return view, e.op(op)
}

func (e *env) setInstance(key, value string) {
	e.t.Helper()
	svc := appsettings.NewService(sqlite.NewSettingsRepository(e.db), system.Locale{}, settings.V1)
	if err := svc.SetInstance(ctx, string(e.inst.ID), key, value); err != nil {
		e.t.Fatal(err)
	}
}

// core/09 §7: editing a plugin through its hardlink in another tool is
// `modified`; "keep" updates the installation and touches nothing in the
// game (INV-EXT-02: nothing happens before the decision).
func TestHardlinkEditIsKept(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Alpha")
	e.deploy(deploysvc.KindDeploy)

	f, err := os.OpenFile(e.data("Alpha.esp"), os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString(" cleaned by xEdit")
	_ = f.Close()
	id := fileID(t, e.data("Alpha.esp"))

	v := e.verify()
	c, ok := changeAt(v.Changes, "Alpha.esp")
	if !ok || c.Kind != externalchange.KindModified || c.Suggested != externalchange.ActionKeepChange || !slices.Contains(c.Actions, externalchange.ActionRevert) {
		t.Fatalf("hardlink edit: %+v", v)
	}
	if c.Before == nil || c.After == nil || c.After.Size <= c.Before.Size {
		t.Fatalf("before/after facts: %+v %+v", c.Before, c.After)
	}
	if s := e.status(); s.Status.Kind != deploystate.Blocked || s.ExternalChanges != 1 {
		t.Fatalf("status = %+v", s.Status)
	}

	view, op := e.decide(deploysvc.DecisionInput{Location: dataLoc("Alpha.esp"), Action: externalchange.ActionKeepChange})
	if view.ChangeCount != 1 || op.Status != operation.StatusSucceeded {
		t.Fatalf("keep: %+v %s %+v", view, op.Status, op.Error)
	}
	if fileID(t, e.data("Alpha.esp")) != id || readFile(t, e.data("Alpha.esp")) != "alpha plugin cleaned by xEdit" {
		t.Fatal("keeping the change touches nothing in the game")
	}
	m, _ := e.mods.Get(ctx, ids[0])
	inst, err := sqlite.NewInstallationRepository(e.db).Get(ctx, m.Installation)
	if err != nil {
		t.Fatal(err)
	}
	if f, _ := inst.FileAt(dataLoc("Alpha.esp")); f.Size != int64(len("alpha plugin cleaned by xEdit")) || f.Hash == "" {
		t.Fatalf("the installation records the new content: %+v", f)
	}
	if v := e.verify(); v.ChangeCount != 0 {
		t.Fatalf("nothing diverges any more: %+v", v)
	}
	e.wantStatus(deploystate.InSync)
}

// core/09 §7: the store putting the original back over a link is
// `replaced` with "revert" suggested; the found file goes to the
// BackupStore and the original is still the one restored by purge.
func TestStoreRestoredOriginalIsReverted(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Bravo")
	e.deploy(deploysvc.KindDeploy)
	if err := os.Remove(e.data("Skyrim.esm")); err != nil {
		t.Fatal(err)
	}
	e.write(e.data("Skyrim.esm"), "esm") // Steam "verify files"

	view, op := e.decide(deploysvc.DecisionInput{Location: dataLoc("Skyrim.esm"), Action: externalchange.ActionRevert})
	c, ok := changeAt(view.Changes, "Skyrim.esm")
	if !ok || c.Kind != externalchange.KindReplaced || c.Suggested != externalchange.ActionRevert {
		t.Fatalf("store restored the original: %+v", view.Changes)
	}
	if op.Status != operation.StatusSucceeded {
		t.Fatalf("revert: %s %+v", op.Status, op.Error)
	}
	if fileID(t, e.data("Skyrim.esm")) != fileID(t, e.staged(ids[0], "Skyrim.esm")) {
		t.Fatal("the link is back")
	}
	aside := filepath.Join(e.inst.BackupStore, "data", "Skyrim.esm.backup1")
	if readFile(t, aside) != "esm" {
		t.Fatal("the found file is kept in the BackupStore, never deleted")
	}
	e.wantStatus(deploystate.InSync)
	e.deploy(deploysvc.KindPurge)
	if readFile(t, e.data("Skyrim.esm")) != "esm" {
		t.Fatal("purge restores the original")
	}
}

// core/09 §7 and INV-EXT-03: tool outputs are `unexpected`, grouped, never
// deleted by deploy or purge, and never stop a deploy by themselves; a
// capture makes them a mod deployed as links; "leave unmanaged" is
// remembered.
func TestGeneratedFilesAreCaptured(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Alpha", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	beh := "meshes/actors/character/behaviors/0_master.hkx"
	e.write(e.data(beh), "nemesis output")
	e.write(e.data("Nemesis.log"), "log")
	e.write(e.data("meshes/charlie/generated.nif"), "bodyslide")

	v := e.verify()
	if v.ChangeCount != 0 || v.NewFileCount != 3 {
		t.Fatalf("three generated files: %+v", v)
	}
	if c, _ := changeAt(v.Changes, "Nemesis.log"); c.Suggested != externalchange.ActionLeaveUnmanaged {
		t.Fatalf("log files are hinted unmanaged: %+v", c)
	}
	if c, _ := changeAt(v.Changes, beh); c.Suggested != "" || c.Kind != externalchange.KindUnexpected {
		t.Fatalf("nothing pre-selected for tool output: %+v", c)
	}
	if s := e.status(); s.NewFiles != 3 || s.Status.Kind != deploystate.InSync {
		t.Fatalf("generated files never block: %+v %d", s.Status, s.NewFiles)
	}
	// A deploy runs without asking and leaves them alone.
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", o.Error)
	}

	op, err := e.dep.ResolveChanges(ctx, e.inst.ID, []deploysvc.DecisionInput{
		{Location: dataLoc(beh), Action: externalchange.ActionCapture, CaptureName: "Generated files", CaptureCategory: "Generated"},
		{Location: dataLoc("meshes/charlie/generated.nif"), Action: externalchange.ActionCapture, CaptureName: "Generated files", CaptureCategory: "Generated"},
		{Location: dataLoc("Nemesis.log"), Action: externalchange.ActionLeaveUnmanaged},
	})
	if err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(op); o.Status != operation.StatusSucceeded {
		t.Fatalf("review: %s %+v", o.Status, o.Error)
	}
	var captured *mod.Mod
	list, _ := e.mods.ListByInstance(ctx, e.inst.ID)
	for _, m := range list {
		if m.Name == "Generated files" {
			captured = m
		}
	}
	if captured == nil || captured.Source.Ref != library.InstallerCaptured || captured.Category == "" {
		t.Fatalf("a new mod holds the captured files: %+v", captured)
	}
	order := e.active().Order()
	if order[len(order)-1].Mod != captured.ID || !e.active().IsEnabled(captured.ID) {
		t.Fatal("the capture mod is enabled at the end of the ModOrder")
	}
	if fileID(t, e.data(beh)) != fileID(t, e.staged(captured.ID, beh)) || readFile(t, e.data(beh)) != "nemesis output" {
		t.Fatal("the captured file is deployed as a link")
	}
	if v := e.verify(); v.NewFileCount != 0 || v.ChangeCount != 0 {
		t.Fatalf("nothing left to review: %+v", v)
	}
	e.wantStatus(deploystate.InSync)

	e.deploy(deploysvc.KindPurge)
	if readFile(t, e.data("Nemesis.log")) != "log" {
		t.Fatal("an unmanaged file is never deleted (INV-EXT-03)")
	}
	if _, err := os.Stat(e.data(beh)); !os.IsNotExist(err) {
		t.Fatal("captured files are the mod's: purge removes them from the game")
	}
	if readFile(t, e.staged(captured.ID, beh)) != "nemesis output" {
		t.Fatal("the content stays in the mod")
	}
}

// INV-EXT-03: deploy and purge never delete generated files that were not
// decided.
func TestGeneratedFilesSurviveDeployAndPurge(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Charlie")
	e.deploy(deploysvc.KindDeploy)
	e.write(e.data("meshes/charlie/tool.nif"), "tool")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, false); err != nil {
		t.Fatal(err)
	}
	e.deploy(deploysvc.KindDeploy)
	e.deploy(deploysvc.KindPurge)
	if readFile(t, e.data("meshes/charlie/tool.nif")) != "tool" {
		t.Fatal("generated file deleted")
	}
}

// A missing managed file: "restore" recreates it; "accept removal" hides it
// from the mod (FileExclusion); with deploy.autoRestoreMissing a manual
// deploy restores it without asking and records it (the only exception of
// INV-EXT-02).
func TestMissingFileDecisions(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	ids := e.installFiles(deployMods, "Alpha", "Charlie")
	e.deploy(deploysvc.KindDeploy)

	_ = os.Remove(e.data("Alpha.esp"))
	_, op := e.decide(deploysvc.DecisionInput{Location: dataLoc("Alpha.esp"), Action: externalchange.ActionRestore})
	if op.Status != operation.StatusSucceeded || fileID(t, e.data("Alpha.esp")) != fileID(t, e.staged(ids[0], "Alpha.esp")) {
		t.Fatalf("restore: %+v", op.Error)
	}

	_ = os.Remove(e.data("meshes/charlie/c.nif"))
	_, op = e.decide(deploysvc.DecisionInput{Location: dataLoc("meshes/charlie/c.nif"), Action: externalchange.ActionAcceptRemoval})
	if op.Status != operation.StatusSucceeded {
		t.Fatalf("accept removal: %+v", op.Error)
	}
	if _, err := os.Stat(e.data("meshes/charlie/c.nif")); !os.IsNotExist(err) {
		t.Fatal("an accepted removal is not recreated")
	}
	intent, _ := sqlite.NewOverrideRepository(e.db).Get(ctx, e.inst.ID)
	if !intent.Excluded(ids[1], dataLoc("meshes/charlie/c.nif")) {
		t.Fatal("accepted removal becomes a FileExclusion")
	}
	e.wantStatus(deploystate.InSync)

	e.setInstance("deploy.autoRestoreMissing", "true")
	_ = os.Remove(e.data("Alpha.esp"))
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded {
		t.Fatalf("auto restore: %+v", o.Error)
	}
	if _, err := os.Stat(e.data("Alpha.esp")); err != nil {
		t.Fatal("missing file restored automatically")
	}
	e.eventsMu.Lock()
	restored := slices.ContainsFunc(e.events, func(ev event.Event) bool { return ev.Type == deploysvc.EventExternalAutoRestored })
	e.eventsMu.Unlock()
	if !restored {
		t.Fatal("the automatic restore is recorded")
	}
	// Auto-deploy never restores on its own.
	_ = os.Remove(e.data("Alpha.esp"))
	id, err := e.dep.AutoDeploy(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	e.dep.Wait()
	if o := e.op(id); o.Status != operation.StatusFailed || o.Error.Code != deploysvc.CodeNeedsDecision {
		t.Fatalf("auto-deploy asks: %+v", o.Error)
	}
}

// An edited copy saved to the mod updates the staging; a revert puts the
// staged file back.
func TestCopyEditDecisions(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodCopy})
	ids := e.installFiles(deployMods, "Alpha", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	e.write(e.data("Alpha.esp"), "edited copy")
	e.write(e.data("meshes/charlie/c.nif"), "broken")

	view, op := e.decide(
		deploysvc.DecisionInput{Location: dataLoc("Alpha.esp"), Action: externalchange.ActionSaveToMod},
		deploysvc.DecisionInput{Location: dataLoc("meshes/charlie/c.nif"), Action: externalchange.ActionRevert},
	)
	if c, _ := changeAt(view.Changes, "Alpha.esp"); c.Kind != externalchange.KindModified || c.Suggested != externalchange.ActionSaveToMod {
		t.Fatalf("edited copy: %+v", c)
	}
	if op.Status != operation.StatusSucceeded {
		t.Fatalf("decisions: %+v", op.Error)
	}
	if readFile(t, e.staged(ids[0], "Alpha.esp")) != "edited copy" || readFile(t, e.data("Alpha.esp")) != "edited copy" {
		t.Fatal("save to mod copies the edit into the staging")
	}
	if readFile(t, e.data("meshes/charlie/c.nif")) != "charlie" {
		t.Fatal("revert puts the staged file back")
	}
	if v := e.verify(); v.ChangeCount != 0 {
		t.Fatalf("nothing diverges: %+v", v.Changes)
	}
	e.wantStatus(deploystate.InSync)
}

// An action not offered for the change is refused and nothing is written.
func TestInvalidDecisionIsRefused(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Alpha")
	e.deploy(deploysvc.KindDeploy)
	_ = os.Remove(e.data("Alpha.esp"))
	_, op := e.decide(deploysvc.DecisionInput{Location: dataLoc("Alpha.esp"), Action: externalchange.ActionCapture})
	if op.Status != operation.StatusFailed || op.Error.Code != deploysvc.CodeDecisionInvalid {
		t.Fatalf("invalid decision: %s %+v", op.Status, op.Error)
	}
	if _, err := os.Stat(e.data("Alpha.esp")); !os.IsNotExist(err) {
		t.Fatal("nothing was written")
	}
}

// The focus scan finds changes within its budget and keeps counting them.
func TestFocusScan(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Alpha", "Bravo", "Charlie")
	e.deploy(deploysvc.KindDeploy)
	_ = os.Remove(e.data("textures/shared.dds"))
	e.write(e.data("Nemesis.log"), "log")
	for i := 0; i < 3; i++ { // a few focus events cover the manifest
		if err := e.dep.ScanOnFocus(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
	}
	if s := e.status(); s.ExternalChanges != 1 || s.NewFiles != 1 || s.Status.Reason != deploystate.ReasonExternalChanges {
		t.Fatalf("focus scan: %+v changes=%d new=%d", s.Status, s.ExternalChanges, s.NewFiles)
	}
	e.setApp("deploy.verifyOnFocus", "false")
	e.write(e.data("other.log"), "log")
	_ = e.dep.ScanOnFocus(ctx, e.inst.ID)
	if s := e.status(); s.NewFiles != 1 {
		t.Fatal("the setting turns the focus scan off")
	}
}

func (e *env) setApp(key, value string) {
	e.t.Helper()
	svc := appsettings.NewService(sqlite.NewSettingsRepository(e.db), system.Locale{}, settings.V1)
	if err := svc.SetApp(ctx, key, value); err != nil {
		e.t.Fatal(err)
	}
}

// A capture interrupted between moves is finished at startup: the user
// decided it, so the files still in the game are moved and the library
// records everything the staging holds (core/09 §5).
func TestInterruptedCaptureIsFinished(t *testing.T) {
	e := newEnvWith(t, envOptions{method: game.MethodHardlink})
	e.installFiles(deployMods, "Charlie")
	e.deploy(deploysvc.KindDeploy)
	e.write(e.staged("capmod", "meshes/charlie/a.nif"), "moved before the crash")
	e.write(e.data("meshes/charlie/b.nif"), "still in the game")
	record := `{"` + string(e.inst.ID) + `":[{"mod":"capmod","name":"Generated files","type":"default","files":[` +
		`{"target":"data","path":"meshes/charlie/a.nif"},{"target":"data","path":"meshes/charlie/b.nif"}]}]}`
	state := sqlite.NewAppState(e.db)
	if err := state.Set(ctx, "deployment.captures", record); err != nil {
		t.Fatal(err)
	}
	if err := e.dep.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	m, err := e.mods.Get(ctx, "capmod")
	if err != nil || m.State != mod.StateInstalled {
		t.Fatalf("captured mod recorded: %+v %v", m, err)
	}
	inst, _ := sqlite.NewInstallationRepository(e.db).Get(ctx, m.Installation)
	if len(inst.Files) != 2 || inst.Installer != library.InstallerCaptured {
		t.Fatalf("both files recorded: %+v", inst)
	}
	if _, err := os.Stat(e.data("meshes/charlie/b.nif")); !os.IsNotExist(err) || readFile(t, e.staged("capmod", "meshes/charlie/b.nif")) != "still in the game" {
		t.Fatal("the rest of the capture moved")
	}
	if _, err := state.Get(ctx, "deployment.captures"); err == nil {
		t.Fatal("the capture record is gone")
	}
	if o := e.deploy(deploysvc.KindDeploy); o.Status != operation.StatusSucceeded || fileID(t, e.data("meshes/charlie/b.nif")) != fileID(t, e.staged("capmod", "meshes/charlie/b.nif")) {
		t.Fatalf("the next deploy links the captured files: %+v", o.Error)
	}
}
