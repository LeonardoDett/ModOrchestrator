package ordering

import (
	"errors"
	"math/rand/v2"
	"slices"
	"strconv"
	"testing"
)

func items(s ...string) []Item {
	out := make([]Item, len(s))
	for i, v := range s {
		out[i] = Item(v)
	}
	return out
}

func edge(before, after string) Edge {
	return Edge{Before: Item(before), After: Item(after), Ref: before + "<" + after}
}

func TestValidOrderIsUnchanged(t *testing.T) {
	cur := items("a", "b", "c", "d")
	r, err := Solve(Input{Current: cur, Edges: []Edge{edge("a", "c"), edge("b", "d")}})
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(r.Order, cur) || r.Changed() {
		t.Fatalf("valid order changed: %v, moves %v", r.Order, r.Moves)
	}
}

func TestSingleViolationMovesOneItem(t *testing.T) {
	// "d before a": pulling d up or pushing a down both move one item; the
	// forward candidate (push the later side down) wins ties.
	r, err := Solve(Input{Current: items("a", "b", "c", "d"), Edges: []Edge{edge("d", "a")}})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Moves) != 1 || len(Violations(r.Order, []Edge{edge("d", "a")})) != 0 {
		t.Fatalf("want one move and a valid order, got %v %v", r.Order, r.Moves)
	}
	if got := r.Moves[0].Because; len(got) != 1 || got[0].Ref != "d<a" {
		t.Fatalf("move must be explained by the violated edge, got %v", got)
	}
}

func TestChoosesCandidateWithFewerMoves(t *testing.T) {
	// "e before a" with a at the top: pushing a to the bottom moves 1 item;
	// the alternative must not be worse.
	r, err := Solve(Input{Current: items("a", "b", "c", "d", "e"), Edges: []Edge{edge("e", "a")}})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Moves) != 1 {
		t.Fatalf("expected a single move, got %v", r.Moves)
	}
	// Block that must move up: x depends on nothing, but y,z must precede a.
	r, err = Solve(Input{Current: items("a", "b", "c", "y", "z"), Edges: []Edge{edge("y", "a"), edge("z", "a")}})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Moves) != 1 || r.Moves[0].Item != "a" {
		t.Fatalf("moving a down (1 item) beats pulling y,z up (2 items): %v", r.Moves)
	}
}

func TestCycleIsReportedAndNothingChanges(t *testing.T) {
	_, err := Solve(Input{Current: items("a", "b", "c"), Edges: []Edge{edge("a", "b"), edge("b", "c"), edge("c", "a")}})
	var ce *CycleError
	if !errors.As(err, &ce) || !errors.Is(err, ErrCycle) {
		t.Fatalf("want CycleError, got %v", err)
	}
	if len(ce.Cycle.Items) != 3 || len(ce.Cycle.Edges) != 3 {
		t.Fatalf("cycle must list its participants and edges: %+v", ce.Cycle)
	}
	for i, e := range ce.Cycle.Edges {
		if e.Before != ce.Cycle.Items[i] || e.After != ce.Cycle.Items[(i+1)%3] {
			t.Fatalf("edges must follow the items: %+v", ce.Cycle)
		}
	}
}

func TestEdgesWithAbsentSideAreIgnored(t *testing.T) {
	r, err := Solve(Input{Current: items("a", "b"), Edges: []Edge{edge("b", "ghost"), edge("ghost", "a")}})
	if err != nil || r.Changed() {
		t.Fatalf("edges to absent items must not constrain: %v %v", r, err)
	}
}

func TestInvalidInput(t *testing.T) {
	if _, err := Solve(Input{Current: items("a", "a")}); !errors.Is(err, ErrInvalid) {
		t.Fatal("duplicated item must be rejected")
	}
	if _, err := Solve(Input{Current: items("a"), Edges: []Edge{edge("a", "a")}}); !errors.Is(err, ErrInvalid) {
		t.Fatal("self edge must be rejected")
	}
}

