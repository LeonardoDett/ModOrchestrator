package diagnostic

import (
	"errors"
	"testing"
)

// D131: the catalog in effect is the core's plus the declared codes; the
// zero value is the core's.
func TestCatalogAddsDeclaredCodes(t *testing.T) {
	var zero Catalog
	if zero.ModuleOf(CodeRuleCycle) != ModuleRules || !zero.WarnsBeforeLaunch(CodeFrameworkMissing) || zero.Has("loader_outdated") {
		t.Error("the zero catalog is the core's")
	}
	c, err := NewCatalog(CodeSpec{Code: "loader_outdated", Module: ModuleGame})
	if err != nil {
		t.Fatal(err)
	}
	if !c.Has("loader_outdated") || c.ModuleOf("loader_outdated") != ModuleGame || c.WarnsBeforeLaunch("loader_outdated") {
		t.Errorf("declared code: %+v", c)
	}
	if len(c.Codes()) != len(CoreCodes())+1 || len(zero.Codes()) != len(CoreCodes()) {
		t.Errorf("codes: %d, core %d", len(c.Codes()), len(CoreCodes()))
	}
	if c.ModuleOf("unknown") != "" {
		t.Error("an unknown code has no module")
	}
}

func TestCatalogRefusesBadCodes(t *testing.T) {
	for _, s := range []CodeSpec{
		{Code: "Loader Outdated", Module: ModuleGame},
		{Code: "", Module: ModuleGame},
		{Code: "loader_outdated", Module: "saves"},
		{Code: CodeFrameworkMissing, Module: ModuleGame},
	} {
		if _, err := NewCatalog(s); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v: %v", s, err)
		}
	}
	if _, err := NewCatalog(CodeSpec{Code: "a_b", Module: ModuleApp}, CodeSpec{Code: "a_b", Module: ModuleApp}); err == nil {
		t.Error("a code declared twice must be refused")
	}
}
