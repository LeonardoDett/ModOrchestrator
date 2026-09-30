// Package ordering is the constraint-based ordering engine shared by the mod
// order and the plugin load order (D029, core/05 §3). It is pure: it knows
// items, "before" edges and locked positions, never mods, plugins or games.
//
// Properties (INV-ORD-05 and core/05 §3):
//   - a current order that already satisfies every edge is returned unchanged;
//   - the result satisfies every edge, or an error is returned and nothing
//     changes (cycles are reported with participants, never broken);
//   - the same input always produces the same output;
//   - among the candidate valid orders, the one that moves fewer items wins.
package ordering

import (
	"container/heap"
	"errors"
	"fmt"
	"slices"
	"sort"
)

// Item identifies something being ordered (a mod, a separator, a plugin).
type Item string

// Edge requires Before to come earlier than After. Ref identifies the rule or
// constraint that produced it, so every movement can be explained.
type Edge struct {
	Before, After Item
	Ref           string
}

// Lock pins Item at a zero-based position of the final order.
type Lock struct {
	Item  Item
	Index int
}

// Input is what the engine orders.
type Input struct {
	Current []Item
	Edges   []Edge
	Locks   []Lock
}

// Move records one item that changed position and the edges it violated in
// the current order (empty when it only moved because others did).
type Move struct {
	Item     Item
	From, To int
	Because  []Edge
}

// Result is a valid order and the movements needed to reach it.
type Result struct {
	Order []Item
	Moves []Move
}

// Changed reports whether the order differs from the current one.
func (r Result) Changed() bool { return len(r.Moves) > 0 }

// Cycle lists items that require each other to come first, and the edges
// that form the loop, in order: Edges[i] goes from Items[i] to Items[i+1],
// and the last edge closes back to Items[0].
type Cycle struct {
	Items []Item
	Edges []Edge
}

// Errors returned by the engine.
var (
	ErrInvalid      = errors.New("ordering: invalid input")
	ErrCycle        = errors.New("ordering: constraints form a cycle")
	ErrLockConflict = errors.New("ordering: locked positions contradict constraints")
)

// CycleError carries the detected cycle. errors.Is(err, ErrCycle) holds.
type CycleError struct{ Cycle Cycle }

func (e *CycleError) Error() string { return fmt.Sprintf("%v: %v", ErrCycle, e.Cycle.Items) }
func (e *CycleError) Unwrap() error { return ErrCycle }

// ViolationError carries the edges a requested order breaks.
type ViolationError struct {
	Err      error
	Violated []Edge
}

func (e *ViolationError) Error() string {
	return fmt.Sprintf("%v: %d constraint(s)", e.Err, len(e.Violated))
}
func (e *ViolationError) Unwrap() error { return e.Err }

// Solve returns the valid order closest to in.Current.
func Solve(in Input) (Result, error) {
	g, err := newGraph(in.Current, in.Edges)
	if err != nil {
		return Result{}, err
	}
	if c, found := g.cycle(); found {
		return Result{}, &CycleError{Cycle: c}
	}
	forward := g.stableForward()
	backward := g.stableBackward()
	best := forward
	if movedCount(in.Current, backward) < movedCount(in.Current, forward) {
		best = backward
	}
	if len(in.Locks) > 0 {
		if best, err = applyLocks(best, in.Locks, g); err != nil {
			return Result{}, err
		}
	}
	return Result{Order: best, Moves: moves(in.Current, best, g)}, nil
}

// Violations returns the edges (between items present in order) that order
// breaks, in input order.
func Violations(order []Item, edges []Edge) []Edge {
	pos := positions(order)
	var out []Edge
	for _, e := range edges {
		b, okB := pos[e.Before]
		a, okA := pos[e.After]
		if okB && okA && b > a {
			out = append(out, e)
		}
	}
	return out
}

// FindCycle reports whether edges (restricted to items) contain a cycle. It
// is how rule creation is refused before a cycle exists (D028).
func FindCycle(items []Item, edges []Edge) (Cycle, bool) {
	g, err := newGraph(items, edges)
	if err != nil {
		return Cycle{}, false
	}
	return g.cycle()
}

// Placement is the outcome of asking to move items to a position.
type Placement struct {
	// Order is the requested order, valid or not.
	Order []Item
	// Violated lists the edges the requested order breaks; empty when valid.
	Violated []Edge
	// Nearest is the valid insertion index closest to the requested one, or
	// -1 when no position is valid; NearestOrder is the order it produces.
	Nearest      int
	NearestOrder []Item
}

// Valid reports whether the requested position satisfies every edge.
func (p Placement) Valid() bool { return len(p.Violated) == 0 }