func TestLocks(t *testing.T) {
	r, err := Solve(Input{Current: items("a", "b", "c", "d"), Locks: []Lock{{Item: "d", Index: 0}}})
	if err != nil {
		t.Fatal(err)
	}
	if r.Order[0] != "d" {
		t.Fatalf("locked item must be at its index: %v", r.Order)
	}
	_, err = Solve(Input{Current: items("a", "b"), Edges: []Edge{edge("a", "b")}, Locks: []Lock{{Item: "b", Index: 0}}})
	if !errors.Is(err, ErrLockConflict) {
		t.Fatalf("lock against an edge must fail, got %v", err)
	}
}

func TestFindCycle(t *testing.T) {
	if _, found := FindCycle(items("a", "b"), []Edge{edge("a", "b")}); found {
		t.Fatal("no cycle expected")
	}
	c, found := FindCycle(items("a", "b"), []Edge{edge("a", "b"), edge("b", "a")})
	if !found || len(c.Items) != 2 {
		t.Fatalf("two-item cycle expected, got %+v", c)
	}
}

func TestPlace(t *testing.T) {
	order := items("a", "b", "c", "d")
	edges := []Edge{edge("b", "d")}
	p, err := Place(order, items("d"), 0, edges)
	if err != nil {
		t.Fatal(err)
	}
	if p.Valid() || len(p.Violated) != 1 {
		t.Fatalf("moving d above b must be refused: %+v", p)
	}
	if p.Nearest != 2 || !slices.Equal(p.NearestOrder, items("a", "b", "d", "c")) {
		t.Fatalf("nearest valid position is right after b: %+v", p)
	}
	p, _ = Place(order, items("a", "b"), 2, nil)
	if !p.Valid() || !slices.Equal(p.Order, items("c", "d", "a", "b")) {
		t.Fatalf("block move keeps relative order: %+v", p)
	}
	if _, err := Place(order, items("x"), 0, nil); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown item must be rejected")
	}
}

// Property test: for random acyclic constraint sets, the result is valid,
// deterministic, a permutation of the input, and a valid input is untouched.
func TestPropertiesRandom(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	for round := range 300 {
		n := 2 + rng.IntN(30)
		cur := make([]Item, n)
		for i := range cur {
			cur[i] = Item("i" + strconv.Itoa(i))
		}
		rng.Shuffle(n, func(i, j int) { cur[i], cur[j] = cur[j], cur[i] })
		// Edges follow a hidden topological order, so they are acyclic.
		hidden := slices.Clone(cur)
		rng.Shuffle(n, func(i, j int) { hidden[i], hidden[j] = hidden[j], hidden[i] })
		var edges []Edge
		for range rng.IntN(n) {
			a, b := rng.IntN(n), rng.IntN(n)
			if a == b {
				continue
			}
			if a > b {
				a, b = b, a
			}
			edges = append(edges, Edge{Before: hidden[a], After: hidden[b], Ref: strconv.Itoa(a) + "-" + strconv.Itoa(b)})
		}
		r1, err := Solve(Input{Current: cur, Edges: edges})
		if err != nil {
			t.Fatalf("round %d: %v", round, err)
		}
		r2, _ := Solve(Input{Current: cur, Edges: edges})
		if !slices.Equal(r1.Order, r2.Order) {
			t.Fatalf("round %d: not deterministic", round)
		}
		if v := Violations(r1.Order, edges); len(v) > 0 {
			t.Fatalf("round %d: result violates %v", round, v)
		}
		sorted1, sorted2 := slices.Clone(r1.Order), slices.Clone(cur)
		slices.Sort(sorted1)
		slices.Sort(sorted2)
		if !slices.Equal(sorted1, sorted2) {
			t.Fatalf("round %d: not a permutation", round)
		}
		again, _ := Solve(Input{Current: r1.Order, Edges: edges})
		if again.Changed() {
			t.Fatalf("round %d: a valid order must stay unchanged", round)
		}
	}
}
