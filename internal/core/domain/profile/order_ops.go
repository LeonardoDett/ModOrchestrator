package profile

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

// Anchor says where a block of entries goes, relative to the order without
// the block (core/05 §4: drag, "send to top/bottom", "move to…").
type Anchor struct {
	Kind AnchorKind
	// Entry is the reference of Before, After and EndOfBlock.
	Entry Entry
	// Priority is the 1-based priority the first moved mod should get
	// (AnchorPriority).
	Priority int
}

// AnchorKind is how an Anchor is interpreted.
type AnchorKind string

const (
	AnchorTop    AnchorKind = "top"
	AnchorBottom AnchorKind = "bottom"
	AnchorBefore AnchorKind = "before"
	AnchorAfter  AnchorKind = "after"
	// AnchorEndOfBlock places the block at the end of the separator block
	// Entry (a separator), before the next separator.
	AnchorEndOfBlock AnchorKind = "end_of_block"
	AnchorPriority   AnchorKind = "priority"
)

// Resolve turns the anchor into the insertion index Move expects: an index
// of the order once the moved entries are taken out of it.
func (p *Profile) Resolve(entries []Entry, a Anchor) (int, error) {
	block, err := p.expandBlock(entries)
	if err != nil {
		return 0, err
	}
	moving := map[ordering.Item]bool{}
	for _, it := range block {
		moving[it] = true
	}
	var rest []Entry
	for _, e := range p.d.Order {
		if !moving[itemOf(e)] {
			rest = append(rest, e)
		}
	}
	find := func() (int, error) {
		i := slices.Index(rest, a.Entry)
		if i < 0 {
			return 0, fmt.Errorf("%w: anchor is not in the order or is being moved", ErrInvalid)
		}
		return i, nil
	}
	switch a.Kind {
	case AnchorTop:
		return 0, nil
	case AnchorBottom:
		return len(rest), nil
	case AnchorBefore:
		return find()
	case AnchorAfter:
		i, err := find()
		return i + 1, err
	case AnchorEndOfBlock:
		i, err := find()
		if err != nil {
			return 0, err
		}
		if a.Entry.Separator == "" {
			return 0, fmt.Errorf("%w: end of block needs a separator", ErrInvalid)
		}
		for j := i + 1; j < len(rest); j++ {
			if rest[j].Separator != "" {
				return j, nil
			}
		}
		return len(rest), nil
	case AnchorPriority:
		if a.Priority < 1 {
			return 0, fmt.Errorf("%w: priority starts at 1", ErrInvalid)
		}
		n := 0
		for j, e := range rest {
			if e.Mod != "" {
				n++
				if n == a.Priority {
					return j, nil
				}
			}
		}
		return len(rest), nil
	}
	return 0, fmt.Errorf("%w: unknown anchor %q", ErrInvalid, a.Kind)
}

// BlockMods returns the mods of a separator block: those after it and before
// the next separator (core/05 §1).
func (p *Profile) BlockMods(id SeparatorID) ([]mod.ID, error) {
	i := slices.Index(p.d.Order, Entry{Separator: id})
	if i < 0 {
		return nil, fmt.Errorf("%w: separator %q", ErrNotFound, id)
	}
	var out []mod.ID
	for _, e := range p.d.Order[i+1:] {
		if e.Separator != "" {
			break
		}
		out = append(out, e.Mod)
	}
	return out, nil
}

// SeparatorOf returns the separator whose block holds m, if any.
func (p *Profile) SeparatorOf(m mod.ID) (SeparatorID, bool) {
	var current SeparatorID
	for _, e := range p.d.Order {
		if e.Separator != "" {
			current = e.Separator
		}
		if e.Mod == m {
			return current, current != ""
		}
	}
	return "", false
}

// Separator returns one declared separator.
func (p *Profile) Separator(id SeparatorID) (Separator, bool) {
	i := slices.IndexFunc(p.d.Separators, func(s Separator) bool { return s.ID == id })
	if i < 0 {
		return Separator{}, false
	}
	return p.d.Separators[i], true
}

