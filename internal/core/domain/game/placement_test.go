package game

import (
	"errors"
	"testing"
)

func TestPlacementHelpers(t *testing.T) {
	if !SamePath(`C:\Games\X\`, `c:/games/x`) {
		t.Fatal("separators, case and trailing slash must not matter")
	}
	if !Within(`C:\Games\X\Data`, `C:\Games\X`) || Within(`C:\Games\XY`, `C:\Games\X`) {
		t.Fatal("Within must respect folder boundaries")
	}
	if !Overlaps(`C:\A`, `C:\A\B`) || !Overlaps(`C:\A\B`, `C:\A`) || Overlaps(`C:\A`, `C:\B`) {
		t.Fatal("Overlaps must be symmetric containment")
	}
	if Volume(`d:\x`) != "D:" || Volume(`\\Srv\Share\x`) != "//srv/share" || Volume("rel") != "" {
		t.Fatal("unexpected volume")
	}
	if got := JoinPath(`C:\Games`, "Data/meshes", ""); got != `C:\Games\Data\meshes` {
		t.Fatalf("JoinPath = %q", got)
	}
	if got := JoinPath(`\\srv\share`, "x"); got != `\\srv\share\x` {
		t.Fatalf("JoinPath UNC = %q", got)
	}
	rel, err := RelativeTo(`C:\Games\X`, `c:\games\x\Mods\A`)
	if err != nil || rel != "Mods/A" {
		t.Fatalf("RelativeTo = %q, %v", rel, err)
	}
	if _, err := RelativeTo(`C:\Games\X`, `D:\Other`); !errors.Is(err, ErrInvalid) {
		t.Fatal("outside path must be rejected")
	}
}

// INV-LIB-03: the staging is never the game folder, never inside a target,
// and never around one either; the other owned folders follow the same rule.
func TestInstancePlacementINVLIB03(t *testing.T) {
	mutations := map[string]func(*Instance){
		"staging contains target":     func(i *Instance) { i.Staging = `C:\Games` },
		"staging contains game":       func(i *Instance) { i.Staging = `C:\` },
		"archives inside game":        func(i *Instance) { i.ArchiveStore = `C:\Games\X\archives` },
		"backups inside target":       func(i *Instance) { i.BackupStore = `C:\Games\X\Data\backups` },
		"archives contain staging":    func(i *Instance) { i.ArchiveStore = `D:\Staging` },
		"staging equals backup store": func(i *Instance) { i.BackupStore = `D:\Staging\X` },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			i := validInstance()
			mutate(&i)
			if err := i.Validate(); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
}

func TestDetectModType(t *testing.T) {
	d := Definition{ID: "g", Name: "G", Targets: []TargetID{"data", "root"}, ModTypes: []ModType{
		{ID: DefaultModType, Target: "data"},
		{ID: "root", Target: "root", Priority: 10, Detect: []DetectRule{{All: []string{"Root/"}}}},
		{ID: "enb", Target: "root", Priority: 20, Detect: []DetectRule{
			{All: []string{"d3d11.dll", "enbseries.ini"}},
			{All: []string{"d3d11.dll", "enbseries/"}},
		}},
		{ID: "skse", Target: "root", Priority: 30, Detect: []DetectRule{{All: []string{"skse64_loader.exe"}}}},
	}}
	cases := []struct {
		name  string
		paths []string
		want  ModTypeID
	}{
		{"plain", []string{"meshes/a.nif"}, DefaultModType},
		{"root folder", []string{"Root/tool.exe", "meshes/a.nif"}, "root"},
		{"enb by ini", []string{"D3D11.DLL", "enbseries.ini"}, "enb"},
		{"enb by folder", []string{"d3d11.dll", `enbseries\shaders\x.fx`}, "enb"},
		{"dll alone is not enb", []string{"d3d11.dll"}, DefaultModType},
		{"skse wins over root", []string{"skse64_loader.exe", "Root/x.txt"}, "skse"},
	}
	for _, c := range cases {
		if got := d.DetectModType(c.paths); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestResolveCustomTargets(t *testing.T) {
	got, err := ResolveCustomTargets(`C:\Games\Valheim`, []TargetSpec{{ID: "mods", Path: "Mods"}, {ID: "bepinex", Path: `BepInEx/plugins`}, {ID: "main", Path: ""}})
	if err != nil {
		t.Fatal(err)
	}
	want := []Target{{"mods", `C:\Games\Valheim\Mods`}, {"bepinex", `C:\Games\Valheim\BepInEx\plugins`}, {"main", `C:\Games\Valheim`}}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("target %d = %+v, want %+v", i, got[i], want[i])
		}
	}
	bad := map[string][]TargetSpec{
		"none":        nil,
		"bad id":      {{ID: "Mods", Path: "x"}},
		"duplicate":   {{ID: "a", Path: "x"}, {ID: "a", Path: "y"}},
		"same folder": {{ID: "a", Path: "x"}, {ID: "b", Path: "X/"}},
		"escape":      {{ID: "a", Path: "../x"}},
		"absolute":    {{ID: "a", Path: `D:\x`}},
	}
	for name, specs := range bad {
		if _, err := ResolveCustomTargets(`C:\Games\V`, specs); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: expected ErrInvalid, got %v", name, err)
		}
	}
}

func TestForeignClassification(t *testing.T) {
	for _, n := range []string{"vortex.deployment.json", "Vortex.Deployment.Data.json", "skyrim.esm.vortex_backup"} {
		if k, ok := ClassifyTargetEntry(Entry{Name: n}); !ok || k != ForeignVortex {
			t.Errorf("%s must be Vortex", n)
		}
	}
	if _, ok := ClassifyTargetEntry(Entry{Name: "vortex.deployment.json", IsDir: true}); ok {
		t.Error("a folder is not a manifest")
	}
	if _, ok := ClassifyTargetEntry(Entry{Name: "Skyrim.esm"}); ok {
		t.Error("regular game file misclassified")
	}
	if k, ok := ClassifyRoot([]Entry{{Name: "ModOrganizer.ini"}}); !ok || k != ForeignMO2 {
		t.Error("MO2 ini")
	}
	layout := []Entry{{Name: "mods", IsDir: true}, {Name: "Profiles", IsDir: true}, {Name: "overwrite", IsDir: true}}
	if k, ok := ClassifyRoot(layout); !ok || k != ForeignMO2 {
		t.Error("MO2 layout")
	}
	// A generic game may legitimately have a "Mods" folder.
	if _, ok := ClassifyRoot([]Entry{{Name: "Mods", IsDir: true}}); ok {
		t.Error("a Mods folder alone is not MO2")
	}
}

func TestMarkers(t *testing.T) {
	id, err := ParseMarker(NewFolderMarker("staging", "inst-1"))
	if err != nil || id != "inst-1" {
		t.Fatalf("round trip: %q %v", id, err)
	}
	for _, bad := range []string{"", "not json", `{}`, `{"instanceId":""}`} {
		if _, err := ParseMarker([]byte(bad)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%q must be invalid", bad)
		}
	}
}
