package integration_test

import (
	"testing"

	conflictsvc "modorchestrator/internal/core/application/conflicts"
	profilesvc "modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/rules"
)

func (e *env) pairOf(a, b mod.ID) conflictsvc.PairView {
	e.t.Helper()
	for _, p := range e.pairs().Pairs {
		if (p.A.ID == a && p.B.ID == b) || (p.A.ID == b && p.B.ID == a) {
			return p
		}
	}
	e.t.Fatalf("no pair %s %s", a, b)
	return conflictsvc.PairView{}
}

func (e *env) decidePair(m, opponent mod.ID, choice profilesvc.PairChoice) error {
	return e.prof.ApplyPairDecisions(ctx, e.inst.ID, []profilesvc.PairDecision{{Mod: m, Opponent: opponent, Choice: choice}})
}

// D126 and B3: without a fact there is no suggestion (generic game, no
// rules); a dependency suggests the dependent mod; accepting it is the
// pair rule, which decides every file of the pair at once.
func TestWinnerSuggestionAndPairDecision(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"Patch": {"textures/a.dds", "p-a", "textures/b.dds", "p-b"},
		"Base":  {"textures/a.dds", "b-a", "textures/b.dds", "b-b"},
	}, "Patch", "Base")
	patch, base := ids[0], ids[1]
	if p := e.pairOf(patch, base); p.Suggestion != nil || p.Lock != nil {
		t.Fatalf("suggestion without facts: %+v %+v", p.Suggestion, p.Lock)
	}
	if _, err := e.prof.AddDependency(ctx, e.inst.ID, patch, base, rules.Requires); err != nil {
		t.Fatal(err)
	}
	p := e.pairOf(patch, base)
	if p.Suggestion == nil || p.Suggestion.Winner != patch || p.Suggestion.Reason != rules.SuggestRequires {
		t.Fatalf("suggestion = %+v", p.Suggestion)
	}
	// Base was installed last, so the order makes it win; the suggestion
	// changes nothing by itself (D004).
	if e.winnerAt(patch, base, "textures/a.dds") != base || p.Decision != conflictsvc.DecisionOrder {
		t.Fatalf("suggestion applied by itself: %+v", p)
	}
	if err := e.decidePair(patch, base, profilesvc.ChoiceWins); err != nil {
		t.Fatal(err)
	}
	p = e.pairOf(patch, base)
	if p.Decision != conflictsvc.DecisionRule || p.Rule == nil || p.Rule.Winner != patch {
		t.Fatalf("after accepting = %+v", p)
	}
	for _, f := range []string{"textures/a.dds", "textures/b.dds"} {
		if e.winnerAt(patch, base, f) != patch {
			t.Fatalf("%s not decided by the pair rule", f)
		}
	}
}

// B4: a pair decided through other mods is locked, names the rules that
// decide it, and choosing the other winner is refused like any rule that
// would close a cycle (D028), even when it is the suggestion.
func TestLockedPairAndRefusedSuggestion(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"Alpha": {"textures/a.dds", "1", "textures/x.dds", "1"},
		"Mid":   {"textures/x.dds", "2", "textures/y.dds", "2"},
		"Omega": {"textures/a.dds", "3", "textures/y.dds", "3"},
	}, "Alpha", "Mid", "Omega")
	alpha, mid, omega := ids[0], ids[1], ids[2]
	if err := e.decidePair(mid, alpha, profilesvc.ChoiceWins); err != nil {
		t.Fatal(err)
	}
	if err := e.decidePair(omega, mid, profilesvc.ChoiceWins); err != nil {
		t.Fatal(err)
	}
	p := e.pairOf(alpha, omega)
	if p.Lock == nil || p.Lock.Winner != omega || len(p.Lock.Rules) != 2 ||
		p.Lock.Rules[0].Loser.ID != alpha || p.Lock.Rules[0].Winner.ID != mid || p.Lock.Rules[1].Winner.ID != omega {
		t.Fatalf("lock = %+v", p.Lock)
	}
	if pm := e.pairOf(alpha, mid); pm.Lock != nil {
		t.Fatalf("a pair with its own rule is not locked: %+v", pm.Lock)
	}
	if _, err := e.prof.AddDependency(ctx, e.inst.ID, alpha, omega, rules.Requires); err != nil {
		t.Fatal(err)
	}
	if s := e.pairOf(alpha, omega).Suggestion; s == nil || s.Winner != alpha {
		t.Fatalf("suggestion = %+v", s)
	}
	if err := e.decidePair(alpha, omega, profilesvc.ChoiceWins); err == nil {
		t.Fatal("accepting a suggestion that closes a cycle must be refused")
	}
	if e.winnerAt(alpha, omega, "textures/a.dds") != omega {
		t.Fatal("the refused choice changed the winner")
	}
	mc, err := e.conf.ModConflicts(ctx, e.inst.ID, alpha)
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range mc.Opponents {
		if o.Opponent.ID == omega && (o.Lock == nil || o.Suggestion == nil) {
			t.Fatalf("opponent view misses lock or suggestion: %+v", o)
		}
	}
}
