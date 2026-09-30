// Package profile models a Profile: one named configuration of a game
// instance (core/07). State category: desired. A profile holds selection and
// position only: which mods are enabled, the mod order with separators
// (D025), which plugins are enabled, the load order and index locks. Content
// decisions (rules, overrides, exclusions, plugin rules and groups) belong to
// the instance (D026); calculated results and applied state never live here.
package profile

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

// ID identifies a profile.
type ID string

// SeparatorID identifies a separator of the mod order.
type SeparatorID string

// Errors returned by profile operations.
var (
	ErrInvalid   = errors.New("profile: invalid")
	ErrNotFound  = errors.New("profile: not found in profile")
	ErrDuplicate = errors.New("profile: duplicate")
	// ErrOrderViolation wraps *MoveRefusal: the requested position breaks
	// order rules and nothing was changed (core/05 §4).
	ErrOrderViolation = errors.New("profile: position violates order rules")
)

// Features declares the optional per-profile namespaces (V1.x, capability).
type Features struct {
	LocalSaves    bool
	LocalSettings bool
}

// Separator groups mods visually. It has no files and no deploy effect.
type Separator struct {
	ID        SeparatorID
	Label     string
	Color     string
	Collapsed bool
}

// Entry is one position of the mod order: a mod or a separator.
type Entry struct {
	Mod       mod.ID
	Separator SeparatorID
}

// ModState is the per-profile state of a mod (ModEntry in core/01).
type ModState struct {
	Enabled   bool
	EnabledAt time.Time
}

// Data is the plain representation used to persist and restore a profile.
type Data struct {
	ID              ID
	Instance        game.InstanceID
	Name            string
	Notes           string
	Features        Features
	Order           []Entry
	Separators      []Separator
	Mods            map[mod.ID]ModState
	PluginsEnabled  map[plugin.Name]bool
	LoadOrder       []plugin.Name
	IndexLocks      map[plugin.Name]int
	CreatedAt       time.Time
	UpdatedAt       time.Time
	LastActivatedAt time.Time
}

// Profile is the aggregate holding selection and position of an instance.
type Profile struct {
	d Data
}

// New creates an empty profile.
func New(id ID, instance game.InstanceID, name string, now time.Time) (*Profile, error) {
	return Restore(Data{ID: id, Instance: instance, Name: name, CreatedAt: now, UpdatedAt: now})
}

// Restore rebuilds a profile from persisted data, enforcing every invariant:
// each mod appears once in the order and has a state (INV-ORD-02 for the
// mods the profile knows), separators are declared once, the load order has
// no duplicates.
func Restore(d Data) (*Profile, error) {
	if d.ID == "" || d.Instance == "" {
		return nil, fmt.Errorf("%w: profile needs id and instance", ErrInvalid)
	}
	if strings.TrimSpace(d.Name) == "" {
		return nil, fmt.Errorf("%w: profile needs a name", ErrInvalid)
	}
	p := &Profile{d: cloneData(d)}
	if p.d.Mods == nil {
		p.d.Mods = map[mod.ID]ModState{}
	}
	if p.d.PluginsEnabled == nil {
		p.d.PluginsEnabled = map[plugin.Name]bool{}
	}
	if p.d.IndexLocks == nil {
		p.d.IndexLocks = map[plugin.Name]int{}
	}
	seps := map[SeparatorID]bool{}
	for _, s := range p.d.Separators {
		if s.ID == "" || seps[s.ID] {
			return nil, fmt.Errorf("%w: separator %q empty or duplicated", ErrInvalid, s.ID)
		}
		seps[s.ID] = true
	}
	seenMod, seenSep := map[mod.ID]bool{}, map[SeparatorID]bool{}
	for _, e := range p.d.Order {
		switch {
		case e.Mod != "" && e.Separator == "":
			if seenMod[e.Mod] {
				return nil, fmt.Errorf("%w: mod %q listed twice", ErrDuplicate, e.Mod)
			}
			if _, ok := p.d.Mods[e.Mod]; !ok {
				return nil, fmt.Errorf("%w: mod %q has no state", ErrInvalid, e.Mod)
			}
			seenMod[e.Mod] = true
		case e.Separator != "" && e.Mod == "":
			if !seps[e.Separator] || seenSep[e.Separator] {
				return nil, fmt.Errorf("%w: separator %q unknown or listed twice", ErrInvalid, e.Separator)
			}
			seenSep[e.Separator] = true
		default:
			return nil, fmt.Errorf("%w: order entry must be a mod or a separator", ErrInvalid)
		}
	}
	if len(seenMod) != len(p.d.Mods) || len(seenSep) != len(seps) {
		return nil, fmt.Errorf("%w: every mod and separator must appear in the order exactly once", ErrInvalid)
	}
	if err := plugin.ValidateOrder(p.d.LoadOrder); err != nil {
		return nil, err
	}
	return p, nil
}

