package override

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func loc(p string) game.Location { return game.Location{Target: "data", Path: relpath.MustParse(p)} }

func TestOverridesUseLocationIdentity(t *testing.T) {
	s, _ := New("i1")
	if err := s.SetOverride(loc("Textures/A.dds"), "m1", t0); err != nil {
		t.Fatal(err)
	}
	_ = s.SetOverride(loc("textures/a.DDS"), "m2", t0) // replaces, same location
	if o, ok := s.Override(loc("TEXTURES/a.dds")); !ok || o.Winner != "m2" {
		t.Fatalf("override = %+v", o)
	}
	if len(s.Overrides()) != 1 {
		t.Fatal("one location, one override")
	}
	if err := s.ClearOverride(loc("x")); !errors.Is(err, ErrNotFound) {
		t.Fatal("clearing a missing override must fail")
	}
	if err := s.SetOverride(game.Location{Target: "data"}, "m1", t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("invalid location must be rejected")
	}
}

func TestExclusions(t *testing.T) {
	s, _ := New("i1")
	_ = s.Exclude("m1", loc("a.esp"), t0)
	if !s.Excluded("m1", loc("A.ESP")) || s.Excluded("m2", loc("a.esp")) {
		t.Fatal("exclusion is per mod and location")
	}
	_ = s.Include("m1", loc("a.esp"))
	if s.Excluded("m1", loc("a.esp")) {
		t.Fatal("include must undo")
	}
}

func TestReviewsExpireWithContestedSet(t *testing.T) {
	s, _ := New("i1")
	_ = s.MarkReviewed("b", "a", "hash1", t0)
	if !s.Reviewed("a", "b", "hash1") {
		t.Fatal("pair is unordered")
	}
	if s.Reviewed("a", "b", "hash2") {
		t.Fatal("a changed contested set invalidates the review")
	}
	restored, err := Restore(s.Data())
	if err != nil || !restored.Reviewed("a", "b", "hash1") {
		t.Fatalf("round trip lost the review: %v", err)
	}
}
