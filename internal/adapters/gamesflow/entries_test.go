package gamesflow_test

import (
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

func customSetup(name, root string) games.Setup {
	return games.Setup{
		Game: "generic", Name: name, Root: root, Executable: "game.exe",
		Targets: []game.TargetSpec{{ID: "mods", Path: "Mods"}, {ID: "plugins", Path: `BepInEx\plugins`}},
	}
}

func (e *env) customGame(t *testing.T, name, root string) game.Instance {
	t.Helper()
	e.fs.AddFile(root+`\game.exe`, "")
	res, err := e.svc.Manage(ctx, customSetup(name, root))
	if err != nil {
		t.Fatal(err)
	}
	inst, err := e.instances.Get(ctx, res.Instance)
	if err != nil {
		t.Fatal(err)
	}
	return inst
}

// D117: a game the user adds gets an entry and an id of its own; the
// instance belongs to that game, which is served like any other.
func TestCustomGameBecomesAnEntryWithItsOwnID(t *testing.T) {
	e := newEnv()
	a := e.customGame(t, "Valheim", `C:\Games\Valheim`)
	b := e.customGame(t, "Valheim!", `D:\Games\Valheim`)
	if a.Game != "user.valheim" || b.Game != "user.valheim-2" || a.Adapter != "generic" || a.AdapterVersion != "2" {
		t.Fatalf("games = %q, %q (adapter %s %s)", a.Game, b.Game, a.Adapter, a.AdapterVersion)
	}
	def, ok := e.svc.Registry.Definition(a.Game)
	if !ok || def.Name != "Valheim" || def.CustomTargets || def.SupportLevel() != game.SupportCustom {
		t.Fatalf("definition = %+v, %v", def, ok)
	}
	if !slices.Equal(def.Targets, []game.TargetID{"mods", "plugins"}) || len(def.ModTypes) != 2 || def.ModTypes[1].Target != "plugins" {
		t.Fatalf("layout = %v %+v", def.Targets, def.ModTypes)
	}
	// The executable became the way to start the game and to see it running.
	for _, c := range []game.Capability{game.CapLaunch, game.CapRunningDetection, game.CapModTypes} {
		if !def.Capabilities.Has(c) {
			t.Errorf("missing %s", c)
		}
	}
	adapter, _ := e.svc.Registry.Adapter(a.Game)
	opts, err := adapter.(ports.LaunchSupport).LaunchOptions(ctx, e.fs, a)
	if err != nil || len(opts) != 1 || opts[0].Exe != "game.exe" || !opts[0].Default {
		t.Fatalf("launch = %+v, %v", opts, err)
	}
	if got := adapter.(ports.ProcessDeclarer).Processes(a.Game); !slices.Equal(got, []string{"game.exe"}) {
		t.Fatalf("processes = %v", got)
	}
	// Launch is a feature the user can turn off, like in any other game.
	if err := e.svc.SetFeature(ctx, a.ID, game.CapLaunch, false); err != nil {
		t.Fatal(err)
	}
	m, _ := e.svc.Details(ctx, a.ID)
	if m.Definition.Capabilities.Has(game.CapLaunch) || !m.Definition.Capabilities.Has(game.CapRunningDetection) {
		t.Fatalf("effective = %v", m.Definition.Capabilities.List())
	}

	// The same name for another custom game is still refused.
	e.fs.AddDir(`E:\Games\Other`)
	su := customSetup("valheim", `E:\Games\Other`)
	su.Executable = ""
	if _, err := e.svc.Manage(ctx, su); code(t, err) != games.CodeNameTaken {
		t.Fatalf("got %v", err)
	}
	if list, _ := e.svc.ListEntries(ctx); len(list) != 2 {
		t.Fatalf("a refused game must leave no entry behind: %+v", list)
	}
}

// Export gives a document that imports back; importing never replaces a
// game, and a file cannot take the id of a game the app ships.
func TestEntriesAreExportedImportedAndDeleted(t *testing.T) {
	e := newEnv()
	inst := e.customGame(t, "Valheim", `C:\Games\Valheim`)
	data, err := e.svc.ExportEntry(ctx, inst.Game)
	if err != nil || !strings.Contains(string(data), `"schema": 1`) || strings.Contains(string(data), `C:\\`) {
		t.Fatalf("export = %s, %v", data, err)
	}
	if _, err := e.svc.ImportEntry(ctx, data); code(t, err) != games.CodeEntryExists {
		t.Fatalf("importing an existing id: %v", err)
	}
	// R5c: the same document through a file, to carry the game to another PC.
	e.fs.AddDir(`D:\Share`)
	if err := e.svc.ExportEntryToFile(ctx, inst.Game, `D:\Share\valheim.json`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.ImportEntryFromFile(ctx, `D:\Share\valheim.json`); code(t, err) != games.CodeEntryExists {
		t.Fatalf("importing the exported file back: %v", err)
	}
	if err := e.svc.DeleteEntry(ctx, inst.Game); code(t, err) != games.CodeEntryInUse {
		t.Fatalf("deleting an entry in use: %v", err)
	}

	shipped := strings.Replace(string(data), `"id": "user.valheim"`, `"id": "skyrimse"`, 1)
	id, err := e.svc.ImportEntry(ctx, []byte(shipped))
	if err != nil || id != "user.skyrimse" {
		t.Fatalf("import = %q, %v", id, err)
	}
	if def, _ := e.svc.Registry.Definition("skyrimse"); def.SupportLevel() != game.SupportFull || !def.Capabilities.Has(game.CapPlugins) {
		t.Fatal("the shipped game must stay as it is")
	}
	v, _ := e.svc.View(ctx, false)
	if !slices.ContainsFunc(v.Supported, func(s games.Supported) bool { return s.Definition.ID == "user.skyrimse" }) {
		t.Fatalf("an imported game is a supported game: %+v", v.Supported)
	}

	for want, raw := range map[string]string{
		games.CodeEntrySchema:  strings.Replace(string(data), `"schema": 1`, `"schema": 9`, 1),
		games.CodeEntryInvalid: strings.Replace(string(data), `"path": "Mods"`, `"path": "..\\..\\Windows"`, 1),
	} {
		if _, err := e.svc.ImportEntry(ctx, []byte(raw)); code(t, err) != want {
			t.Errorf("want %s, got %v", want, err)
		}
	}
	if _, err := e.svc.ExportEntry(ctx, "skyrimse"); code(t, err) != games.CodeEntryUnknown {
		t.Errorf("a shipped game is not an entry: %v", err)
	}

	if err := e.svc.DeleteEntry(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.svc.Registry.Definition(id); ok {
		t.Fatal("a deleted entry leaves the registry")
	}
	if list, _ := e.svc.ListEntries(ctx); len(list) != 1 || list[0].Instances != 1 {
		t.Fatalf("entries = %+v", list)
	}
}

// An imported game that names its store and marker is found by the search
// and managed without the user declaring anything.
func TestImportedGameIsDiscoveredAndManaged(t *testing.T) {
	e := newEnv()
	manifest := `{"schema":1,"id":"farm","name":"Farm","discovery":{"stores":[{"store":"steam","appId":"777"}],"markers":["Farm.exe"],"versionFile":"Farm.exe"},
		"layout":{"targets":[{"id":"mods","path":"Mods","creatable":true}],"rootHints":{"extensions":[".pak"]}},
		"launch":[{"id":"game","exe":"Farm.exe","default":true}]}`
	id, err := e.svc.ImportEntry(ctx, []byte(manifest))
	if err != nil {
		t.Fatal(err)
	}
	e.fs.AddFile(`C:\Steam\steamapps\common\Farm\Farm.exe`, "")
	e.fs.AddDir(`C:\Steam\steamapps\common\Empty`)
	e.stores.installs = []ports.StoreInstall{
		{Store: "steam", AppID: "777", Path: `C:\Steam\steamapps\common\Farm`},
		{Store: "steam", AppID: "777", Path: `C:\Steam\steamapps\common\Empty`}, // marker missing
	}
	if n, err := e.svc.ScanQuick(ctx); err != nil || n != 1 {
		t.Fatalf("scan = %d, %v", n, err)
	}
	if check, err := e.svc.CheckRoot(ctx, id, `C:\Steam\steamapps\common\Empty`); err != nil || check.Problem == nil || check.Problem.Code != games.CodeRootInvalid {
		t.Fatalf("a folder without the marker is refused: %+v, %v", check, err)
	}
	res, err := e.svc.Manage(ctx, games.Setup{Game: id, Root: `C:\Steam\steamapps\common\Farm`, Store: "steam"})
	if err != nil {
		t.Fatal(err)
	}
	inst, _ := e.instances.Get(ctx, res.Instance)
	if inst.Game != id || inst.DisplayName != "Farm" || len(inst.Targets) != 1 || inst.Targets[0].Path != `C:\Steam\steamapps\common\Farm\Mods` {
		t.Fatalf("instance = %+v", inst)
	}
	m, _ := e.svc.Details(ctx, inst.ID)
	if !slices.Equal(m.Definition.CreatableTargets, []game.TargetID{"mods"}) {
		t.Fatalf("creatable = %v", m.Definition.CreatableTargets)
	}
	a, _ := e.svc.Registry.Adapter(id)
	if h := a.RootHints(id); !slices.Equal(h.Extensions, []string{".pak"}) {
		t.Fatalf("root hints = %+v", h)
	}
}

// Instances created before D117 belonged to the template game. They get an
// entry of their own; nothing else about them changes.
func TestLegacyCustomInstancesAreMigrated(t *testing.T) {
	e := newEnv()
	legacy := game.Instance{
		ID: "old", Game: "generic", Adapter: "generic", AdapterVersion: "1", DisplayName: "Stardew",
		Root: `C:\Games\Stardew`, Staging: `C:\MO\s\staging`, ArchiveStore: `C:\MO\s\archives`, BackupStore: `C:\MO\s\backups`,
		Targets:         []game.Target{{ID: "mods", Path: `C:\Games\Stardew\Mods`}, {ID: "root", Path: `C:\Games\Stardew`}},
		PreferredMethod: game.MethodHardlink, Store: "manual", Executable: `bin\Stardew.exe`,
		Features: map[game.Capability]bool{game.CapLaunch: false},
	}
	if err := e.instances.Save(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	if n, err := e.svc.MigrateLegacyCustom(ctx); err != nil || n != 1 {
		t.Fatalf("migrated = %d, %v", n, err)
	}
	got, _ := e.instances.Get(ctx, "old")
	if got.Game != "user.stardew" || got.AdapterVersion != "2" {
		t.Fatalf("instance = %+v", got)
	}
	want := legacy
	want.Game, want.AdapterVersion = got.Game, got.AdapterVersion
	if got.Root != want.Root || got.Staging != want.Staging || !slices.Equal(got.Targets, want.Targets) || got.Executable != want.Executable || got.Features[game.CapLaunch] {
		t.Fatalf("migration changed more than the game: %+v", got)
	}
	def, _ := e.svc.Registry.Definition(got.Game)
	if !slices.Equal(def.Targets, []game.TargetID{"mods", "root"}) || !def.Capabilities.Has(game.CapLaunch) {
		t.Fatalf("definition = %+v", def)
	}
	a, _ := e.svc.Registry.Adapter(got.Game)
	targets, err := a.Targets(got.Game, got.Root, nil)
	if err != nil || !slices.Equal(targets, got.Targets) {
		t.Fatalf("the entry resolves to the same targets: %+v, %v", targets, err)
	}
	if n, err := e.svc.MigrateLegacyCustom(ctx); err != nil || n != 0 {
		t.Fatalf("second run = %d, %v", n, err)
	}
	if len(e.fs.Writes) != 0 {
		t.Fatalf("migrating writes nothing on disk: %v", e.fs.Writes)
	}
}

// D129: a target folder that does not exist is a warning; it is created
// only when the user lets the app do it.
func TestMissingTargetsAreCreatedOnlyWhenAllowed(t *testing.T) {
	e := newEnv()
	root := `C:\Games\Fresh`
	e.fs.AddFile(root+`\game.exe`, "")
	su := customSetup("Fresh", root)
	v, err := e.svc.Verify(ctx, su)
	if err != nil || len(v.Problems) != 0 {
		t.Fatalf("verify = %+v, %v", v.Problems, err)
	}
	missing := 0
	for _, w := range v.Warnings {
		if w.Code == games.CodeTargetMissing {
			missing++
		}
	}
	if missing != 2 {
		t.Fatalf("warnings = %+v", v.Warnings)
	}
	if _, err := e.svc.Manage(ctx, su); err != nil {
		t.Fatal(err)
	}
	if info, _ := e.fs.Stat(ctx, root+`\Mods`); info.Exists {
		t.Fatal("a target folder was created without permission")
	}

	other := `D:\Games\Fresh`
	e.fs.AddFile(other+`\game.exe`, "")
	su = customSetup("Fresh 2", other)
	su.CreateTargets = true
	if _, err := e.svc.Manage(ctx, su); err != nil {
		t.Fatal(err)
	}
	if info, _ := e.fs.Stat(ctx, other+`\BepInEx\plugins`); !info.Exists {
		t.Fatal("the allowed target folder was not created")
	}
}