// ReplaceOrder sets a new mod order with its separators, as long as it
// holds exactly the mods the profile already has (INV-ORD-02). It is how a
// transfer, an undo or a snapshot restore change positions; validation
// against the order rules is the caller's (Violations/Reorder).
func (p *Profile) ReplaceOrder(order []Entry, separators []Separator, now time.Time) error {
	d := cloneData(p.d)
	d.Order, d.Separators = slices.Clone(order), slices.Clone(separators)
	next, err := Restore(d)
	if err != nil {
		return err
	}
	p.d = next.d
	p.touch(now)
	return nil
}

// Violations returns the order rules (as mod edges) the current order
// breaks: empty means INV-ORD-03 holds for this profile.
func (p *Profile) Violations(edges []ordering.Edge) []ordering.Edge {
	return p.modEdges(ordering.Violations(p.items(), p.itemEdges(edges)))
}

// TransferOptions says what TransferFrom copies besides the selection.
type TransferOptions struct {
	Order   bool
	Plugins bool
}

// TransferFrom copies the selection of src into p (core/07 §2, Vortex
// TransferDialog): every mod both profiles know gets the enabled state it
// has in src. With Order, the mod order and separators of src are copied
// too (mods only p knows keep their relative place at the end); with
// Plugins, plugin states, load order and locks. Rules are applied by the
// caller afterwards.
func (p *Profile) TransferFrom(src *Profile, opts TransferOptions, now time.Time) error {
	if src.d.Instance != p.d.Instance {
		return fmt.Errorf("%w: profiles of different instances", ErrInvalid)
	}
	for m, st := range p.d.Mods {
		if other, ok := src.d.Mods[m]; ok && other.Enabled != st.Enabled {
			st.Enabled, st.EnabledAt = other.Enabled, time.Time{}
			if other.Enabled {
				st.EnabledAt = now
			}
			p.d.Mods[m] = st
		}
	}
	if opts.Order {
		var order []Entry
		for _, e := range src.d.Order {
			if _, ok := p.d.Mods[e.Mod]; e.Separator != "" || ok {
				order = append(order, e)
			}
		}
		for _, e := range p.d.Order {
			if _, ok := src.d.Mods[e.Mod]; e.Mod != "" && !ok {
				order = append(order, e)
			}
		}
		if err := p.ReplaceOrder(order, src.d.Separators, now); err != nil {
			return err
		}
	}
	if opts.Plugins {
		c := cloneData(src.d)
		p.d.PluginsEnabled, p.d.LoadOrder, p.d.IndexLocks = c.PluginsEnabled, c.LoadOrder, c.IndexLocks
	}
	p.touch(now)
	return nil
}

// NewFromOrder creates a profile with every mod of base disabled and base's
// mod order and separators (core/07 §2 "vazio": positions are preserved so
// enabling a mod later does not surprise).
func NewFromOrder(id ID, name string, base *Profile, now time.Time) (*Profile, error) {
	d := Data{
		ID: id, Instance: base.d.Instance, Name: name, CreatedAt: now, UpdatedAt: now,
		Order: slices.Clone(base.d.Order), Separators: slices.Clone(base.d.Separators),
		Mods: make(map[mod.ID]ModState, len(base.d.Mods)),
	}
	for m := range base.d.Mods {
		d.Mods[m] = ModState{}
	}
	return Restore(d)
}

// Comparison is the difference between two profiles (core/07 §5). Mod
// lists follow the priority order of the profile they come from.
type Comparison struct {
	OnlyA, OnlyB     []mod.ID
	PriorityChanged  []PriorityChange
	PluginsOnlyA     []plugin.Name
	PluginsOnlyB     []plugin.Name
	LoadOrderChanged []LoadOrderChange
}

// PriorityChange is a mod enabled in both profiles at different priorities.
type PriorityChange struct {
	Mod  mod.ID
	A, B int
}