// Data returns a deep copy for persistence.
func (p *Profile) Data() Data { return cloneData(p.d) }

func (p *Profile) ID() ID                    { return p.d.ID }
func (p *Profile) Instance() game.InstanceID { return p.d.Instance }
func (p *Profile) Name() string              { return p.d.Name }
func (p *Profile) Notes() string             { return p.d.Notes }
func (p *Profile) Features() Features        { return p.d.Features }
func (p *Profile) UpdatedAt() time.Time      { return p.d.UpdatedAt }

// Order returns the mod order with separators.
func (p *Profile) Order() []Entry { return slices.Clone(p.d.Order) }

// Separators returns the declared separators.
func (p *Profile) Separators() []Separator { return slices.Clone(p.d.Separators) }

// Rename changes the display name. Uniqueness inside the instance is checked
// by the application layer, which sees every profile.
func (p *Profile) Rename(name string, now time.Time) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("%w: profile needs a name", ErrInvalid)
	}
	p.d.Name = name
	p.touch(now)
	return nil
}

// SetNotes replaces the notes.
func (p *Profile) SetNotes(notes string, now time.Time) { p.d.Notes = notes; p.touch(now) }

// SetFeatures changes which per-profile namespaces are used.
func (p *Profile) SetFeatures(f Features, now time.Time) { p.d.Features = f; p.touch(now) }

// MarkActivated records when the profile became the active one.
func (p *Profile) MarkActivated(now time.Time) { p.d.LastActivatedAt = now }

// AddMod appends a mod at the highest priority (core/02 §8). Whether it
// starts enabled is the "enable on install" setting, decided by the caller.
// Order rules are applied afterwards with Reorder.
func (p *Profile) AddMod(m mod.ID, enabled bool, now time.Time) error {
	if m == "" {
		return fmt.Errorf("%w: empty mod", ErrInvalid)
	}
	if _, ok := p.d.Mods[m]; ok {
		return fmt.Errorf("%w: mod %q already in profile", ErrDuplicate, m)
	}
	st := ModState{Enabled: enabled}
	if enabled {
		st.EnabledAt = now
	}
	p.d.Mods[m] = st
	p.d.Order = append(p.d.Order, Entry{Mod: m})
	p.touch(now)
	return nil
}

// RemoveMod drops a mod from the profile. Rules that mention it live in the
// instance and become orphans there (INV-LIB-05).
func (p *Profile) RemoveMod(m mod.ID, now time.Time) error {
	if _, ok := p.d.Mods[m]; !ok {
		return fmt.Errorf("%w: mod %q", ErrNotFound, m)
	}
	delete(p.d.Mods, m)
	p.d.Order = slices.DeleteFunc(p.d.Order, func(e Entry) bool { return e.Mod == m })
	p.touch(now)
	return nil
}

// SetEnabled enables or disables a mod. It keeps its position.
func (p *Profile) SetEnabled(m mod.ID, enabled bool, now time.Time) error {
	st, ok := p.d.Mods[m]
	if !ok {
		return fmt.Errorf("%w: mod %q", ErrNotFound, m)
	}
	if st.Enabled != enabled {
		st.Enabled = enabled
		st.EnabledAt = time.Time{}
		if enabled {
			st.EnabledAt = now
		}
		p.d.Mods[m] = st
		p.touch(now)
	}
	return nil
}

// ModState returns the state of m.
func (p *Profile) ModState(m mod.ID) (ModState, bool) {
	st, ok := p.d.Mods[m]
	return st, ok
}

