package game

import (
	"errors"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/relpath"
)

func validInstance() Instance {
	return Instance{
		ID: "i1", Game: "g1", Adapter: "generic", Root: `C:\Games\X`, Staging: `D:\Staging\X`,
		Targets:         []Target{{ID: "data", Path: `C:\Games\X\Data`}},
		PreferredMethod: MethodHardlink,
		ArchiveStore:    `D:\MO\X\archives`, BackupStore: `C:\MO\X\backups`,
	}
}

func TestCapabilitiesAreASet(t *testing.T) {
	d, err := NewDefinition("g1", "Game", CapPlugins, CapLoadOrder, CapPlugins)
	if err != nil {
		t.Fatal(err)
	}
	if !d.Capabilities.Has(CapPlugins) || d.Capabilities.Has(CapSaveGames) {
		t.Fatal("unexpected capability membership")
	}
	if got := d.Capabilities.List(); !slices.Equal(got, []Capability{CapLoadOrder, CapPlugins}) {
		t.Fatalf("List = %v", got)
	}
	if _, err := NewDefinition("", "x"); !errors.Is(err, ErrInvalid) {
		t.Fatal("definition without id must be rejected")
	}
}

func TestInstanceValidation(t *testing.T) {
	if err := validInstance().Validate(); err != nil {
		t.Fatal(err)
	}
	mutations := map[string]func(*Instance){
		"no staging":       func(i *Instance) { i.Staging = "" },
		"no targets":       func(i *Instance) { i.Targets = nil },
		"duplicate target": func(i *Instance) { i.Targets = append(i.Targets, i.Targets[0]) },
		"unknown method":   func(i *Instance) { i.PreferredMethod = "magic" },
		"no adapter":       func(i *Instance) { i.Adapter = "" },
		"no archive store": func(i *Instance) { i.ArchiveStore = "" },
		"no backup store":  func(i *Instance) { i.BackupStore = "" },
		"staging is root":  func(i *Instance) { i.Staging = `c:/games/x/` },
		"staging in data":  func(i *Instance) { i.Staging = `C:\Games\X\Data\mods` },
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

func TestLocationKeyIgnoresPathCase(t *testing.T) {
	a := Location{Target: "data", Path: relpath.MustParse("Meshes/A.nif")}
	b := Location{Target: "data", Path: relpath.MustParse("meshes/a.NIF")}
	c := Location{Target: "root", Path: relpath.MustParse("meshes/a.nif")}
	if a.Key() != b.Key() {
		t.Fatal("same target + same path must share identity")
	}
	if a.Key() == c.Key() {
		t.Fatal("different targets must not share identity")
	}
	if (Location{Target: "data"}).Validate() == nil {
		t.Fatal("location without path must be invalid")
	}
}

func TestDefinitionModTypes(t *testing.T) {
	d, _ := NewDefinition("g1", "Game")
	d.Targets = []TargetID{"data", "root"}
	d.ModTypes = []ModType{
		{ID: DefaultModType, Target: "data"},
		{ID: "root", Target: "root", Methods: []DeploymentMethod{MethodHardlink, MethodCopy}},
	}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	rt, ok := d.ModType("root")
	if !ok || rt.Allows(MethodSymlink) || !rt.Allows(MethodCopy) {
		t.Fatalf("root type methods not honoured: %+v", rt)
	}
	if def, _ := d.ModType(DefaultModType); !def.Allows(MethodSymlink) {
		t.Fatal("no restriction means every method")
	}
	bad := map[string]func(*Definition){
		"no default":     func(d *Definition) { d.ModTypes = d.ModTypes[1:] },
		"unknown target": func(d *Definition) { d.ModTypes[1].Target = "nope" },
		"duplicate":      func(d *Definition) { d.ModTypes[1].ID = DefaultModType },
		"no targets":     func(d *Definition) { d.Targets = nil },
	}
	for name, mutate := range bad {
		t.Run(name, func(t *testing.T) {
			c := d
			c.ModTypes = slices.Clone(d.ModTypes)
			mutate(&c)
			if err := c.Validate(); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
}
