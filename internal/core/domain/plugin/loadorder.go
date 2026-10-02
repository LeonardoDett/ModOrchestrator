package plugin

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/ordering"
)

// Edge references (ordering.Edge.Ref) of the constraints the core builds.
// Adapter edges use their own references, prefixed with "adapter:" by
// convention (e.g. "adapter:master"), so explanations can tell them apart.
const (
	RefRulePrefix    = "rule:"
	RefGroupPrefix   = "group:"
	RefAdapterPrefix = "adapter:"
)

// Constraints are everything the ordering engine (D029) needs to order the
// load order of one profile (core/08 §4):
//   - Hard: adapter constraints (masters before dependents, master flag
//     before the rest...). INV-PLG-01: no load order is ever applied that
//     breaks one of them.
//   - Soft: user rules and groups; the sort enforces them and manual moves
//     must respect them, but a load order that breaks one is still valid
//     for the game.
//   - Fixed: implicit plugins in the fixed positions at the top, in order.
//   - Locks: user IndexLocks, position in the full load order by plugin key.
type Constraints struct {
	Hard  []ordering.Edge
	Soft  []ordering.Edge
	Fixed []Name
	Locks map[string]int
}

// All returns hard and soft edges.
func (c Constraints) All() []ordering.Edge { return append(slices.Clone(c.Hard), c.Soft...) }

