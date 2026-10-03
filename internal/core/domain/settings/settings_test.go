package settings

import (
	"errors"
	"testing"
)

func TestCatalogIsConsistent(t *testing.T) {
	seen := map[string]bool{}
	for _, d := range Catalog {
		if seen[d.Key] {
			t.Errorf("%s declared twice", d.Key)
		}
		seen[d.Key] = true
		if !d.DerivedDefault {
			if err := d.Validate(d.Default); err != nil {
				t.Errorf("default of %s is invalid: %v", d.Key, err)
			}
		} else if d.Default != "" {
			t.Errorf("%s has a derived default and a literal one", d.Key)
		}
	}
	if _, ok := Lookup("profiles.enabled"); ok {
		t.Fatal("profiles are always on (D037)")
	}
}

func TestReservedSettingsAreHidden(t *testing.T) {
	for _, d := range Available(V1) {
		if d.Release != V1 || d.Tab == TabDownload {
			t.Errorf("%s must not be shown in V1", d.Key)
		}
	}
}

func TestNewValue(t *testing.T) {
	if _, err := NewValue(ScopeInstance, "i1", "deploy.method", "hardlink"); err != nil {
		t.Fatal(err)
	}
	bad := map[string]func() error{
		"unknown key":  func() error { _, err := NewValue(ScopeApp, "", "nope", "1"); return err },
		"wrong scope":  func() error { _, err := NewValue(ScopeApp, "", "deploy.method", "copy"); return err },
		"missing id":   func() error { _, err := NewValue(ScopeInstance, "", "deploy.method", "copy"); return err },
		"bad enum":     func() error { _, err := NewValue(ScopeInstance, "i1", "deploy.method", "move"); return err },
		"out of range": func() error { _, err := NewValue(ScopeApp, "", "theme.fontScale", "200"); return err },
		"bad bool":     func() error { _, err := NewValue(ScopeApp, "", "ui.advancedMode", "yes"); return err },
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
	d, _ := Lookup("ui.dashboard.dashlets")
	if err := d.Validate("+first_steps,-whats_new"); err != nil {
		t.Fatal(err)
	}
}
