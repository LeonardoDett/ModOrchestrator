package skyrimse

import (
	"context"
	"errors"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/testutil/memfs"
)

func TestDefinitionIsValidAndDeclaresCapabilities(t *testing.T) {
	def := Adapter{}.Definitions()[0]
	if err := def.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, c := range []game.Capability{game.CapPlugins, game.CapLoadOrder, game.CapInstaller, game.CapLaunch, game.CapSaveGames} {
		if !def.Capabilities.Has(c) {
			t.Errorf("missing capability %s", c)
		}
	}
	if def.Capabilities.Has(game.CapTools) {
		t.Error("tools is not offered yet (LV4)")
	}
	// Methods: the root-like types exclude symlink (core/12 §3).
	root, _ := def.ModType(ModTypeRoot)
	if root.Allows(game.MethodSymlink) || !root.Allows(game.MethodHardlink) {
		t.Error("root type allows hardlink and copy only")
	}
}

// D113: how the game is found is data of the definition.
func TestDefinitionDeclaresDiscovery(t *testing.T) {
	def := Adapter{}.Definitions()[0]
	d := def.Discovery
	for store, id := range map[string]string{
		game.StoreSteam: "489830", game.StoreGOG: "1711230643",
		game.StoreEpic: "ac82db5035584c7f8a2c548d98c86b2c", game.StoreRegistry: "bethesda",
	} {
		if !d.Matches(store, id) {
			t.Errorf("%s %s is Skyrim SE", store, id)
		}
	}
	if d.Matches(game.StoreSteam, "22330") || d.Matches(game.StoreGOG, "489830") || d.Matches(game.StoreSteam, "") {
		t.Error("another game or another store must not match")
	}
	if !slices.Equal(d.Markers, []string{Executable}) || d.VersionFile != Executable {
		t.Errorf("markers = %v, version file = %q", d.Markers, d.VersionFile)
	}
	if def.SupportLevel() != game.SupportFull {
		t.Errorf("support = %q", def.SupportLevel())
	}
}

func TestValidateRootRefusesWithAReason(t *testing.T) {
	fs := memfs.New("C:")
	fs.AddFile(`C:\Skyrim\SkyrimSE.exe`, "")
	fs.AddDir(`C:\Other`)
	fs.AddFile(`C:\file.txt`, "")
	cases := map[string]game.RootReason{
		`C:\Missing`:  game.RootNotFound,
		`C:\file.txt`: game.RootNotDirectory,
		`C:\Other`:    game.RootMarkerMissing,
	}
	for path, want := range cases {
		err := Adapter{}.ValidateRoot(context.Background(), fs, GameID, path)
		var re *game.RootError
		if !errors.As(err, &re) || re.Reason != want || !errors.Is(err, game.ErrRootInvalid) {
			t.Errorf("%s: got %v, want reason %s", path, err, want)
		}
		if want == game.RootMarkerMissing && re.Marker != Executable {
			t.Errorf("marker = %q", re.Marker)
		}
	}
	if err := (Adapter{}).ValidateRoot(context.Background(), fs, GameID, `C:\Skyrim`); err != nil {
		t.Fatal(err)
	}
}

func TestTargets(t *testing.T) {
	got, _ := Adapter{}.Targets(GameID, `C:\Skyrim`, nil)
	want := []game.Target{{ID: "data", Path: `C:\Skyrim\Data`}, {ID: "root", Path: `C:\Skyrim`}}
	if !slices.Equal(got, want) {
		t.Fatalf("targets = %+v", got)
	}
}

func TestModTypeDetection(t *testing.T) {
	def := Adapter{}.Definitions()[0]
	if got := def.DetectModType([]string{"skse64_loader.exe", "skse64_1_6_1170.dll", "Data/scripts/skse.pex"}); got != ModTypeSKSE {
		t.Errorf("skse = %q", got)
	}
	if got := def.DetectModType([]string{"d3d11.dll", "enbseries/enbeffect.fx"}); got != ModTypeENB {
		t.Errorf("enb = %q", got)
	}
	if got := def.DetectModType([]string{"Root/tool.exe"}); got != ModTypeRoot {
		t.Errorf("root = %q", got)
	}
	if got := def.DetectModType([]string{"meshes/x.nif", "x.esp"}); got != game.DefaultModType {
		t.Errorf("default = %q", got)
	}
}

func loc(target game.TargetID, p string) game.Location {
	return game.Location{Target: target, Path: relpath.MustParse(p)}
}

func TestContentFlags(t *testing.T) {
	foot := []game.Location{
		loc("data", "MyMod.esp"), loc("data", "MyMod.bsa"), loc("data", "textures/a.dds"),
		loc("data", "meshes/actors/character/behaviors/x.hkx"), loc("data", "scripts/a.pex"),
		loc("data", "SKSE/Plugins/plug.dll"), loc("data", "sound/fx/a.xwm"),
		loc("root", "Data/interface/a.swf"), loc("root", "skse64_loader.exe"), loc("root", "enbseries.ini"),
		loc("data", "CalienteTools/BodySlide/x.osp"), loc("data", "strings/a.strings"), loc("data", "MyMod.ini"),
	}
	got := Adapter{}.ContentFlags(GameID, foot)
	want := []mod.ContentFlag{FlagPlugin, FlagArchive, FlagTextures, FlagMeshes, FlagAnimations, FlagScripts, FlagSKSEPlugin,
		FlagSounds, FlagInterface, FlagSKSERuntime, FlagENB, FlagBodySlide, FlagStrings, FlagINI}
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("flags = %v\nwant    %v", got, want)
	}
	// A nested .esp is not a loadable plugin (core/12 §5).
	if slices.Contains(Adapter{}.ContentFlags(GameID, []game.Location{loc("data", "extras/x.esp")}), FlagPlugin) {
		t.Error("plugins must be at the top of Data")
	}
}

func TestRootHintsCoverSpec(t *testing.T) {
	h := Adapter{}.RootHints(GameID)
	for _, d := range []string{"meshes", "textures", "skse", "netscriptframework"} {
		if !slices.Contains(h.Dirs, d) {
			t.Errorf("missing dir hint %s", d)
		}
	}
	if !slices.Contains(h.Extensions, ".esl") {
		t.Error("missing .esl")
	}
}
