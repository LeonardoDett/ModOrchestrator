package rules

import (
	"errors"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
)

func wins(id ID, winner, loser mod.ID) OrderRule {
	return OrderRule{ID: id, Before: loser, After: winner, Source: SourceUser}
}

func newSet(t *testing.T) *Set {
	t.Helper()
	s, err := New("i1")
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestWinnerLanguage(t *testing.T) {
	r := wins("r1", "b", "a")
	if r.Winner() != "b" || r.Loser() != "a" {
		t.Fatal("B wins A means A is before B")
	}
}

func TestCycleIsRefusedAtCreation(t *testing.T) {
	s := newSet(t)
	for _, r := range []OrderRule{wins("r1", "b", "a"), wins("r2", "c", "b")} {
		if err := s.AddOrderRule(r); err != nil {
			t.Fatal(err)
		}
	}
	err := s.AddOrderRule(wins("r3", "a", "c"))
	var ce *ordering.CycleError
	if !errors.Is(err, ErrCycle) || !errors.As(err, &ce) || len(ce.Cycle.Items) != 3 {
		t.Fatalf("closing a->b->c->a must be refused with the cycle, got %v", err)
	}
	if len(s.OrderRules()) != 2 {
		t.Fatal("refused rule must not be stored")
	}
	// Disabled rules do not close cycles, but re-enabling them is checked.
	r3 := wins("r3", "a", "c")
	r3.Disabled = true
	if err := s.AddOrderRule(r3); err != nil {
		t.Fatal(err)
	}
	if err := s.SetOrderRuleDisabled("r3", false); !errors.Is(err, ErrCycle) {
		t.Fatalf("re-enabling into a cycle must be refused, got %v", err)
	}
}

func TestDuplicatesAndValidation(t *testing.T) {
	s := newSet(t)
	_ = s.AddOrderRule(wins("r1", "b", "a"))
	if err := s.AddOrderRule(wins("r2", "b", "a")); !errors.Is(err, ErrDuplicate) {
		t.Fatal("same intent twice must be rejected")
	}
	if err := s.AddOrderRule(wins("r1", "c", "a")); !errors.Is(err, ErrDuplicate) {
		t.Fatal("same id twice must be rejected")
	}
	if err := s.AddOrderRule(wins("r3", "a", "a")); !errors.Is(err, ErrInvalid) {
		t.Fatal("self rule must be rejected")
	}
	if err := s.AddDependency(DependencyRule{ID: "d1", Mod: "a", Target: "b", Kind: "maybe", Source: SourceUser}); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown dependency kind must be rejected")
	}
	if err := s.AddIncompatibility(IncompatibilityRule{ID: "x1", A: "a", B: "b", Source: SourceUser}); err != nil {
		t.Fatal(err)
	}
	if err := s.AddIncompatibility(IncompatibilityRule{ID: "x2", A: "b", B: "a", Source: SourceUser}); !errors.Is(err, ErrDuplicate) {
		t.Fatal("incompatibility is symmetric")
	}
}

func TestMetadataCyclesAreKeptAndReported(t *testing.T) {
	meta := func(id ID, w, l mod.ID) OrderRule { r := wins(id, w, l); r.Source = SourceMetadata; return r }
	s, err := Restore(Data{Instance: "i1", Order: []OrderRule{meta("m1", "b", "a"), meta("m2", "a", "b")}})
	if err != nil {
		t.Fatal(err)
	}
	if _, found := s.Cycle(); !found {
		t.Fatal("cycle from metadata must be reported")
	}
	if err := s.Remove("m1"); !errors.Is(err, ErrInvalid) {
		t.Fatal("metadata rules can only be disabled")
	}
	if err := s.SetOrderRuleDisabled("m1", true); err != nil {
		t.Fatal(err)
	}
	if _, found := s.Cycle(); found {
		t.Fatal("disabling one rule breaks the cycle")
	}
}

func TestOrphansAreReportedNotDeleted(t *testing.T) {
	s := newSet(t)
	_ = s.AddOrderRule(wins("r1", "b", "a"))
	_ = s.AddDependency(DependencyRule{ID: "d1", Mod: "c", Target: "a", Kind: Requires, Source: SourceUser})
	orphans := s.Orphans(map[mod.ID]bool{"b": true, "c": true})
	if !slices.Equal(orphans, []ID{"r1"}) {
		t.Fatalf("orphans = %v (a requirement with a missing target is broken, not orphan)", orphans)
	}
	if len(s.OrderRules()) != 1 {
		t.Fatal("orphans stay stored")
	}
	if got := s.Involving("a"); !slices.Equal(got, []ID{"r1", "d1"}) {
		t.Fatalf("Involving = %v", got)
	}
}