// Place moves block (kept in its current relative order) so that its first
// item lands at index of the resulting order, and reports whether that is
// valid and, if not, the nearest valid index (core/05 §4). Nothing is
// applied: the caller decides.
func Place(order []Item, block []Item, index int, edges []Edge) (Placement, error) {
	if _, err := newGraph(order, nil); err != nil {
		return Placement{}, err
	}
	in := make(map[Item]bool, len(block))
	for _, b := range block {
		if !slices.Contains(order, b) {
			return Placement{}, fmt.Errorf("%w: %q is not in the order", ErrInvalid, b)
		}
		in[b] = true
	}
	if len(in) == 0 {
		return Placement{}, fmt.Errorf("%w: nothing to move", ErrInvalid)
	}
	var moving, rest []Item
	for _, it := range order {
		if in[it] {
			moving = append(moving, it)
		} else {
			rest = append(rest, it)
		}
	}
	build := func(i int) []Item {
		out := make([]Item, 0, len(order))
		out = append(out, rest[:i]...)
		out = append(out, moving...)
		return append(out, rest[i:]...)
	}
	index = min(max(index, 0), len(rest))
	p := Placement{Order: build(index), Nearest: -1}
	p.Violated = Violations(p.Order, edges)
	if p.Valid() {
		p.Nearest, p.NearestOrder = index, p.Order
		return p, nil
	}
	for d := 1; d <= len(rest); d++ {
		for _, i := range []int{index - d, index + d} {
			if i < 0 || i > len(rest) {
				continue
			}
			if cand := build(i); len(Violations(cand, edges)) == 0 {
				p.Nearest, p.NearestOrder = i, cand
				return p, nil
			}
		}
	}
	return p, nil
}

// graph is the edge set restricted to the items being ordered.
type graph struct {
	items []Item
	index map[Item]int
	succ  [][]int
	pred  [][]int
	edges map[[2]int][]Edge
}

func newGraph(items []Item, edges []Edge) (*graph, error) {
	g := &graph{items: items, index: make(map[Item]int, len(items)), succ: make([][]int, len(items)), pred: make([][]int, len(items)), edges: map[[2]int][]Edge{}}
	for i, it := range items {
		if it == "" {
			return nil, fmt.Errorf("%w: empty item", ErrInvalid)
		}
		if _, dup := g.index[it]; dup {
			return nil, fmt.Errorf("%w: item %q listed twice", ErrInvalid, it)
		}
		g.index[it] = i
	}
	for _, e := range edges {
		b, okB := g.index[e.Before]
		a, okA := g.index[e.After]
		if !okB || !okA {
			continue // a side is absent: the edge does not constrain this order
		}
		if a == b {
			return nil, fmt.Errorf("%w: %q cannot come before itself", ErrInvalid, e.Before)
		}
		k := [2]int{b, a}
		if _, seen := g.edges[k]; !seen {
			g.succ[b] = append(g.succ[b], a)
			g.pred[a] = append(g.pred[a], b)
		}
		g.edges[k] = append(g.edges[k], e)
	}
	return g, nil
}

// stableForward is Kahn's algorithm always emitting the ready item with the
// lowest current position: an item that must wait is pushed later.
func (g *graph) stableForward() []Item {
	return g.kahn(g.pred, g.succ, func(a, b int) bool { return a < b }, false)
}

// stableBackward fills the order from the end, always taking the item with
// the highest current position whose successors are placed: an item that
// must come earlier is pulled up.
func (g *graph) stableBackward() []Item {
	return g.kahn(g.succ, g.pred, func(a, b int) bool { return a > b }, true)
}

func (g *graph) kahn(in, out [][]int, less func(a, b int) bool, reverse bool) []Item {
	deg := make([]int, len(g.items))
	h := &intHeap{less: less}
	for i := range g.items {
		deg[i] = len(in[i])
		if deg[i] == 0 {
			heap.Push(h, i)
		}
	}
	order := make([]Item, 0, len(g.items))
	for h.Len() > 0 {
		i := heap.Pop(h).(int)
		order = append(order, g.items[i])
		for _, j := range out[i] {
			if deg[j]--; deg[j] == 0 {
				heap.Push(h, j)
			}
		}
	}
	if reverse {
		slices.Reverse(order)
	}
	return order
}

// cycle finds one cycle, if any, with a deterministic DFS from the lowest
// positions.
func (g *graph) cycle() (Cycle, bool) {
	const (
		white = iota
		grey
		black
	)
	color := make([]int, len(g.items))
	var stack []int
	var found []int
	var visit func(int) bool
	visit = func(i int) bool {
		color[i] = grey
		stack = append(stack, i)
		next := slices.Clone(g.succ[i])
		slices.Sort(next)
		for _, j := range next {
			switch color[j] {
			case grey:
				start := slices.Index(stack, j)
				found = slices.Clone(stack[start:])
				return true
			case white:
				if visit(j) {
					return true
				}
			}
		}
		stack = stack[:len(stack)-1]
		color[i] = black
		return false
	}
	for i := range g.items {
		if color[i] == white && visit(i) {
			c := Cycle{}
			for n, a := range found {
				b := found[(n+1)%len(found)]
				c.Items = append(c.Items, g.items[a])
				c.Edges = append(c.Edges, g.edges[[2]int{a, b}][0])
			}
			return c, true
		}
	}
	return Cycle{}, false
}