// IsEnabled reports whether m is in the profile and enabled.
func (p *Profile) IsEnabled(m mod.ID) bool { return p.d.Mods[m].Enabled }

// Mods returns every mod in priority order (lowest first).
func (p *Profile) Mods() []mod.ID {
	var out []mod.ID
	for _, e := range p.d.Order {
		if e.Mod != "" {
			out = append(out, e.Mod)
		}
	}
	return out
}

// EnabledMods returns the enabled mods in priority order (lowest first; the
// last one wins file conflicts by default).
func (p *Profile) EnabledMods() []mod.ID {
	return slices.DeleteFunc(p.Mods(), func(m mod.ID) bool { return !p.d.Mods[m].Enabled })
}

// Priority returns the 1-based priority of m; separators do not count
// (core/01 ModOrder). Higher wins.
func (p *Profile) Priority(m mod.ID) (int, bool) {
	i := slices.Index(p.Mods(), m)
	return i + 1, i >= 0
}

// AddSeparator inserts a separator at index of the order (clamped).
func (p *Profile) AddSeparator(s Separator, index int, now time.Time) error {
	if s.ID == "" {
		return fmt.Errorf("%w: separator needs an id", ErrInvalid)
	}
	if slices.ContainsFunc(p.d.Separators, func(o Separator) bool { return o.ID == s.ID }) {
		return fmt.Errorf("%w: separator %q", ErrDuplicate, s.ID)
	}
	index = min(max(index, 0), len(p.d.Order))
	p.d.Separators = append(p.d.Separators, s)
	p.d.Order = slices.Insert(p.d.Order, index, Entry{Separator: s.ID})
	p.touch(now)
	return nil
}

// UpdateSeparator changes label, colour or collapsed state.
func (p *Profile) UpdateSeparator(s Separator, now time.Time) error {
	i := slices.IndexFunc(p.d.Separators, func(o Separator) bool { return o.ID == s.ID })
	if i < 0 {
		return fmt.Errorf("%w: separator %q", ErrNotFound, s.ID)
	}
	p.d.Separators[i] = s
	p.touch(now)
	return nil
}

// RemoveSeparator deletes a separator; its mods stay where they are.
func (p *Profile) RemoveSeparator(id SeparatorID, now time.Time) error {
	i := slices.IndexFunc(p.d.Separators, func(o Separator) bool { return o.ID == id })
	if i < 0 {
		return fmt.Errorf("%w: separator %q", ErrNotFound, id)
	}
	p.d.Separators = slices.Delete(p.d.Separators, i, i+1)
	p.d.Order = slices.DeleteFunc(p.d.Order, func(e Entry) bool { return e.Separator == id })
	p.touch(now)
	return nil
}

// MoveRefusal explains why a move was not applied and what is possible.
type MoveRefusal struct {
	// Violated are the order rules the requested position breaks (edge Ref
	// is the rule id).
	Violated []ordering.Edge
	// Nearest is the closest valid index, or -1; NearestOrder is the order
	// it would produce.
	Nearest      int
	NearestOrder []Entry
}

func (r *MoveRefusal) Error() string {
	return fmt.Sprintf("%v: %d rule(s)", ErrOrderViolation, len(r.Violated))
}
func (r *MoveRefusal) Unwrap() error { return ErrOrderViolation }

// Move places the given entries (kept in relative order) at index of the
// order, validated against edges (enabled order rules of the instance, as
// mod ids). Moving a separator moves its whole block (MO2). An invalid
// position changes nothing and returns *MoveRefusal (core/05 §4); applying
// the nearest valid position is a second, explicit call.
func (p *Profile) Move(entries []Entry, index int, edges []ordering.Edge, now time.Time) error {
	block, err := p.expandBlock(entries)
	if err != nil {
		return err
	}
	pl, err := ordering.Place(p.items(), block, index, p.itemEdges(edges))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if !pl.Valid() {
		ref := &MoveRefusal{Violated: p.modEdges(pl.Violated), Nearest: pl.Nearest}
		if pl.Nearest >= 0 {
			ref.NearestOrder = p.entries(pl.NearestOrder)
		}
		return ref
	}
	p.d.Order = p.entries(pl.Order)
	p.touch(now)
	return nil
}

