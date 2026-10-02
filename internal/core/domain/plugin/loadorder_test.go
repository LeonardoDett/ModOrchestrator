package plugin

import (
	"errors"
	"fmt"
	"math/rand"
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/ordering"
)

func hard(before, after Name) ordering.Edge {
	return ordering.Edge{Before: ordering.Item(before.Key()), After: ordering.Item(after.Key()), Ref: RefAdapterPrefix + "master"}
}

func TestSortKeepsAValidOrder(t *testing.T) {
	order := []Name{"Skyrim.esm", "A.esm", "b.esp", "c.esp"}
	c := Constraints{Hard: []ordering.Edge{hard("A.esm", "b.esp")}, Fixed: []Name{"Skyrim.esm"}}
	res, err := Sort(order, c)
	if err != nil || res.Changed() || !slices.Equal(res.Order, order) {
		t.Fatalf("a valid order must not change: %v %v", res, err)
	}
}

func TestSortFixesImplicitAndMasters(t *testing.T) {
	order := []Name{"b.esp", "Update.esm", "A.esm", "Skyrim.esm"}
	c := Constraints{Hard: []ordering.Edge{hard("A.esm", "b.esp")}, Fixed: []Name{"Skyrim.esm", "Update.esm"}}
	res, err := Sort(order, c)
	if err != nil {
		t.Fatal(err)
	}
	want := []Name{"Skyrim.esm", "Update.esm", "A.esm", "b.esp"}
	if !slices.Equal(res.Order, want) {
		t.Fatalf("got %v want %v", res.Order, want)
	}
}

func TestSettleIgnoresSoftRules(t *testing.T) {
	order := []Name{"a.esp", "b.esp"}
	c := Constraints{Soft: []ordering.Edge{{Before: "b.esp", After: "a.esp", Ref: RefRulePrefix + "r1"}}}
	res, err := Settle(order, c)
	if err != nil || res.Changed() {
		t.Fatalf("settle must keep an order that breaks only soft rules: %v %v", res, err)
	}
	res, err = Sort(order, c)
	if err != nil || !slices.Equal(res.Order, []Name{"b.esp", "a.esp"}) {
		t.Fatalf("sort must apply the rule: %v %v", res.Order, err)
	}
	if len(res.Moves) != 1 || len(res.Moves[0].Because) != 1 {
		t.Fatalf("the move must be explained: %+v", res.Moves)
	}
}

func TestPlaceRefusesViolationsWithAlternative(t *testing.T) {
	order := []Name{"Skyrim.esm", "M.esm", "a.esp", "b.esp"}
	c := Constraints{Hard: []ordering.Edge{hard("M.esm", "b.esp")}, Fixed: []Name{"Skyrim.esm"}}
	p, err := Place(order, []Name{"b.esp"}, 1, c)
	if err != nil {
		t.Fatal(err)
	}
	if p.Valid() || len(p.Violated) != 1 || p.Nearest != 2 {
		t.Fatalf("b before its master must be refused with the nearest valid place: %+v", p)
	}
	if !slices.Equal(p.NearestOrder, []Name{"Skyrim.esm", "M.esm", "b.esp", "a.esp"}) {
		t.Fatalf("nearest order: %v", p.NearestOrder)
	}
	if _, err := Place(order, []Name{"Skyrim.esm"}, 3, c); !errors.Is(err, ErrLocked) {
		t.Fatalf("implicit plugins never move: %v", err)
	}
}

func TestPlaceKeepsLockedPositions(t *testing.T) {
	order := []Name{"a.esp", "b.esp", "c.esp", "d.esp"}
	c := Constraints{Locks: map[string]int{"b.esp": 1}}
	p, err := Place(order, []Name{"d.esp"}, 0, c)
	if err != nil || !p.Valid() {
		t.Fatal(err, p)
	}
	if !slices.Equal(p.Order, []Name{"d.esp", "b.esp", "a.esp", "c.esp"}) {
		t.Fatalf("locked plugin must stay at its position: %v", p.Order)
	}
}

func TestMergeKeepsOrderAndAppendsNew(t *testing.T) {
	merged, added, removed := Merge([]Name{"b.esp", "GONE.esp", "a.esp"}, []Name{"A.ESP", "b.esp", "new.esp"})
	if !slices.Equal(merged, []Name{"b.esp", "A.ESP", "new.esp"}) {
		t.Fatalf("merged %v", merged)
	}
	if !slices.Equal(added, []Name{"new.esp"}) || !slices.Equal(removed, []Name{"GONE.esp"}) {
		t.Fatalf("added %v removed %v", added, removed)
	}
}