// applyLocks reinserts locked items at their indexes and verifies the result.
func applyLocks(order []Item, locks []Lock, g *graph) ([]Item, error) {
	locked := make(map[Item]int, len(locks))
	for _, l := range locks {
		if _, ok := g.index[l.Item]; !ok {
			continue
		}
		if l.Index < 0 || l.Index >= len(order) {
			return nil, fmt.Errorf("%w: lock of %q at %d is out of range", ErrInvalid, l.Item, l.Index)
		}
		locked[l.Item] = l.Index
	}
	slots := make([]Item, len(order))
	for _, l := range locks {
		i, ok := locked[l.Item]
		if !ok || slots[i] == l.Item {
			continue
		}
		if slots[i] != "" {
			return nil, fmt.Errorf("%w: %q and %q locked at %d", ErrLockConflict, slots[i], l.Item, i)
		}
		slots[i] = l.Item
	}
	free := slices.DeleteFunc(slices.Clone(order), func(it Item) bool { _, ok := locked[it]; return ok })
	for i := range slots {
		if slots[i] == "" {
			slots[i], free = free[0], free[1:]
		}
	}
	var all []Edge
	for _, es := range g.edges {
		all = append(all, es...)
	}
	if v := Violations(slots, all); len(v) > 0 {
		sortEdges(v)
		return nil, &ViolationError{Err: ErrLockConflict, Violated: v}
	}
	return slots, nil
}

// moves lists items outside the longest subsequence shared by both orders.
func moves(current, next []Item, g *graph) []Move {
	pos := positions(current)
	stay := stayers(current, next)
	var out []Move
	for to, it := range next {
		if stay[it] {
			continue
		}
		from := pos[it]
		var because []Edge
		for k, es := range g.edges {
			if (g.items[k[0]] == it || g.items[k[1]] == it) && pos[g.items[k[0]]] > pos[g.items[k[1]]] {
				because = append(because, es...)
			}
		}
		sortEdges(because)
		out = append(out, Move{Item: it, From: from, To: to, Because: because})
	}
	return out
}

func movedCount(current, next []Item) int { return len(next) - len(stayers(current, next)) }

// stayers is the longest increasing subsequence of current positions along
// next: the largest set of items whose relative order did not change.
func stayers(current, next []Item) map[Item]bool {
	pos := positions(current)
	seq := make([]int, len(next))
	for i, it := range next {
		seq[i] = pos[it]
	}
	var tails, tailIdx []int
	parent := make([]int, len(seq))
	for i, v := range seq {
		k := sort.SearchInts(tails, v)
		if k == len(tails) {
			tails, tailIdx = append(tails, v), append(tailIdx, i)
		} else {
			tails[k], tailIdx[k] = v, i
		}
		parent[i] = -1
		if k > 0 {
			parent[i] = tailIdx[k-1]
		}
	}
	out := make(map[Item]bool, len(tails))
	if len(tailIdx) > 0 {
		for i := tailIdx[len(tailIdx)-1]; i >= 0; i = parent[i] {
			out[next[i]] = true
		}
	}
	return out
}

func positions(order []Item) map[Item]int {
	pos := make(map[Item]int, len(order))
	for i, it := range order {
		pos[it] = i
	}
	return pos
}

func sortEdges(es []Edge) {
	slices.SortFunc(es, func(a, b Edge) int {
		if a.Ref != b.Ref {
			if a.Ref < b.Ref {
				return -1
			}
			return 1
		}
		if a.Before != b.Before {
			if a.Before < b.Before {
				return -1
			}
			return 1
		}
		if a.After < b.After {
			return -1
		}
		if a.After > b.After {
			return 1
		}
		return 0
	})
}

type intHeap struct {
	data []int
	less func(a, b int) bool
}

func (h *intHeap) Len() int           { return len(h.data) }
func (h *intHeap) Less(i, j int) bool { return h.less(h.data[i], h.data[j]) }
func (h *intHeap) Swap(i, j int)      { h.data[i], h.data[j] = h.data[j], h.data[i] }
func (h *intHeap) Push(x any)         { h.data = append(h.data, x.(int)) }
func (h *intHeap) Pop() any {
	x := h.data[len(h.data)-1]
	h.data = h.data[:len(h.data)-1]
	return x
}