// LoadOrderChange is a plugin at a different position of the load order.
type LoadOrderChange struct {
	Plugin plugin.Name
	A, B   int
}

// Compare returns what differs between a and b.
func Compare(a, b *Profile) Comparison {
	var c Comparison
	for _, m := range a.EnabledMods() {
		if !b.IsEnabled(m) {
			c.OnlyA = append(c.OnlyA, m)
		}
	}
	for _, m := range b.EnabledMods() {
		if !a.IsEnabled(m) {
			c.OnlyB = append(c.OnlyB, m)
		}
	}
	for _, m := range a.EnabledMods() {
		if b.IsEnabled(m) {
			pa, _ := a.Priority(m)
			pb, _ := b.Priority(m)
			if pa != pb {
				c.PriorityChanged = append(c.PriorityChanged, PriorityChange{Mod: m, A: pa, B: pb})
			}
		}
	}
	active := func(p *Profile) []plugin.Name {
		var out []plugin.Name
		for n, on := range p.d.PluginsEnabled {
			if on {
				out = append(out, n)
			}
		}
		slices.SortFunc(out, func(x, y plugin.Name) int { return strings.Compare(x.Key(), y.Key()) })
		return out
	}
	pa, pb := active(a), active(b)
	for _, n := range pa {
		if on, _ := b.PluginEnabled(n); !on {
			c.PluginsOnlyA = append(c.PluginsOnlyA, n)
		}
	}
	for _, n := range pb {
		if on, _ := a.PluginEnabled(n); !on {
			c.PluginsOnlyB = append(c.PluginsOnlyB, n)
		}
	}
	posB := map[string]int{}
	for i, n := range b.d.LoadOrder {
		posB[n.Key()] = i + 1
	}
	for i, n := range a.d.LoadOrder {
		if j, ok := posB[n.Key()]; ok && j != i+1 {
			c.LoadOrderChanged = append(c.LoadOrderChanged, LoadOrderChange{Plugin: n, A: i + 1, B: j})
		}
	}
	return c
}

// EncodeOrder writes an order as one line per entry ("m:<id>" or
// "s:<id>"), the compact form kept in order.changed events so an order
// change can be reverted from history (core/10 §3).
func EncodeOrder(order []Entry) string {
	var b strings.Builder
	for i, e := range order {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(string(itemOf(e)))
	}
	return b.String()
}

// DecodeOrder reads what EncodeOrder wrote.
func DecodeOrder(s string) ([]Entry, error) {
	if s == "" {
		return nil, nil
	}
	lines := strings.Split(s, "\n")
	out := make([]Entry, len(lines))
	for i, l := range lines {
		if !strings.HasPrefix(l, modPrefix) && !strings.HasPrefix(l, sepPrefix) {
			return nil, fmt.Errorf("%w: order entry %q", ErrInvalid, l)
		}
		out[i] = entryOf(ordering.Item(l))
	}
	return out, nil
}

// PruneSnapshots returns the automatic snapshots beyond the newest keep
// ones (core/07 §6: manual restore points are never pruned).
func PruneSnapshots(list []Snapshot, keep int) []SnapshotID {
	autos := slices.DeleteFunc(slices.Clone(list), func(s Snapshot) bool { return s.Reason == SnapshotManual })
	slices.SortStableFunc(autos, func(a, b Snapshot) int { return b.CreatedAt.Compare(a.CreatedAt) })
	var out []SnapshotID
	for i, s := range autos {
		if i >= keep {
			out = append(out, s.ID)
		}
	}
	return out
}

// Displacement counts the entries that changed place between two orders
// (ordering.Displacement over mods and separators).
func Displacement(before, after []Entry) int {
	conv := func(es []Entry) []ordering.Item {
		out := make([]ordering.Item, len(es))
		for i, e := range es {
			out[i] = itemOf(e)
		}
		return out
	}
	return ordering.Displacement(conv(before), conv(after))
}
