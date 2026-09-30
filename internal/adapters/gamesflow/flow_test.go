package gamesflow_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

var ctx = context.Background()

func code(t *testing.T, err error) string {
	t.Helper()
	c, _, ok := games.CodeOf(err)
	if !ok {
		t.Fatalf("error has no code: %v", err)
	}
	return c
}

func TestQuickScanFindsSteamSkyrimAndNothingIsManaged(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Steam\steamapps\common\Skyrim Special Edition`)
	e.versions[strings.ToLower(root+`\SkyrimSE.exe`)] = "1.6.1170.0"
	e.stores.installs = []ports.StoreInstall{{Store: "steam", AppID: "489830", Path: root}}

	v, _ := e.svc.View(ctx, false)
	if v.Scanned || len(v.Discovered) != 0 || len(v.Supported) != 1 || v.Supported[0].Definition.ID != "skyrimse" {
		t.Fatalf("before scanning Skyrim is only supported: %+v", v)
	}
	if n, err := e.svc.ScanQuick(ctx); err != nil || n != 1 {
		t.Fatalf("scan = %d, %v", n, err)
	}
	v, _ = e.svc.View(ctx, false)
	if !v.Scanned || len(v.Discovered) != 1 || len(v.Managed) != 0 || len(v.Supported) != 0 {
		t.Fatalf("after scanning: %+v", v)
	}
	if d := v.Discovered[0]; d.Candidate.Store != "steam" || d.Candidate.Version != "1.6.1170.0" {
		t.Fatalf("candidate = %+v", d.Candidate)
	}
	if len(e.instances.byID) != 0 {
		t.Fatal("scanning must never manage a game (games.md §7)")
	}
	if len(e.fs.Writes) != 0 {
		t.Fatalf("scanning must not write: %v", e.fs.Writes)
	}
}

func TestFullScanFindsACopyOnAnotherDrive(t *testing.T) {
	e := newEnv()
	e.skyrim(`D:\Backups\Skyrim copy`)
	e.fs.AddFile(`D:\Windows\Skyrim\SkyrimSE.exe`, "") // skipped system area
	id, err := e.svc.StartFullScan(ctx)
	if err != nil {
		t.Fatal(err)
	}
	waitOperation(t, e, string(id))
	v, _ := e.svc.View(ctx, false)
	if len(v.Discovered) != 1 || v.Discovered[0].Candidate.Root != `D:\Backups\Skyrim copy` {
		t.Fatalf("discovered = %+v", v.Discovered)
	}
}

func TestVerifyRefusesWrongFolderWithReason(t *testing.T) {
	e := newEnv()
	e.fs.AddDir(`C:\NotSkyrim`)
	v, err := e.svc.Verify(ctx, games.Setup{Game: "skyrimse", Root: `C:\NotSkyrim`})
	if err != nil || len(v.Problems) != 1 || v.Problems[0].Code != games.CodeRootInvalid ||
		v.Problems[0].Params["reason"] != "marker_missing" || v.Problems[0].Params["marker"] != "SkyrimSE.exe" {
		t.Fatalf("problems = %+v, %v", v.Problems, err)
	}
	v, _ = e.svc.Verify(ctx, games.Setup{Game: "skyrimse", Root: `relative\path`})
	if v.Problems[0].Params["reason"] != "not_absolute" {
		t.Fatalf("problems = %+v", v.Problems)
	}
	if _, err := e.svc.Verify(ctx, games.Setup{Game: "nope", Root: `C:\x`}); code(t, err) != games.CodeGameUnknown {
		t.Fatal("unknown game")
	}
}

func TestManageCreatesInstanceProfileMarkersAndActivates(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Store: "steam"})
	if err != nil {
		t.Fatal(err)
	}
	inst, err := e.instances.Get(ctx, res.Instance)
	if err != nil {
		t.Fatal(err)
	}
	if inst.Adapter != "skyrimse" || inst.PreferredMethod != game.MethodHardlink || inst.Store != "steam" || inst.AdapterVersion == "" {
		t.Fatalf("instance = %+v", inst)
	}
	if !strings.HasPrefix(inst.Staging, `C:\ModOrchestrator\`) || !strings.HasSuffix(inst.Staging, `\staging`) {
		t.Fatalf("staging should be suggested on the game volume: %s", inst.Staging)
	}
	if err := inst.Validate(); err != nil {
		t.Fatal(err)
	}
	for path, kind := range map[string]string{inst.Staging: game.StagingMarker, inst.ArchiveStore: game.ArchivesMarker, inst.BackupStore: game.BackupsMarker} {
		body, ok := e.fs.Content(path + `\` + kind)
		if !ok {
			t.Fatalf("marker %s missing in %s", kind, path)
		}
		if owner, err := game.ParseMarker([]byte(body)); err != nil || owner != inst.ID {
			t.Fatalf("marker owner = %q, %v", owner, err)
		}
	}
	// A Default profile exists and is the only, active one (INV-ORD-01).
	list, _ := e.profiles.ListByInstance(ctx, inst.ID)
	active, err := e.profiles.Active(ctx, inst.ID)
	if len(list) != 1 || list[0].Name() != "Default" || err != nil || active != list[0].ID() {
		t.Fatalf("profiles = %d, active=%q err=%v", len(list), active, err)
	}
	if a, _ := e.svc.Active(ctx); a != inst.ID {
		t.Fatal("new instance must be the active one")
	}
	// The game folder itself was not written to.
	for _, w := range e.fs.Writes {
		if strings.HasPrefix(strings.ToLower(w[strings.Index(w, " ")+1:]), strings.ToLower(root)) {
			t.Fatalf("manage wrote inside the game folder: %s", w)
		}
	}
	// Same root again is refused.
	if _, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root}); code(t, err) != games.CodeRootInUse {
		t.Fatalf("second manage of the same root: %v", err)
	}
}

// INV-LIB-03: the assistant refuses a staging at or around the game.
func TestManageRefusesStagingInsideTheGameINVLIB03(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	for _, staging := range []string{root, root + `\Data\mods`, `C:\Games`} {
		_, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Folders: games.Folders{Staging: staging}})
		if code(t, err) != games.CodeFoldersInvalid {
			t.Errorf("staging %s: %v", staging, err)
		}
	}
	if len(e.instances.byID) != 0 {
		t.Fatal("nothing may be registered on refusal")
	}
}

func TestStagingMarkerRules(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	e.fs.AddFile(`D:\stage\some-file.txt`, "x")
	_, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Folders: games.Folders{Staging: `D:\stage`}})
	if c, p, _ := games.CodeOf(err); c != games.CodeStagingForeign || p["reason"] != "not_empty" {
		t.Fatalf("non-empty unmarked staging: %v", err)
	}
	e.fs.AddFile(`D:\stage2\.modorchestrator-staging`, string(game.NewFolderMarker("staging", "someone-else")))
	_, err = e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Folders: games.Folders{Staging: `D:\stage2`}})
	if c, p, _ := games.CodeOf(err); c != games.CodeStagingForeign || p["reason"] != "other_instance" {
		t.Fatalf("staging of another instance: %v", err)
	}
	// An existing empty folder is accepted and marked.
	e.fs.AddDir(`C:\stage3`)
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Folders: games.Folders{Staging: `C:\stage3`}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := e.fs.Content(`C:\stage3\.modorchestrator-staging`); !ok || res.Instance == "" {
		t.Fatal("empty folder must be claimed with a marker")
	}
}

func TestMethodAvailabilityFollowsVolumes(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	folders := games.Folders{Staging: `D:\s`, ArchiveStore: `D:\a`, BackupStore: `C:\b`}
	v, _ := e.svc.Verify(ctx, games.Setup{Game: "skyrimse", Root: root, Folders: folders})
	if len(v.Problems) != 0 {
		t.Fatal(v.Problems)
	}
	if v.Methods[0].Method != game.MethodHardlink || v.Methods[0].Available || v.Methods[0].Reason != "different_volume" {
		t.Fatalf("methods = %+v", v.Methods)
	}
	if !slices.ContainsFunc(v.Warnings, func(p games.Problem) bool { return p.Code == "hardlink_unavailable" }) {
		t.Fatal("wizard must warn about hardlinks")
	}
	// Hardlink across volumes is refused; copy has to be chosen explicitly.
	_, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Method: game.MethodHardlink, Folders: folders})
	if code(t, err) != games.CodeMethodUnavail {
		t.Fatalf("hardlink across volumes: %v", err)
	}
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Method: game.MethodCopy, Folders: folders})
	if err != nil {
		t.Fatal(err)
	}
	if inst, _ := e.instances.Get(ctx, res.Instance); inst.PreferredMethod != game.MethodCopy {
		t.Fatalf("method = %s", inst.PreferredMethod)
	}
}

// INV-DEP-08 (detection): marks of other managers are found and do not stop
// the assistant; they are calculated, not stored.
func TestForeignDeploymentDetectionINVDEP08(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	e.fs.AddFile(root+`\Data\vortex.deployment.json`, "{}")
	e.fs.AddFile(root+`\Data\Skyrim.esm.vortex_backup`, "")
	e.fs.AddFile(root+`\ModOrganizer.ini`, "")

	v, err := e.svc.Verify(ctx, games.Setup{Game: "skyrimse", Root: root})
	if err != nil || len(v.Problems) != 0 {
		t.Fatalf("foreign deployment must not block the assistant: %v %v", v.Problems, err)
	}
	kinds := map[game.ForeignKind]int{}
	for _, f := range v.Foreign {
		kinds[f.Kind]++
	}
	if kinds[game.ForeignVortex] != 2 || kinds[game.ForeignMO2] != 1 {
		t.Fatalf("findings = %+v", v.Foreign)
	}

	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root})
	if err != nil {
		t.Fatal(err)
	}
	m, _ := e.svc.Details(ctx, res.Instance)
	if len(m.Foreign) != 3 {
		t.Fatalf("instance is born blocked: %+v", m.Foreign)
	}
	// Once the other manager is gone, the next read is clean.
	e.fs.Remove(ctx, root+`\Data\vortex.deployment.json`)
	e.fs.Remove(ctx, root+`\Data\Skyrim.esm.vortex_backup`)
	e.fs.Remove(ctx, root+`\ModOrganizer.ini`)
	m, _ = e.svc.Details(ctx, res.Instance)
	if len(m.Foreign) != 0 {
		t.Fatalf("stale finding: %+v", m.Foreign)
	}
}

func TestForeignMarkerOfAnotherInstance(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	res, _ := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root})
	marker := root + `\Data\.modorchestrator-deployment.json`
	// Our own marker is not foreign; another instance's is.
	e.fs.AddFile(marker, string(game.NewFolderMarker("deployment", res.Instance)))
	if m, _ := e.svc.Details(ctx, res.Instance); len(m.Foreign) != 0 {
		t.Fatalf("own marker flagged: %+v", m.Foreign)
	}
	e.fs.AddFile(marker, string(game.NewFolderMarker("deployment", "other-id")))
	m, _ := e.svc.Details(ctx, res.Instance)
	if len(m.Foreign) != 1 || m.Foreign[0].Kind != game.ForeignInstance || m.Foreign[0].Instance != "other-id" {
		t.Fatalf("findings = %+v", m.Foreign)
	}
	// Garbage is foreign too: ownership is proven, not assumed.
	e.fs.AddFile(marker, "garbage")
	if m, _ := e.svc.Details(ctx, res.Instance); len(m.Foreign) != 1 {
		t.Fatalf("unparseable marker must count as foreign: %+v", m.Foreign)
	}
}

func TestGenericGameWithTwoTargets(t *testing.T) {
	e := newEnv()
	e.fs.AddDir(`C:\Games\Valheim`)
	e.fs.AddFile(`C:\Games\Valheim\valheim.exe`, "")
	su := games.Setup{
		Game: "generic", Name: "Valheim", Root: `C:\Games\Valheim\`, Executable: "valheim.exe",
		Targets: []game.TargetSpec{{ID: "mods", Path: "Mods"}, {ID: "bepinex", Path: "BepInEx/plugins"}},
	}
	res, err := e.svc.Manage(ctx, su)
	if err != nil {
		t.Fatal(err)
	}
	inst, _ := e.instances.Get(ctx, res.Instance)
	if inst.Root != `C:\Games\Valheim` || len(inst.Targets) != 2 || inst.Targets[1].Path != `C:\Games\Valheim\BepInEx\plugins` || inst.Executable != "valheim.exe" {
		t.Fatalf("instance = %+v", inst)
	}
	// Name is required and unique per game; bad targets and exe are refused.
	e.fs.AddDir(`C:\Games\Valheim2`)
	bad := map[string]games.Setup{
		games.CodeNameEmpty:      {Game: "generic", Root: `C:\Games\Valheim2`, Targets: su.Targets},
		games.CodeTargetsInvalid: {Game: "generic", Name: "x", Root: `C:\Games\Valheim2`, Targets: []game.TargetSpec{{ID: "A", Path: "x"}}},
		games.CodeExecutableBad:  {Game: "generic", Name: "x", Root: `C:\Games\Valheim2`, Targets: su.Targets, Executable: "nope.exe"},
	}
	for want, s := range bad {
		if _, err := e.svc.Manage(ctx, s); code(t, err) != want {
			t.Errorf("want %s, got %v", want, err)
		}
	}
	e.fs.AddDir(`C:\Games\Other`)
	su2 := games.Setup{Game: "generic", Name: "valheim", Root: `C:\Games\Other`, Targets: su.Targets}
	if _, err := e.svc.Manage(ctx, su2); code(t, err) != games.CodeNameTaken {
		t.Fatalf("duplicate name: %v", err)
	}
	// The generic game has no plugin screens (core/11 §8).
	w, _ := e.svc.Workspace(ctx)
	for _, it := range w.Items {
		if it == games.ItemPlugins || it == games.ItemLoadOrder {
			t.Fatalf("generic workspace shows %s", it)
		}
	}
}

func TestWorkspaceFollowsCapabilities(t *testing.T) {
	e := newEnv()
	if w, _ := e.svc.Workspace(ctx); w.Active != nil || len(w.Items) != 0 {
		t.Fatalf("no workspace without an active game: %+v", w)
	}
	if _, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: e.skyrim(`C:\Games\Skyrim`)}); err != nil {
		t.Fatal(err)
	}
	w, _ := e.svc.Workspace(ctx)
	want := []games.WorkspaceItem{"overview", "mods", "plugins", "load_order", "conflicts", "profiles", "diagnostics"}
	if !slices.Equal(w.Items, want) || w.Active == nil || w.Active.GameName == "" {
		t.Fatalf("workspace = %+v", w)
	}
	if got := games.WorkspaceItems(game.NewCapabilities(game.CapFilesystemTarget)); slices.Contains(got, games.ItemPlugins) {
		t.Fatal("plugins without the capability")
	}
}

func TestInstanceUpkeep(t *testing.T) {
	e := newEnv()
	a, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: e.skyrim(`C:\Games\Skyrim`), Name: "Main"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: e.skyrim(`C:\Games\Skyrim Test`), Name: "Test"})
	if err != nil {
		t.Fatalf("a second instance of the same game: %v", err)
	}
	if err := e.svc.Rename(ctx, b.Instance, "main"); code(t, err) != games.CodeNameTaken {
		t.Fatalf("rename to a taken name: %v", err)
	}
	if err := e.svc.Rename(ctx, b.Instance, "Testing"); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.SetActive(ctx, a.Instance); err != nil {
		t.Fatal(err)
	}
	if act, _ := e.svc.Active(ctx); act != a.Instance {
		t.Fatal("active")
	}
	if err := e.svc.SetInstanceHidden(ctx, b.Instance, true); err != nil {
		t.Fatal(err)
	}
	if v, _ := e.svc.View(ctx, false); len(v.Managed) != 1 || v.HiddenCount != 1 {
		t.Fatalf("hidden instance shown: %+v", v)
	}
	if v, _ := e.svc.View(ctx, true); len(v.Managed) != 2 {
		t.Fatal("show hidden")
	}
	if err := e.svc.SetGameHidden(ctx, "nope", true); code(t, err) != games.CodeGameUnknown {
		t.Fatal("unknown game")
	}
	// Open-folder only serves folders the instance owns.
	if p, err := e.svc.FolderPath(ctx, a.Instance, "staging"); err != nil || !strings.HasSuffix(p, "staging") {
		t.Fatalf("staging path: %q %v", p, err)
	}
	if _, err := e.svc.FolderPath(ctx, a.Instance, `C:\Windows`); code(t, err) != games.CodeFolderUnknown {
		t.Fatal("arbitrary path must be refused")
	}
}

func TestHiddenDiscoveredGame(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	e.stores.installs = []ports.StoreInstall{{Store: "steam", AppID: "489830", Path: root}}
	if _, err := e.svc.ScanQuick(ctx); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.SetGameHidden(ctx, "skyrimse", true); err != nil {
		t.Fatal(err)
	}
	if v, _ := e.svc.View(ctx, false); len(v.Discovered) != 0 || v.HiddenCount != 1 {
		t.Fatalf("%+v", v)
	}
	if v, _ := e.svc.View(ctx, true); len(v.Discovered) != 1 || !v.Discovered[0].Hidden {
		t.Fatalf("%+v", v)
	}
}

func TestUnmanageGuardAndDeletion(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Name: "Main"})
	if err != nil {
		t.Fatal(err)
	}
	inst, _ := e.instances.Get(ctx, res.Instance)

	// Guard (plano F3): an instance with files deployed cannot be dropped.
	e.deployed[res.Instance] = true
	if _, err := e.svc.Unmanage(ctx, res.Instance, games.UnmanageOptions{}); code(t, err) != games.CodeInstanceDeployed {
		t.Fatalf("deployed instance: %v", err)
	}
	if _, err := e.instances.Get(ctx, res.Instance); err != nil {
		t.Fatal("refused unmanage must leave the instance")
	}
	e.deployed[res.Instance] = false

	// Deleting files needs the name typed.
	if _, err := e.svc.Unmanage(ctx, res.Instance, games.UnmanageOptions{DeleteFiles: true, ConfirmName: "nope"}); code(t, err) != games.CodeConfirmName {
		t.Fatal("confirmation")
	}
	// Default: keep the folders.
	e.fs.AddFile(inst.Staging+`\keep.txt`, "x")
	if _, err := e.svc.Unmanage(ctx, res.Instance, games.UnmanageOptions{}); err != nil {
		t.Fatal(err)
	}
	if !e.fs.Exists(inst.Staging + `\keep.txt`) {
		t.Fatal("staging must be kept by default")
	}
	if _, err := e.instances.Get(ctx, res.Instance); !errors.Is(err, ports.ErrNotFound) {
		t.Fatal("instance must be gone")
	}
	if a, _ := e.svc.Active(ctx); a != "" {
		t.Fatal("active instance must be cleared")
	}
	if !e.fs.Exists(root + `\SkyrimSE.exe`) {
		t.Fatal("the game must be untouched")
	}
}

func TestUnmanageDeletesOnlyFoldersProvablyOurs(t *testing.T) {
	e := newEnv()
	root := e.skyrim(`C:\Games\Skyrim`)
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: root, Name: "Main"})
	if err != nil {
		t.Fatal(err)
	}
	inst, _ := e.instances.Get(ctx, res.Instance)
	e.fs.AddFile(inst.Staging+`\mod\a.txt`, "x")
	// Someone replaced the archive store's marker: no longer provably ours.
	e.fs.AddFile(inst.ArchiveStore+`\.modorchestrator-archives`, string(game.NewFolderMarker("archives", "other")))
	e.fs.AddFile(inst.ArchiveStore+`\precious.zip`, "x")
	if _, err := e.svc.Unmanage(ctx, res.Instance, games.UnmanageOptions{DeleteFiles: true, ConfirmName: "Main"}); err != nil {
		t.Fatal(err)
	}
	if e.fs.Exists(inst.Staging) {
		t.Fatal("staging with our marker should be deleted")
	}
	if !e.fs.Exists(inst.ArchiveStore + `\precious.zip`) {
		t.Fatal("a folder whose marker is not ours must never be deleted")
	}
	if !e.fs.Exists(root + `\SkyrimSE.exe`) {
		t.Fatal("the game must be untouched")
	}
}

func TestRelocate(t *testing.T) {
	e := newEnv()
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: e.skyrim(`C:\Games\Skyrim`)})
	if err != nil {
		t.Fatal(err)
	}
	e.fs.AddDir(`D:\Moved`)
	if err := e.svc.Relocate(ctx, res.Instance, `D:\Moved`); code(t, err) != games.CodeRootInvalid {
		t.Fatalf("a folder that is not the game: %v", err)
	}
	e.skyrim(`D:\Moved`)
	if err := e.svc.Relocate(ctx, res.Instance, `D:\Moved\`); err != nil {
		t.Fatal(err)
	}
	inst, _ := e.instances.Get(ctx, res.Instance)
	if inst.Root != `D:\Moved` || inst.Targets[0].Path != `D:\Moved\Data` {
		t.Fatalf("instance = %+v", inst)
	}
	e.deployed[res.Instance] = true
	if err := e.svc.Relocate(ctx, res.Instance, `C:\Games\Skyrim`); code(t, err) != games.CodeInstanceDeployed {
		t.Fatal("deployed instance must be purged first")
	}
}

type blockingDeployments struct{ enter, release chan struct{} }

func (b blockingDeployments) Deployed(context.Context, game.InstanceID) (bool, error) {
	close(b.enter)
	<-b.release
	return false, nil
}

func TestInstanceBusyIsRefusedNotQueued(t *testing.T) {
	e := newEnv()
	res, err := e.svc.Manage(ctx, games.Setup{Game: "skyrimse", Root: e.skyrim(`C:\Games\Skyrim`)})
	if err != nil {
		t.Fatal(err)
	}
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	deps := e.deps
	deps.Deployments = blockingDeployments{enter: entered, release: release}
	busy := games.NewService(deps)
	go func() {
		_, _ = busy.Unmanage(ctx, res.Instance, games.UnmanageOptions{})
		close(done)
	}()
	<-entered
	if _, err := busy.Unmanage(ctx, res.Instance, games.UnmanageOptions{}); code(t, err) != games.CodeInstanceBusy {
		t.Fatalf("second mutating operation: %v", err)
	}
	close(release)
	<-done
}
