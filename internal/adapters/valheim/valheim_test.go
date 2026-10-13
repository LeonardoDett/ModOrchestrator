package valheim

import (
	"context"
	"io"
	"slices"
	"strings"
	"testing"

	"modorchestrator/internal/adapters/generic"
	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

func inspect(t *testing.T, paths ...string) []installer.Entry {
	t.Helper()
	raw := make([]installer.RawEntry, len(paths))
	for i, p := range paths {
		raw[i] = installer.RawEntry{Path: p, Size: 1}
	}
	es, unsafe := installer.Inspect(raw)
	if len(unsafe) > 0 {
		t.Fatal(unsafe)
	}
	return es
}

func plan(t *testing.T, content map[string]string, paths ...string) *installer.Plan {
	t.Helper()
	a := Adapter{}
	ctx := installer.Context{Definition: a.Definitions()[0], Hints: installer.RootHints(a.RootHints(GameID))}
	if content != nil {
		ctx.Content = func(p relpath.Path) ([]byte, error) {
			if c, ok := content[p.String()]; ok {
				return []byte(c), nil
			}
			return nil, io.EOF
		}
	}
	es := inspect(t, paths...)
	sel, err := installer.Select(append(a.Installers(GameID), installer.Basic{}), es, ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	res, err := sel.Installer.Plan(es, ctx, nil)
	if err != nil || res.Plan == nil {
		t.Fatalf("%s: %v %+v", sel.Installer.ID(), err, res.Decision)
	}
	return res.Plan
}

func dests(p *installer.Plan) []string {
	var out []string
	for _, f := range p.Files {
		out = append(out, f.Dest.String())
	}
	return out
}

// D114: the second game has no plugins and no load order, and the registry
// takes it next to the others: every capability it declares has its
// contract, and nothing it implements goes undeclared (D112).
func TestDefinitionRegistersWithoutPlugins(t *testing.T) {
	r, err := games.NewRegistry(generic.Adapter{}, skyrimse.Adapter{}, Adapter{})
	if err != nil {
		t.Fatal(err)
	}
	def, _ := r.Definition(GameID)
	if def.Capabilities.Has(game.CapPlugins) || def.Capabilities.Has(game.CapLoadOrder) {
		t.Fatalf("capabilities %v", def.Capabilities.List())
	}
	items := games.WorkspaceItems(def.Capabilities)
	if slices.Contains(items, games.ItemPlugins) || slices.Contains(items, games.ItemLoadOrder) {
		t.Fatalf("workspace %v", items)
	}
	if !def.Discovery.Matches(game.StoreSteam, "892970") {
		t.Fatal("the Steam installation must be recognised")
	}
	var a ports.GameAdapter = Adapter{}
	if _, ok := a.(ports.PluginSupport); ok {
		t.Fatal("the adapter must not implement plugin support")
	}
}

func TestPackageIsRoutedToTheFrameworkFolders(t *testing.T) {
	// A manifest saved with a byte order mark, as real packages are.
	manifest := map[string]string{"manifest.json": "\xef\xbb\xbf" + `{"name":"Custom_Raids","version_number":"1.8.1","dependencies":[]}`}
	p := plan(t, manifest,
		"manifest.json", "icon.png", "README.md", "Valheim.CustomRaids.dll",
		"plugins/Extra.dll", "patchers/Patch.dll", "config/custom.cfg", "BepInEx/plugins/Deep/Asset.bundle",
	)
	if p.Installer != PackageID || p.ModType != game.DefaultModType {
		t.Fatalf("installer %s type %s", p.Installer, p.ModType)
	}
	want := []string{
		"config/custom.cfg",
		"patchers/Custom_Raids/Patch.dll",
		"plugins/Custom_Raids/Deep/Asset.bundle",
		"plugins/Custom_Raids/Extra.dll",
		"plugins/Custom_Raids/icon.png",
		"plugins/Custom_Raids/manifest.json",
		"plugins/Custom_Raids/README.md",
		"plugins/Custom_Raids/Valheim.CustomRaids.dll",
	}
	if got := dests(p); !slices.Equal(got, want) {
		t.Fatalf("dests\n got %v\nwant %v", got, want)
	}
	if p.Options[OptionFolder] != "Custom_Raids" {
		t.Fatalf("options %v", p.Options)
	}
	// The manifest names the mod (D118), not the archive.
	if p.Metadata.Name != "Custom Raids" || p.Metadata.Version != "1.8.1" {
		t.Fatalf("metadata %+v", p.Metadata)
	}
	flags := Adapter{}.ContentFlags(GameID, p.Locations(TargetBepInEx))
	if !slices.Equal(flags, []mod.ContentFlag{FlagConfig, FlagPatcher, FlagPlugin}) {
		t.Fatalf("flags %v", flags)
	}
}

// Without the extracted manifest the folder comes from the DLL, and a
// reinstall keeps the recorded folder.
func TestPackageFolderFallbackAndReinstall(t *testing.T) {
	p := plan(t, nil, "manifest.json", "My Mod.dll")
	if got := dests(p); !slices.Equal(got, []string{"plugins/My_Mod/manifest.json", "plugins/My_Mod/My Mod.dll"}) {
		t.Fatalf("dests %v", got)
	}
	a := Adapter{}
	es := inspect(t, "manifest.json", "My Mod.dll")
	res, err := Package{}.Plan(es, installer.Context{Definition: a.Definitions()[0]}, installer.Options{OptionFolder: "Kept"})
	if err != nil || !strings.HasPrefix(res.Plan.Files[0].Dest.String(), "plugins/Kept/") {
		t.Fatalf("reinstall %v %v", res.Plan, err)
	}
}

func TestLoaderPackGoesToTheGameRoot(t *testing.T) {
	p := plan(t, nil,
		"manifest.json", "icon.png", "README.md",
		"BepInExPack_Valheim/winhttp.dll", "BepInExPack_Valheim/doorstop_config.ini",
		"BepInExPack_Valheim/BepInEx/core/BepInEx.Preloader.dll", "BepInExPack_Valheim/doorstop_libs/libdoorstop.so",
	)
	if p.Installer != LoaderPackID || p.ModType != ModTypeLoader {
		t.Fatalf("installer %s type %s", p.Installer, p.ModType)
	}
	want := []string{"BepInEx/core/BepInEx.Preloader.dll", "doorstop_config.ini", "doorstop_libs/libdoorstop.so", "winhttp.dll"}
	if got := dests(p); !slices.Equal(got, want) {
		t.Fatalf("dests %v", got)
	}
	a := Adapter{}
	if flags := a.ContentFlags(GameID, p.Locations(TargetRoot)); !slices.Equal(flags, []mod.ContentFlag{FlagRuntime}) {
		t.Fatalf("flags %v", flags)
	}
	if mt := a.Definitions()[0].DetectModType(dests(p)); mt != ModTypeLoader {
		t.Fatalf("detected type %s", mt)
	}
}

// A loose DLL would not load from the framework folder itself: it is
// grouped below plugins/, without its wrapper folder.
func TestLooseDLLGoesToPlugins(t *testing.T) {
	p := plan(t, nil, "SomeMod v1/SomeMod.dll", "SomeMod v1/readme.txt")
	if p.Installer != LoosePluginID {
		t.Fatalf("installer %s", p.Installer)
	}
	if got := dests(p); !slices.Equal(got, []string{"plugins/SomeMod/readme.txt", "plugins/SomeMod/SomeMod.dll"}) {
		t.Fatalf("dests %v", got)
	}
}

// An archive already in the framework layout is left to the basic
// installer, which finds its root by the adapter's hints.
func TestFrameworkLayoutUsesTheBasicInstaller(t *testing.T) {
	p := plan(t, nil, "Wrap/BepInEx/plugins/A/A.dll", "Wrap/BepInEx/config/a.cfg")
	if p.Installer != installer.BasicID {
		t.Fatalf("installer %s", p.Installer)
	}
	if got := dests(p); !slices.Equal(got, []string{"config/a.cfg", "plugins/A/A.dll"}) {
		t.Fatalf("dests %v", got)
	}
}

type fakeFS map[string]bool

func (f fakeFS) Stat(_ context.Context, p string) (ports.FileInfo, error) {
	return ports.FileInfo{Exists: f[strings.ReplaceAll(p, `\`, "/")]}, nil
}
func (fakeFS) ReadDir(context.Context, string) ([]ports.DirEntry, error) { return nil, nil }
func (fakeFS) Open(context.Context, string) (io.ReadCloser, error)       { return nil, io.EOF }

func TestFrameworkMissing(t *testing.T) {
	a := Adapter{}
	inst := game.Instance{ID: "i", Root: "C:/Game"}
	user := ports.ModContent{ID: "m", Name: "Mod", Type: game.DefaultModType, Content: []mod.ContentFlag{FlagPlugin}, Enabled: true}
	check := func(fs fakeFS, mods ...ports.ModContent) []diagnostic.Spec {
		t.Helper()
		out, err := a.HealthChecks(context.Background(), fs, inst, mods)
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	// The proxy alone (left by another manager) is not the framework.
	got := check(fakeFS{"C:/Game/winhttp.dll": true}, user)
	if len(got) != 1 || got[0].Code != diagnostic.CodeFrameworkMissing || got[0].Params["framework"] != "BepInEx" {
		t.Fatalf("proxy only: %+v", got)
	}
	if _, err := diagnostic.New(got[0]); err != nil {
		t.Fatalf("the diagnostic must be valid: %v", err)
	}
	if got := check(fakeFS{"C:/Game/winhttp.dll": true, "C:/Game/BepInEx/core/BepInEx.Preloader.dll": true}, user); len(got) != 0 {
		t.Fatalf("framework present: %+v", got)
	}
	loader := ports.ModContent{ID: "l", Name: "Pack", Type: ModTypeLoader, Enabled: true}
	if got := check(fakeFS{}, user, loader); len(got) != 0 {
		t.Fatalf("framework managed: %+v", got)
	}
	disabled := user
	disabled.Enabled = false
	if got := check(fakeFS{}, disabled); len(got) != 0 {
		t.Fatalf("no enabled user: %+v", got)
	}
}
