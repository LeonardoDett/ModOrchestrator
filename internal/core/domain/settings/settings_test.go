package settings

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

func TestCatalogIsConsistent(t *testing.T) {
	if _, err := NewCatalog(); err != nil {
		t.Fatal(err)
	}
	if _, ok := Core().Lookup("profiles.enabled"); ok {
		t.Fatal("profiles are always on (D037)")
	}
	for _, d := range Core().Available(V2) {
		if strings.HasPrefix(d.Key, "plugins.") {
			t.Errorf("%s belongs to the plugins module (D135)", d.Key)
		}
	}
	got := []Tab{}
	for _, tab := range Core().Tabs(V1) {
		got = append(got, tab.ID)
	}
	if want := []Tab{TabInterface, TabApplication, TabMods, TabWorkarounds, TabTheme}; !slices.Equal(got, want) {
		t.Fatalf("core tabs %v, want %v", got, want)
	}
}

func TestContributionAddsATabInPlace(t *testing.T) {
	c, err := NewCatalog(Contribution{
		Tabs: []TabDef{{ID: "extra", After: TabMods, Section: "settings.extra"}, {ID: "later", After: TabTheme}},
		Defs: []Def{
			{Key: "extra.flag", Scope: ScopeInstance, Type: TypeBool, Tab: "extra", Release: V1, Default: "true"},
			{Key: "later.flag", Scope: ScopeInstance, Type: TypeBool, Tab: "later", Release: V1x, Default: "true"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := []Tab{}
	for _, tab := range c.Tabs(V1) {
		got = append(got, tab.ID)
	}
	if want := []Tab{TabInterface, TabApplication, TabMods, "extra", TabWorkarounds, TabTheme}; !slices.Equal(got, want) {
		t.Fatalf("tabs %v, want %v (a tab with only reserved settings is hidden)", got, want)
	}
	if _, err := c.NewValue(ScopeInstance, "i1", "extra.flag", "false"); err != nil {
		t.Fatal(err)
	}
	if _, err := Core().NewValue(ScopeInstance, "i1", "extra.flag", "false"); !errors.Is(err, ErrInvalid) {
		t.Fatal("a contributed key is unknown to the core catalog")
	}
}

func TestContributionIsChecked(t *testing.T) {
	flag := func(key string, tab Tab) Def {
		return Def{Key: key, Scope: ScopeInstance, Type: TypeBool, Tab: tab, Release: V1, Default: "true"}
	}
	bad := map[string]Contribution{
		"core key":      {Defs: []Def{flag("deploy.cleanEmptyDirs", TabMods)}},
		"repeated key":  {Tabs: []TabDef{{ID: "x", After: TabMods}}, Defs: []Def{flag("x.a", "x"), flag("x.a", "x")}},
		"unknown tab":   {Defs: []Def{flag("x.a", "x")}},
		"core tab":      {Tabs: []TabDef{{ID: TabMods, After: TabInterface}}},
		"reserved tab":  {Tabs: []TabDef{{ID: TabDownload, After: TabMods}}},
		"unknown after": {Tabs: []TabDef{{ID: "x", After: "nope"}}},
		"bad default":   {Tabs: []TabDef{{ID: "x", After: TabMods}}, Defs: []Def{{Key: "x.a", Scope: ScopeApp, Type: TypeBool, Tab: "x", Release: V1, Default: "yes"}}},
		"both defaults": {Tabs: []TabDef{{ID: "x", After: TabMods}}, Defs: []Def{{Key: "x.a", Scope: ScopeApp, Type: TypeBool, Tab: "x", Release: V1, Default: "true", DerivedDefault: true}}},
	}
	for name, k := range bad {
		if _, err := NewCatalog(k); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: expected ErrInvalid, got %v", name, err)
		}
	}
}

func TestReservedSettingsAreHidden(t *testing.T) {
	for _, d := range Core().Available(V1) {
		if d.Release != V1 || d.Tab == TabDownload {
			t.Errorf("%s must not be shown in V1", d.Key)
		}
	}
}

func TestNewValue(t *testing.T) {
	if _, err := Core().NewValue(ScopeInstance, "i1", "deploy.method", "hardlink"); err != nil {
		t.Fatal(err)
	}
	bad := map[string]func() error{
		"unknown key":  func() error { _, err := Core().NewValue(ScopeApp, "", "nope", "1"); return err },
		"wrong scope":  func() error { _, err := Core().NewValue(ScopeApp, "", "deploy.method", "copy"); return err },
		"missing id":   func() error { _, err := Core().NewValue(ScopeInstance, "", "deploy.method", "copy"); return err },
		"bad enum":     func() error { _, err := Core().NewValue(ScopeInstance, "i1", "deploy.method", "move"); return err },
		"out of range": func() error { _, err := Core().NewValue(ScopeApp, "", "theme.fontScale", "200"); return err },
		"bad bool":     func() error { _, err := Core().NewValue(ScopeApp, "", "ui.advancedMode", "yes"); return err },
	}
	for name, f := range bad {
		if err := f(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: expected ErrInvalid, got %v", name, err)
		}
	}
}

func TestListSetting(t *testing.T) {
	opts := []string{"a", "b", "c"}
	items, err := ParseList("c,-a", opts)
	if err != nil {
		t.Fatal(err)
	}
	want := []ListItem{{ID: "c"}, {ID: "a", Mode: ListHidden}, {ID: "b"}}
	if len(items) != len(want) {
		t.Fatalf("got %v", items)
	}
	for i := range want {
		if items[i] != want[i] {
			t.Fatalf("got %v, want %v", items, want)
		}
	}
	if FormatList(items) != "c,-a,b" {
		t.Fatalf("format: %s", FormatList(items))
	}
	for _, bad := range []string{"x", "a,a", "-a,+a"} {
		if _, err := ParseList(bad, opts); err == nil {
			t.Errorf("%q must be refused", bad)
		}
	}
	d, _ := Core().Lookup("ui.dashboard.dashlets")
	if err := d.Validate("+first_steps,-whats_new"); err != nil {
		t.Fatal(err)
	}
}