func TestRuleAgainstMasterIsRefused(t *testing.T) {
	r, _ := NewRules("i1")
	known := []Name{"M.esm", "p.esp"}
	err := r.AddRule(after("r1", "M.esm", "p.esp"), Check{Known: known, Hard: []ordering.Edge{hard("M.esm", "p.esp")}})
	if !errors.Is(err, ErrCycle) {
		t.Fatalf("a rule that contradicts a master must be refused (INV-ORD-04): %v", err)
	}
}

func TestGroupsAreTransitive(t *testing.T) {
	r, _ := NewRules("i1")
	_ = r.SetGroup(Group{Name: "mid", After: []string{DefaultGroup}}, Check{})
	_ = r.SetGroup(Group{Name: "late", After: []string{"mid"}}, Check{})
	_ = r.Assign("z.esp", "late", Check{})
	edges := r.Edges([]Name{"a.esp", "z.esp"})
	if len(edges) != 1 || edges[0].Before != "a.esp" {
		t.Fatalf("late must load after default through the empty mid group: %v", edges)
	}
	if err := r.DeleteGroup("late"); err != nil || r.GroupOf("z.esp") != DefaultGroup {
		t.Fatal("deleting a group returns its plugins to default", err)
	}
}

// INV-PLG-01: whatever the starting order, rules, groups and locks, the
// engine never returns an order that breaks a hard constraint or moves an
// implicit plugin. Either it returns such an order or it refuses.
func TestEngineNeverBreaksHardConstraints(t *testing.T) {
	rng := rand.New(rand.NewSource(11))
	for round := 0; round < 300; round++ {
		n := 3 + rng.Intn(25)
		var names []Name
		for i := 0; i < n; i++ {
			names = append(names, Name(fmt.Sprintf("p%02d.esp", i)))
		}
		fixed := names[:1+rng.Intn(2)]
		var hardEdges []ordering.Edge
		// masters: an edge only from a lower to a higher index (headers
		// cannot be cyclic), plus "master flag" edges.
		for i := len(fixed); i < n; i++ {
			for j := len(fixed); j < i; j++ {
				if rng.Intn(6) == 0 {
					hardEdges = append(hardEdges, hard(names[j], names[i]))
				}
			}
		}
		for _, f := range fixed {
			for _, o := range names[len(fixed):] {
				hardEdges = append(hardEdges, hard(f, o))
			}
		}
		r, _ := NewRules("i1")
		for k := 0; k < 4; k++ {
			a, b := names[rng.Intn(n)], names[rng.Intn(n)]
			_ = r.AddRule(after(RuleID(fmt.Sprint(k)), a, b), Check{Known: names, Hard: hardEdges})
		}
		locks := map[string]int{}
		if rng.Intn(3) == 0 {
			free := names[len(fixed)+rng.Intn(n-len(fixed))]
			locks[free.Key()] = len(fixed) + rng.Intn(n-len(fixed))
		}
		c := Constraints{Hard: hardEdges, Soft: r.Edges(names), Fixed: fixed, Locks: locks}
		current := slices.Clone(names)
		rng.Shuffle(len(current), func(i, j int) { current[i], current[j] = current[j], current[i] })
		for _, op := range []func([]Name, Constraints) (Result, error){Sort, Settle} {
			res, err := op(current, c)
			if err != nil {
				continue // refused (lock against a master): nothing changes
			}
			if v := Violations(res.Order, c.Hard); len(v) > 0 {
				t.Fatalf("round %d: hard constraint broken: %v in %v", round, v, res.Order)
			}
			for i, f := range fixed {
				if res.Order[i].Key() != f.Key() {
					t.Fatalf("round %d: implicit %s moved: %v", round, f, res.Order)
				}
			}
			again, err := op(res.Order, c)
			if err != nil || again.Changed() {
				t.Fatalf("round %d: the engine must be idempotent", round)
			}
		}
	}
}

func TestNearestIndexReproducesTheNearestOrder(t *testing.T) {
	order := []Name{"Skyrim.esm", "M.esm", "a.esp", "b.esp", "c.esp"}
	c := Constraints{Hard: []ordering.Edge{hard("M.esm", "c.esp")}, Fixed: []Name{"Skyrim.esm"}}
	p, err := Place(order, []Name{"c.esp"}, 1, c)
	if err != nil || p.Valid() {
		t.Fatal(err, p)
	}
	again, err := Place(order, []Name{"c.esp"}, p.NearestIndex, c)
	if err != nil || !again.Valid() || !slices.Equal(again.Order, p.NearestOrder) {
		t.Fatalf("retry at %d: %v vs %v", p.NearestIndex, again.Order, p.NearestOrder)
	}
}