// Reorder applies the order rules with minimal movement (D025/D029) and
// returns the moves, expressed as entries. On a cycle nothing changes and
// the *ordering.CycleError is returned.
func (p *Profile) Reorder(edges []ordering.Edge, now time.Time) ([]OrderMove, error) {
	moves, next, err := p.PreviewReorder(edges)
	if err != nil {
		return nil, err
	}
	if len(moves) > 0 {
		p.d.Order = next
		p.touch(now)
	}
	return moves, nil
}

// OrderMove is one movement caused by Reorder, with the rules that caused it.
type OrderMove struct {
	Entry    Entry
	From, To int
	Because  []ordering.Edge
}

// PreviewReorder computes Reorder without applying it (core/05 §4: rule
// creation shows the impact on every profile before confirming).
func (p *Profile) PreviewReorder(edges []ordering.Edge) ([]OrderMove, []Entry, error) {
	res, err := ordering.Solve(ordering.Input{Current: p.items(), Edges: p.itemEdges(edges)})
	if err != nil {
		var ce *ordering.CycleError
		if errors.As(err, &ce) {
			return nil, nil, &ordering.CycleError{Cycle: ordering.Cycle{Items: p.modItems(ce.Cycle.Items), Edges: p.modEdges(ce.Cycle.Edges)}}
		}
		return nil, nil, err
	}
	var moves []OrderMove
	for _, m := range res.Moves {
		moves = append(moves, OrderMove{Entry: entryOf(m.Item), From: m.From, To: m.To, Because: p.modEdges(m.Because)})
	}
	return moves, p.entries(res.Order), nil
}

// SetPluginEnabled records the enabled state of a plugin. The state is kept
// even when the plugin leaves the inventory (core/08 §3).
func (p *Profile) SetPluginEnabled(n plugin.Name, enabled bool, now time.Time) error {
	if strings.TrimSpace(string(n)) == "" {
		return fmt.Errorf("%w: empty plugin name", ErrInvalid)
	}
	for k := range p.d.PluginsEnabled {
		if k.Key() == n.Key() {
			delete(p.d.PluginsEnabled, k)
		}
	}
	p.d.PluginsEnabled[n] = enabled
	p.touch(now)
	return nil
}

// PluginEnabled returns the recorded state of a plugin and whether one
// exists.
func (p *Profile) PluginEnabled(n plugin.Name) (enabled, known bool) {
	for k, v := range p.d.PluginsEnabled {
		if k.Key() == n.Key() {
			return v, true
		}
	}
	return false, false
}

// LoadOrder returns the desired load order.
func (p *Profile) LoadOrder() []plugin.Name { return slices.Clone(p.d.LoadOrder) }

// SetLoadOrder replaces the desired load order (produced by the ordering
// engine or a validated manual move; never by the UI directly).
func (p *Profile) SetLoadOrder(order []plugin.Name, now time.Time) error {
	if err := plugin.ValidateOrder(order); err != nil {
		return err
	}
	p.d.LoadOrder = slices.Clone(order)
	p.touch(now)
	return nil
}

// SetIndexLock pins a plugin at a position of the load order; a negative
// index removes the lock.
func (p *Profile) SetIndexLock(n plugin.Name, index int, now time.Time) error {
	for k := range p.d.IndexLocks {
		if k.Key() == n.Key() {
			delete(p.d.IndexLocks, k)
		}
	}
	if index >= 0 {
		for k, i := range p.d.IndexLocks {
			if i == index {
				return fmt.Errorf("%w: %q is already locked at %d", ErrDuplicate, k, index)
			}
		}
		p.d.IndexLocks[n] = index
	}
	p.touch(now)
	return nil
}

// IndexLocks returns the locks as ordering locks over plugin keys.
func (p *Profile) IndexLocks() []ordering.Lock {
	var out []ordering.Lock
	for n, i := range p.d.IndexLocks {
		out = append(out, ordering.Lock{Item: ordering.Item(n.Key()), Index: i})
	}
	slices.SortFunc(out, func(a, b ordering.Lock) int { return a.Index - b.Index })
	return out
}

