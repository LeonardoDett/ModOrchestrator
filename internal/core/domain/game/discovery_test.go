package game

import (
	"errors"
	"testing"
)

func discoverable() Definition {
	return Definition{
		ID: "g1", Name: "Game", Capabilities: NewCapabilities(CapFilesystemTarget),
		Targets:  []TargetID{"main"},
		ModTypes: []ModType{{ID: DefaultModType, Name: "Default", Target: "main"}},
	}
}

func TestDiscoveryMatchesStoresAndRegistryHints(t *testing.T) {
	d := Discovery{
		Stores:   []StoreRef{{Store: StoreSteam, AppID: "1"}, {Store: StoreGOG, AppID: "2"}},
		Registry: []RegistryHint{{ID: "hint", Key: `HKLM\SOFTWARE\X`, Value: "path"}},
	}
	for _, c := range []struct {
		store, id string
		want      bool
	}{
		{StoreSteam, "1", true}, {StoreGOG, "2", true}, {StoreRegistry, "hint", true},
		{StoreSteam, "2", false}, {StoreEpic, "1", false}, {StoreRegistry, "1", false},
		{StoreSteam, "", false}, {StoreRegistry, "", false},
	} {
		if got := d.Matches(c.store, c.id); got != c.want {
			t.Errorf("Matches(%q, %q) = %v", c.store, c.id, got)
		}
	}
	if (Discovery{}).Matches(StoreSteam, "1") {
		t.Error("a game with no discovery is never found")
	}
}

func TestDefinitionValidatesDiscoveryAndSupport(t *testing.T) {
	ok := discoverable()
	ok.Support = SupportDeclared
	ok.Discovery = Discovery{
		Stores:  []StoreRef{{Store: StoreSteam, AppID: "1"}},
		Markers: []string{"Game.exe", "bin/Game.exe"}, VersionFile: "Game.exe",
	}
	if err := ok.Validate(); err != nil {
		t.Fatal(err)
	}
	bad := map[string]func(*Definition){
		"unknown support":     func(d *Definition) { d.Support = "partial" },
		"store without id":    func(d *Definition) { d.Discovery.Stores = []StoreRef{{Store: StoreSteam}} },
		"registry as a store": func(d *Definition) { d.Discovery.Stores = []StoreRef{{Store: StoreRegistry, AppID: "x"}} },
		"hint without key":    func(d *Definition) { d.Discovery.Registry = []RegistryHint{{ID: "a"}} },
		"hint twice": func(d *Definition) {
			d.Discovery.Registry = []RegistryHint{{ID: "a", Key: "k"}, {ID: "a", Key: "k"}}
		},
		"absolute marker":       func(d *Definition) { d.Discovery.Markers = []string{`C:\Game\Game.exe`} },
		"marker outside":        func(d *Definition) { d.Discovery.Markers = []string{"../Game.exe"} },
		"empty marker":          func(d *Definition) { d.Discovery.Markers = []string{""} },
		"absolute version file": func(d *Definition) { d.Discovery.VersionFile = `\Game.exe` },
	}
	for name, change := range bad {
		d := discoverable()
		change(&d)
		if err := d.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
}

func TestSupportLevelIsImpliedWhenNotDeclared(t *testing.T) {
	d := discoverable()
	if d.SupportLevel() != SupportFull {
		t.Errorf("fixed game = %q", d.SupportLevel())
	}
	d.CustomTargets = true
	if d.SupportLevel() != SupportCustom {
		t.Errorf("custom targets = %q", d.SupportLevel())
	}
	d.Support = SupportDeclared
	if d.SupportLevel() != SupportDeclared {
		t.Errorf("declared = %q", d.SupportLevel())
	}
}

// D113: every capability of the catalog has a class; protections and what
// managing a game needs are never optional.
func TestDescribeClassifiesTheCatalog(t *testing.T) {
	optional := map[Capability]bool{
		CapPlugins: true, CapLoadOrder: true, CapLaunch: true,
		CapSaveGames: true, CapGameSettings: true, CapTools: true,
	}
	for _, c := range Catalog() {
		spec := Describe(c)
		want := ClassBase
		if optional[c] {
			want = ClassOptional
		}
		if spec.ID != c || spec.Class != want {
			t.Errorf("%s = %+v, want class %s", c, spec, want)
		}
		for _, r := range spec.Requires {
			if Describe(r).Class != ClassOptional {
				t.Errorf("%s requires %s, which cannot be turned on", c, r)
			}
		}
	}
	if r := Describe(CapLoadOrder).Requires; len(r) != 1 || r[0] != CapPlugins {
		t.Errorf("load_order requires %v", r)
	}
	if Describe("ext.something").Class != ClassOptional {
		t.Error("a capability of an extension is optional")
	}
}

func TestDefinitionRefusesAFeatureWithoutWhatItRequires(t *testing.T) {
	d := discoverable()
	d.Capabilities = NewCapabilities(CapLoadOrder)
	if err := d.Validate(); !errors.Is(err, ErrInvalid) {
		t.Fatalf("err = %v", err)
	}
	d.Capabilities = NewCapabilities(CapLoadOrder, CapPlugins)
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
}

// D115: what is in effect is what the game offers, minus what the user
// turned off and what depends on it; it never exceeds what is offered and
// a base feature cannot be turned off.
func TestEffectiveCapabilities(t *testing.T) {
	d := discoverable()
	d.Capabilities = NewCapabilities(CapFilesystemTarget, CapExternalChanges, CapPlugins, CapLoadOrder, CapLaunch)
	has := func(choices map[Capability]bool, c Capability) bool {
		return d.Effective(choices).Capabilities.Has(c)
	}
	if e := d.Effective(nil); len(e.Capabilities.List()) != 5 {
		t.Fatalf("no choice keeps everything: %v", e.Capabilities.List())
	}
	off := map[Capability]bool{CapPlugins: false}
	if has(off, CapPlugins) || has(off, CapLoadOrder) || !has(off, CapLaunch) {
		t.Error("plugins off takes load order with it and nothing else")
	}
	off = map[Capability]bool{CapLoadOrder: false}
	if !has(off, CapPlugins) || has(off, CapLoadOrder) {
		t.Error("load order off keeps plugins")
	}
	if !has(map[Capability]bool{CapExternalChanges: false, CapFilesystemTarget: false}, CapExternalChanges) {
		t.Error("a base feature cannot be turned off")
	}
	if has(map[Capability]bool{CapSaveGames: true}, CapSaveGames) {
		t.Error("a choice never adds what the game does not offer")
	}
	if !d.Capabilities.Has(CapPlugins) {
		t.Error("Effective must not change the definition it was called on")
	}
}
