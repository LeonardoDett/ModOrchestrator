package rules

import (
	"testing"

	"modorchestrator/internal/core/domain/mod"
)

// B4: a pair decided through other mods returns the shortest chain; a
// direct rule or a disabled one is not a chain.
func TestChain(t *testing.T) {
	s := newSet(t)
	for _, r := range []OrderRule{wins("r1", "x", "a"), wins("r2", "b", "x"), wins("r3", "y", "a"), wins("r4", "z", "y"), wins("r5", "b", "z")} {
		if err := s.AddOrderRule(r); err != nil {
			t.Fatal(err)
		}
	}
	c := s.Chain("a", "b")
	if len(c) != 2 || c[0].ID != "r1" || c[1].ID != "r2" {
		t.Fatalf("chain = %+v", c)
	}
	if c := s.Chain("b", "a"); c != nil {
		t.Fatalf("reverse chain = %+v", c)
	}
	if err := s.SetDisabled("r1", true); err != nil {
		t.Fatal(err)
	}
	if c := s.Chain("a", "b"); len(c) != 3 || c[0].ID != "r3" {
		t.Fatalf("chain without r1 = %+v", c)
	}
	d := newSet(t)
	_ = d.AddOrderRule(wins("r1", "b", "a"))
	if c := d.Chain("a", "b"); c != nil {
		t.Fatalf("a direct rule is not a chain: %+v", c)
	}
}

// D126: a dependency suggests the dependent mod; a metadata order rule
// suggests its winner; no fact or disagreeing facts suggest nothing; the
// answer does not depend on the order of the arguments.
func TestSuggest(t *testing.T) {
	s := newSet(t)
	if _, ok := s.Suggest("a", "b"); ok {
		t.Fatal("suggestion without facts")
	}
	_ = s.AddDependency(DependencyRule{ID: "d1", Mod: "patch", Target: "base", Kind: Requires, Source: SourceUser})
	for _, args := range [][2]string{{"patch", "base"}, {"base", "patch"}} {
		sg, ok := s.Suggest(modID(args[0]), modID(args[1]))
		if !ok || sg.Winner != "patch" || sg.Reason != SuggestRequires || sg.Rule != "d1" {
			t.Fatalf("suggest %v = %+v %v", args, sg, ok)
		}
	}
	m := OrderRule{ID: "o1", Before: "a", After: "b", Source: SourceMetadata}
	_ = s.AddOrderRule(m)
	if sg, ok := s.Suggest("a", "b"); !ok || sg.Winner != "b" || sg.Reason != SuggestMetadata {
		t.Fatalf("metadata suggestion = %+v %v", sg, ok)
	}
	// A user rule is a decision, not a fact.
	_ = s.AddOrderRule(wins("u1", "c", "d"))
	if _, ok := s.Suggest("c", "d"); ok {
		t.Fatal("a user rule suggested")
	}
	// Facts that disagree give nothing.
	_ = s.AddDependency(DependencyRule{ID: "d2", Mod: "a", Target: "b", Kind: Requires, Source: SourceUser})
	if sg, ok := s.Suggest("a", "b"); ok {
		t.Fatalf("disagreeing facts suggested %+v", sg)
	}
	// A disabled fact does not count.
	_ = s.SetDisabled("o1", true)
	if sg, ok := s.Suggest("a", "b"); !ok || sg.Winner != "a" {
		t.Fatalf("after disabling the metadata rule = %+v %v", sg, ok)
	}
}

func modID(s string) mod.ID { return mod.ID(s) }
