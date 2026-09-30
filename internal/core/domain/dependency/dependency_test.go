package dependency

import (
	"errors"
	"testing"

	"modorchestrator/internal/core/domain/event"
)

func dep(kind Kind, target string, optional bool) Dependency {
	return Dependency{ID: "d1", Source: event.EntityRef{Kind: "mod", ID: "m1"}, Kind: kind, Target: target, Optional: optional}
}

func TestValidate(t *testing.T) {
	if err := dep(KindFile, "SKSE/plugins/x.dll", false).Validate(); err != nil {
		t.Fatal(err)
	}
	for name, d := range map[string]Dependency{
		"unsafe file":  dep(KindFile, "../x.dll", false),
		"unknown kind": dep("loot", "x", false),
		"no source":    {ID: "d", Kind: KindMod, Target: "m2"},
	} {
		if err := d.Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: expected ErrInvalid, got %v", name, err)
		}
	}
}

func TestResultNeedsEvidenceWhenNotSatisfied(t *testing.T) {
	if _, err := NewResult(dep(KindMod, "m2", false), StatusMissing, nil); !errors.Is(err, ErrInvalid) {
		t.Fatal("missing without evidence must be rejected")
	}
	r, err := NewResult(dep(KindMod, "m2", false), StatusMissing, map[string]string{"target": "m2"})
	if err != nil || !r.Broken() {
		t.Fatalf("required missing dependency must be broken: %+v %v", r, err)
	}
	opt, _ := NewResult(dep(KindMod, "m2", true), StatusMissing, map[string]string{"target": "m2"})
	if opt.Broken() {
		t.Fatal("optional dependency is never broken")
	}
	ok, _ := NewResult(dep(KindMod, "m2", false), StatusSatisfied, nil)
	if ok.Broken() {
		t.Fatal("satisfied dependency is not broken")
	}
}