// locks turns fixed plugins and user locks into engine locks over the
// plugins present in order. A user lock on a fixed plugin is ignored; a
// lock beyond the end of the order is clamped to the last position.
func (c Constraints) locks(order []Name) []ordering.Lock {
	present := map[string]bool{}
	for _, n := range order {
		present[n.Key()] = true
	}
	var out []ordering.Lock
	fixed := map[string]bool{}
	i := 0
	for _, n := range c.Fixed {
		if present[n.Key()] && !fixed[n.Key()] {
			fixed[n.Key()] = true
			out = append(out, ordering.Lock{Item: ordering.Item(n.Key()), Index: i})
			i++
		}
	}
	keys := make([]string, 0, len(c.Locks))
	for k := range c.Locks {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	for _, k := range keys {
		if !present[k] || fixed[k] {
			continue
		}
		idx := min(max(c.Locks[k], 0), len(order)-1)
		out = append(out, ordering.Lock{Item: ordering.Item(k), Index: idx})
	}
	return out
}

// Locked reports whether n cannot be moved by the user: a fixed (implicit)
// plugin or one with an IndexLock.
func (c Constraints) Locked(n Name) bool {
	if slices.ContainsFunc(c.Fixed, func(f Name) bool { return f.Key() == n.Key() }) {
		return true
	}
	_, ok := c.Locks[n.Key()]
	return ok
}

// Errors of the load order operations.
var (
	// ErrViolates: the requested order breaks a constraint; the
	// *ordering.ViolationError lists which.
	ErrViolates = errors.New("plugin: order violates constraints")
	// ErrLocked: a fixed or locked plugin cannot be moved by hand.
	ErrLocked = errors.New("plugin: plugin is locked in place")
)

// Move is one plugin that changed position, with the constraints it broke
// in the previous order.
type Move struct {
	Plugin   Name
	From, To int
	Because  []ordering.Edge
}

// Result is a load order produced by the engine and how it differs from
// the previous one.
type Result struct {
	Order []Name
	Moves []Move
}

// Changed reports whether the order differs from the previous one.
func (r Result) Changed() bool { return len(r.Moves) > 0 }

// Sort is "Ordenar agora" and auto-sort (core/08 §5): every constraint,
// starting from the current order (minimal movement, ordering.Solve). A
// sort over an order that already satisfies everything changes nothing.
func Sort(current []Name, c Constraints) (Result, error) {
	return solve(current, c.All(), c)
}

// Settle keeps the current order except where a hard constraint or a fixed
// position is broken (new plugins, changed masters, auto-sort off). It is
// how INV-PLG-01 holds without a sort.
func Settle(current []Name, c Constraints) (Result, error) {
	return solve(current, c.Hard, c)
}

func solve(current []Name, edges []ordering.Edge, c Constraints) (Result, error) {
	if err := ValidateOrder(current); err != nil {
		return Result{}, err
	}
	names := byKey(current)
	res, err := ordering.Solve(ordering.Input{Current: items(current), Edges: edges, Locks: c.locks(current)})
	if err != nil {
		return Result{}, err
	}
	out := Result{Order: make([]Name, len(res.Order))}
	for i, it := range res.Order {
		out.Order[i] = names[string(it)]
	}
	for _, m := range res.Moves {
		out.Moves = append(out.Moves, Move{Plugin: names[string(m.Item)], From: m.From, To: m.To, Because: m.Because})
	}
	return out, nil
}

// Violations returns the edges order breaks.
func Violations(order []Name, edges []ordering.Edge) []ordering.Edge {
	return ordering.Violations(items(order), edges)
}

// Placement is the answer to a manual move (core/08 §5, same UX as
// core/05 §4): the requested order, the constraints it breaks and the
// nearest valid alternative.
type Placement struct {
	Order    []Name
	Violated []ordering.Edge
	// Nearest is the position (in the full order) where the block's first
	// plugin lands in NearestOrder; -1 when no position is valid.
	Nearest      int
	NearestOrder []Name
	// NearestIndex is the index to give Place again to obtain
	// NearestOrder ("Mover para a posição válida mais próxima").
	NearestIndex int
}

// Valid reports whether the requested move satisfies every constraint.
func (p Placement) Valid() bool { return len(p.Violated) == 0 }

// Place moves block (kept in its relative order) so that its first plugin
// lands at index of the full order. Fixed and locked plugins never move:
// the block is placed among the others and the locked ones keep their
// positions. Every constraint (hard and soft) must hold. Nothing is applied.
func Place(order, block []Name, index int, c Constraints) (Placement, error) {
	if err := ValidateOrder(order); err != nil {
		return Placement{}, err
	}
	in := map[string]bool{}
	for _, b := range block {
		if !slices.ContainsFunc(order, func(n Name) bool { return n.Key() == b.Key() }) {
			return Placement{}, fmt.Errorf("%w: %q", ErrNotFound, b)
		}
		if c.Locked(b) {
			return Placement{}, fmt.Errorf("%w: %q", ErrLocked, b)
		}
		in[b.Key()] = true
	}
	if len(in) == 0 {
		return Placement{}, fmt.Errorf("%w: nothing to move", ErrInvalid)
	}
	locks := c.locks(order)
	pinned := map[string]bool{}
	for _, l := range locks {
		pinned[string(l.Item)] = true
	}
	var free []Name // the order without pinned plugins
	for _, n := range order {
		if !pinned[n.Key()] {
			free = append(free, n)
		}
	}
	// index in the full order -> index among the free plugins without the
	// block (the insertion point ordering.Place expects).
	target := 0
	for i, n := range order {
		if i >= index {
			break
		}
		if !pinned[n.Key()] && !in[n.Key()] {
			target++
		}
	}
	edges := c.All()
	names := byKey(order)
	rebuild := func(freeOrder []ordering.Item) []Name {
		slots := make([]Name, len(order))
		for _, l := range locks {
			slots[l.Index] = names[string(l.Item)]
		}
		j := 0
		for i := range slots {
			if slots[i] == "" {
				slots[i] = names[string(freeOrder[j])]
				j++
			}
		}
		return slots
	}
	var blockItems []ordering.Item
	first := Name("")
	for _, n := range free {
		if in[n.Key()] && first == "" {
			first = n
		}
		if in[n.Key()] {
			blockItems = append(blockItems, ordering.Item(n.Key()))
		}
	}
	freeItems := items(free)
	rest := len(free) - len(blockItems)
	try := func(i int) []Name {
		pl, err := ordering.Place(freeItems, blockItems, i, nil)
		if err != nil {
			return nil
		}
		return rebuild(pl.Order)
	}
	// fullIndex turns an insertion point among the free plugins back into
	// an index of the full order for a later call.
	fullIndex := func(i int) int {
		n := 0
		for k, o := range order {
			if pinned[o.Key()] || in[o.Key()] {
				continue
			}
			if n == i {
				return k
			}
			n++
		}
		return len(order)
	}
	requested := try(min(target, rest))
	p := Placement{Order: requested, Nearest: -1, NearestIndex: -1}
	p.Violated = Violations(requested, edges)
	if p.Valid() {
		p.Nearest, p.NearestOrder, p.NearestIndex = positionOf(requested, first), requested, index
		return p, nil
	}
	for d := 1; d <= rest; d++ {
		for _, i := range []int{target - d, target + d} {
			if i < 0 || i > rest {
				continue
			}
			if cand := try(i); cand != nil && len(Violations(cand, edges)) == 0 {
				p.Nearest, p.NearestOrder, p.NearestIndex = positionOf(cand, first), cand, fullIndex(i)
				return p, nil
			}
		}
	}
	return p, nil
}

// Merge reconciles a persisted load order with the current inventory
// (core/08 §3): plugins that left the inventory leave the order (their
// PluginState is kept by the profile), plugins still present keep their
// relative order, and new plugins are appended in inventory order. The
// engine then moves what must move (Sort or Settle).
func Merge(persisted, inventory []Name) (merged, added, removed []Name) {
	present := map[string]bool{}
	for _, n := range inventory {
		present[n.Key()] = true
	}
	seen := map[string]bool{}
	for _, n := range persisted {
		if present[n.Key()] && !seen[n.Key()] {
			seen[n.Key()] = true
			merged = append(merged, n)
		} else if !present[n.Key()] {
			removed = append(removed, n)
		}
	}
	// Names keep the spelling of the inventory (the file on disk).
	spelling := byKey(inventory)
	for i, n := range merged {
		merged[i] = spelling[n.Key()]
	}
	for _, n := range inventory {
		if !seen[n.Key()] {
			seen[n.Key()] = true
			merged = append(merged, n)
			added = append(added, n)
		}
	}
	return merged, added, removed
}

// Reason is one constraint that holds a plugin where it is, for the
// "why is it here" panel of the Load Order screen (ui/telas/load-order.md
// §3). Kind is "master", "rule", "group" or an adapter kind; Other is the
// plugin on the other side.
type Reason struct {
	Kind  string
	Ref   string
	Other Name
	// Before is true when Other must load before the plugin (the plugin
	// loads after it); false when Other must load after it (a dependent).
	Before bool
}

// Explain lists the constraints between n and the other plugins of order.
func Explain(n Name, order []Name, c Constraints) []Reason {
	names := byKey(order)
	var out []Reason
	seen := map[string]bool{}
	for _, e := range c.All() {
		var other ordering.Item
		before := false
		switch Name(e.After).Key() {
		case n.Key():
			other, before = e.Before, true
		default:
			if Name(e.Before).Key() != n.Key() {
				continue
			}
			other = e.After
		}
		o, ok := names[string(other)]
		if !ok {
			continue
		}
		k := fmt.Sprintf("%s|%s|%t", e.Ref, other, before)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, Reason{Kind: RefKind(e.Ref), Ref: e.Ref, Other: o, Before: before})
	}
	return out
}

// RefKind is the kind of an edge reference: "rule", "group" or the adapter
// kind after "adapter:".
func RefKind(ref string) string {
	switch {
	case strings.HasPrefix(ref, RefRulePrefix):
		return "rule"
	case strings.HasPrefix(ref, RefGroupPrefix):
		return "group"
	case strings.HasPrefix(ref, RefAdapterPrefix):
		return strings.TrimPrefix(ref, RefAdapterPrefix)
	}
	return ref
}

// Moved counts the plugins that changed place between two orders of the
// same plugins (the measure of a "large" sort, core/07 §6).
func Moved(before, after []Name) int {
	return ordering.Displacement(items(before), items(after))
}

func items(names []Name) []ordering.Item {
	out := make([]ordering.Item, len(names))
	for i, n := range names {
		out[i] = ordering.Item(n.Key())
	}
	return out
}

func byKey(names []Name) map[string]Name {
	out := make(map[string]Name, len(names))
	for _, n := range names {
		out[n.Key()] = n
	}
	return out
}

func positionOf(order []Name, n Name) int {
	return slices.IndexFunc(order, func(o Name) bool { return o.Key() == n.Key() })
}
