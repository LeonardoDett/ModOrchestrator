package plugin

import (
	"testing"

	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/rules"
)

const src = rules.Source("loot")

func provRule(p, q Name) Rule {
	return Rule{ID: ProvidedRuleID(src, p, q), Plugin: p, After: q}
}

func hasEdge(es []ordering.Edge, before, after string) bool {
	for _, e := range es {
		if string(e.Before) == before && string(e.After) == after {
			return true
		}
	}
	return false
}

func TestProvidedDataJoinsTheUserData(t *testing.T) {
	r, _ := NewRules("i1")
	known := []Name{"a.esp", "b.esp", "c.esp"}
	eff := r.WithProvided(Check{Known: known}, Provided{
		Source: src,
		Rules:  []Rule{provRule("b.esp", "a.esp")},
		Groups: []Group{{Name: "late", After: []string{DefaultGroup}}, {Name: DefaultGroup, After: []string{"early"}}, {Name: "early"}},
		Assignments: map[Name]string{
			"c.esp": "late",
		},
	})
	es := eff.Edges(known)
	if !hasEdge(es, "a.esp", "b.esp") || !hasEdge(es, "a.esp", "c.esp") || !hasEdge(es, "b.esp", "c.esp") {
		t.Fatalf("provided rule and group must become edges: %v", es)
	}
	if eff.GroupOf("c.esp") != "late" || eff.AssignmentProvidedBy("c.esp") != src || eff.GroupProvidedBy("late") != src {
		t.Fatal("provenance of the group lost")
	}
	if g := eff.Groups(); len(g) != 3 || g[0].Name != DefaultGroup || len(g[0].After) != 1 {
		t.Fatalf("groups merged wrong: %+v", g)
	}
	if eff.ProvidedBy(ProvidedRuleID(src, "b.esp", "a.esp")) != src {
		t.Fatal("rule provenance lost")
	}
	// The persisted set never sees provided data.
	if len(r.List()) != 0 || len(r.Groups()) != 1 || r.GroupOf("c.esp") != DefaultGroup {
		t.Fatal("WithProvided changed the user's set")
	}
}

func TestUserDataWinsOverProvided(t *testing.T) {
	r, _ := NewRules("i1")
	known := []Name{"a.esp", "b.esp"}
	_ = r.SetGroup(Group{Name: "mine"}, Check{})
	_ = r.Assign("b.esp", "mine", Check{})
	if err := r.AddRule(after("u1", "a.esp", "b.esp"), Check{Known: known}); err != nil {
		t.Fatal(err)
	}
	eff := r.WithProvided(Check{Known: known}, Provided{
		Source:      src,
		Rules:       []Rule{provRule("b.esp", "a.esp")},
		Groups:      []Group{{Name: "late", After: []string{DefaultGroup}}},
		Assignments: map[Name]string{"b.esp": "late"},
	})
	if eff.GroupOf("b.esp") != "mine" {
		t.Fatal("the user's assignment must win")
	}
	if _, cyclic := eff.Cycle(known, nil); cyclic {
		t.Fatal("a provided rule that closes a cycle with a user rule must be left out")
	}
	sk := eff.Skipped()
	if len(sk) != 1 || sk[0].Kind != "rule" || sk[0].Plugin != "b.esp" {
		t.Fatalf("skipped: %+v", sk)
	}
}

func TestProvidedCycleWithHardConstraintsIsDropped(t *testing.T) {
	r, _ := NewRules("i1")
	known := []Name{"master.esm", "dep.esp"}
	hard := []ordering.Edge{{Before: "master.esm", After: "dep.esp", Ref: RefAdapterPrefix + "master"}}
	eff := r.WithProvided(Check{Known: known, Hard: hard}, Provided{
		Source:      src,
		Groups:      []Group{{Name: "early"}, {Name: DefaultGroup, After: []string{"early"}}},
		Assignments: map[Name]string{"dep.esp": "early"},
	})
	if _, cyclic := eff.Cycle(known, hard); cyclic {
		t.Fatal("provided assignment against a master must be dropped")
	}
	if sk := eff.Skipped(); len(sk) != 1 || sk[0].Kind != "assignment" {
		t.Fatalf("skipped: %+v", sk)
	}
}

func TestUserCanDisableProvidedRules(t *testing.T) {
	r, _ := NewRules("i1")
	id := ProvidedRuleID(src, "b.esp", "a.esp")
	r.SetProviderOff(id, true)
	back, err := RestoreRules(r.Data())
	if err != nil || !back.ProviderOff(id) {
		t.Fatalf("disabled provided rule must persist: %v", err)
	}
	eff := back.WithProvided(Check{}, Provided{Source: src, Rules: []Rule{provRule("b.esp", "a.esp")}})
	if es := eff.Edges([]Name{"a.esp", "b.esp"}); len(es) != 0 {
		t.Fatalf("a disabled provided rule has no edge: %v", es)
	}
	if rl, ok := eff.Rule(id); !ok || !rl.Disabled {
		t.Fatal("the disabled provided rule still shows")
	}
}
