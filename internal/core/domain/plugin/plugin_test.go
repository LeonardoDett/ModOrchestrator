package plugin

import (
	"errors"
	"testing"

	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/rules"
)

func TestValidateOrderIsCaseInsensitive(t *testing.T) {
	if err := ValidateOrder([]Name{"A.esp", "a.ESP"}); !errors.Is(err, ErrDuplicate) {
		t.Fatal("same plugin with different case must be rejected")
	}
	if err := ValidateOrder([]Name{" "}); !errors.Is(err, ErrInvalid) {
		t.Fatal("empty name must be rejected")
	}
}

func after(id RuleID, p, q Name) Rule {
	return Rule{ID: id, Plugin: p, After: q, Source: rules.SourceUser}
}

func TestRuleCycleIsRefused(t *testing.T) {
	r, _ := NewRules("i1")
	known := []Name{"a.esp", "b.esp"}
	if err := r.AddRule(after("r1", "b.esp", "a.esp"), known); err != nil {
		t.Fatal(err)
	}
	err := r.AddRule(after("r2", "A.esp", "B.esp"), known)
	var ce *ordering.CycleError
	if !errors.Is(err, ErrCycle) || !errors.As(err, &ce) {
		t.Fatalf("cycle must be refused, got %v", err)
	}
	if err := r.AddRule(after("r3", "B.ESP", "a.esp"), known); !errors.Is(err, ErrDuplicate) {
		t.Fatal("same rule with other case is a duplicate")
	}
}

func TestGroupsBecomeEdgesAndRefuseCycles(t *testing.T) {
	r, _ := NewRules("i1")
	if err := r.SetGroup(Group{Name: "late", After: []string{DefaultGroup}}); err != nil {
		t.Fatal(err)
	}
	_ = r.Assign("patch.esp", "late")
	edges := r.Edges([]Name{"a.esp", "patch.esp"})
	if len(edges) != 1 || edges[0].Before != "a.esp" || edges[0].After != "patch.esp" {
		t.Fatalf("default plugins must load before late ones: %v", edges)
	}
	if err := r.SetGroup(Group{Name: DefaultGroup, After: []string{"late"}}); !errors.Is(err, ErrCycle) {
		t.Fatalf("group cycle must be refused, got %v", err)
	}
	if err := r.Assign("x.esp", "unknown"); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown group must be rejected")
	}
	restored, err := RestoreRules(r.Data())
	if err != nil || restored.GroupOf("PATCH.esp") != "late" {
		t.Fatalf("round trip lost the assignment: %v", err)
	}
}

func TestProviderRulesCanOnlyBeDisabled(t *testing.T) {
	r, _ := NewRules("i1")
	rule := after("r1", "b.esp", "a.esp")
	rule.Source = rules.SourceMetadata
	_ = r.AddRule(rule, nil)
	if err := r.RemoveRule("r1"); !errors.Is(err, ErrInvalid) {
		t.Fatal("metadata rule cannot be removed")
	}
}
