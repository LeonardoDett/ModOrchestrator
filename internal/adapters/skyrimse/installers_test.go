package skyrimse

import (
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
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

func TestSKSERuntimeInstaller(t *testing.T) {
	es := inspect(t,
		"skse64_2_02_06/skse64_loader.exe", "skse64_2_02_06/skse64_1_6_1170.dll", "skse64_2_02_06/skse64_readme.txt",
		"skse64_2_02_06/Data/Scripts/Actor.pex", "skse64_2_02_06/src/skse64/main.cpp",
	)
	a := Adapter{}
	def := a.Definitions()[0]
	ctx := installer.Context{Definition: def, Hints: installer.RootHints(a.RootHints(GameID))}
	sel, err := installer.Select(append(a.Installers(GameID), installer.Basic{}), es, ctx, "")
	if err != nil || sel.Installer.ID() != SKSERuntimeID {
		t.Fatalf("select = %v %v", sel, err)
	}
	res, err := sel.Installer.Plan(es, ctx, nil)
	if err != nil || res.Plan == nil {
		t.Fatal(err)
	}
	var dests []string
	for _, f := range res.Plan.Files {
		dests = append(dests, f.Dest.String())
	}
	if !slices.Equal(dests, []string{"Data/Scripts/Actor.pex", "skse64_1_6_1170.dll", "skse64_loader.exe"}) {
		t.Fatalf("dests = %v", dests)
	}
	if res.Plan.ModType != ModTypeSKSE {
		t.Fatalf("type = %s", res.Plan.ModType)
	}
	flags := a.ContentFlags(GameID, res.Plan.Locations(TargetRoot))
	if !slices.Contains(flags, FlagSKSERuntime) || !slices.Contains(flags, FlagScripts) {
		t.Fatalf("flags = %v", flags)
	}
}

func TestENBIsDetectedByTheBasicInstaller(t *testing.T) {
	es := inspect(t, "Preset/d3d11.dll", "Preset/enbseries.ini", "Preset/enbseries/effect.fx", "Preset/readme.txt")
	a := Adapter{}
	ctx := installer.Context{Definition: a.Definitions()[0], Hints: installer.RootHints(a.RootHints(GameID))}
	sel, _ := installer.Select(append(a.Installers(GameID), installer.Basic{}), es, ctx, "")
	res, err := sel.Installer.Plan(es, ctx, nil)
	if err != nil || res.Plan == nil || res.Plan.ModType != ModTypeENB {
		t.Fatalf("plan = %+v %v", res, err)
	}
	if flags := a.ContentFlags(GameID, res.Plan.Locations(TargetRoot)); !slices.Contains(flags, mod.ContentFlag(FlagENB)) {
		t.Fatalf("flags = %v", flags)
	}
}

func TestDefaultCategoriesFormATree(t *testing.T) {
	keys := map[string]bool{}
	for _, c := range (Adapter{}).DefaultCategories(GameID) {
		if c.Parent != "" && !keys[c.Parent] {
			t.Fatalf("%s refers to %s before it is declared", c.Key, c.Parent)
		}
		keys[c.Key] = true
	}
}