// Clone creates a new profile of the same instance (core/07 §3): selection,
// mod order, separators, plugin states, load order, locks, notes and
// features are copied. Rules and overrides are shared through the instance;
// snapshots are not copied.
func (p *Profile) Clone(id ID, name string, now time.Time) (*Profile, error) {
	d := p.Data()
	d.ID, d.Name, d.CreatedAt, d.UpdatedAt, d.LastActivatedAt = id, name, now, now, time.Time{}
	return Restore(d)
}

func (p *Profile) touch(now time.Time) { p.d.UpdatedAt = now }

// Order items are prefixed so a mod id can never collide with a separator
// id inside the engine.
const (
	modPrefix = "m:"
	sepPrefix = "s:"
)

func itemOf(e Entry) ordering.Item {
	if e.Mod != "" {
		return ordering.Item(modPrefix + string(e.Mod))
	}
	return ordering.Item(sepPrefix + string(e.Separator))
}

func entryOf(it ordering.Item) Entry {
	s := string(it)
	if strings.HasPrefix(s, modPrefix) {
		return Entry{Mod: mod.ID(strings.TrimPrefix(s, modPrefix))}
	}
	return Entry{Separator: SeparatorID(strings.TrimPrefix(s, sepPrefix))}
}

func (p *Profile) items() []ordering.Item {
	out := make([]ordering.Item, len(p.d.Order))
	for i, e := range p.d.Order {
		out[i] = itemOf(e)
	}
	return out
}

func (p *Profile) entries(items []ordering.Item) []Entry {
	out := make([]Entry, len(items))
	for i, it := range items {
		out[i] = entryOf(it)
	}
	return out
}

func (p *Profile) itemEdges(edges []ordering.Edge) []ordering.Edge {
	out := make([]ordering.Edge, len(edges))
	for i, e := range edges {
		out[i] = ordering.Edge{Before: ordering.Item(modPrefix + string(e.Before)), After: ordering.Item(modPrefix + string(e.After)), Ref: e.Ref}
	}
	return out
}

func (p *Profile) modEdges(edges []ordering.Edge) []ordering.Edge {
	out := make([]ordering.Edge, len(edges))
	for i, e := range edges {
		out[i] = ordering.Edge{Before: ordering.Item(entryOf(e.Before).Mod), After: ordering.Item(entryOf(e.After).Mod), Ref: e.Ref}
	}
	return out
}

func (p *Profile) modItems(items []ordering.Item) []ordering.Item {
	out := make([]ordering.Item, len(items))
	for i, it := range items {
		out[i] = ordering.Item(entryOf(it).Mod)
	}
	return out
}

// expandBlock turns the requested entries into engine items; a separator
// drags the mods up to the next separator.
func (p *Profile) expandBlock(entries []Entry) ([]ordering.Item, error) {
	want := map[ordering.Item]bool{}
	for _, e := range entries {
		want[itemOf(e)] = true
	}
	var out []ordering.Item
	inBlock := false
	for _, e := range p.d.Order {
		it := itemOf(e)
		if e.Separator != "" {
			inBlock = want[it]
		}
		if want[it] || (inBlock && e.Mod != "") {
			out = append(out, it)
			delete(want, it)
		}
	}
	if len(want) > 0 {
		return nil, fmt.Errorf("%w: entry not in the order", ErrNotFound)
	}
	return out, nil
}

func cloneData(d Data) Data {
	c := d
	c.Order = slices.Clone(d.Order)
	c.Separators = slices.Clone(d.Separators)
	c.LoadOrder = slices.Clone(d.LoadOrder)
	c.Mods = make(map[mod.ID]ModState, len(d.Mods))
	for k, v := range d.Mods {
		c.Mods[k] = v
	}
	c.PluginsEnabled = make(map[plugin.Name]bool, len(d.PluginsEnabled))
	for k, v := range d.PluginsEnabled {
		c.PluginsEnabled[k] = v
	}
	c.IndexLocks = make(map[plugin.Name]int, len(d.IndexLocks))
	for k, v := range d.IndexLocks {
		c.IndexLocks[k] = v
	}
	return c
}
