package plugin

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/profile"
)

// SectionID names the plugins section of a profile (D133): the plugin
// states, the load order and the index locks. The core keeps it opaque.
const SectionID = "plugins"

// sectionVersion is the format of the document; a new format bumps it and
// StateOf learns to read the older one.
const sectionVersion = 1

// ProfileState is the plugins section of one profile: which plugins are
// enabled, the desired load order and the index locks. A state is kept even
// when the plugin leaves the inventory (core/08 §3).
type ProfileState struct {
	enabled   map[Name]bool
	loadOrder []Name
	locks     map[Name]int
	// byKey finds the recorded name of a plugin case-insensitively without
	// lowering every name of the map (F14: the load order asks for each of
	// thousands of plugins).
	byKey map[string]Name
}

// doc is the persisted form of the section.
type doc struct {
	Enabled    map[Name]bool `json:"enabled,omitempty"`
	LoadOrder  []Name        `json:"loadOrder,omitempty"`
	IndexLocks map[Name]int  `json:"indexLocks,omitempty"`
}

// NewProfileState returns the state of a profile that never had plugins.
func NewProfileState() *ProfileState {
	return &ProfileState{enabled: map[Name]bool{}, locks: map[Name]int{}, byKey: map[string]Name{}}
}

// RestoreProfileState rebuilds a state from its parts (a profile stored
// before D133 kept them in the profile itself), enforcing its invariants:
// no duplicate in the load order, one lock per index.
func RestoreProfileState(enabled map[Name]bool, loadOrder []Name, locks map[Name]int) (*ProfileState, error) {
	if err := ValidateOrder(loadOrder); err != nil {
		return nil, err
	}
	st := NewProfileState()
	for n, on := range enabled {
		if strings.TrimSpace(string(n)) == "" {
			return nil, fmt.Errorf("%w: empty plugin name", ErrInvalid)
		}
		if old, dup := st.byKey[n.Key()]; dup {
			// Two spellings of one plugin (a document written by hand):
			// keep one, the same one on every read.
			if string(old) < string(n) {
				continue
			}
			delete(st.enabled, old)
		}
		st.enabled[n] = on
		st.byKey[n.Key()] = n
	}
	st.loadOrder = slices.Clone(loadOrder)
	seen := map[int]Name{}
	for n, i := range locks {
		if other, dup := seen[i]; dup {
			return nil, fmt.Errorf("%w: %q and %q are locked at %d", ErrDuplicate, other, n, i)
		}
		seen[i] = n
		st.locks[n] = i
	}
	return st, nil
}

// StateOf reads the plugins section of a profile; a profile without one has
// an empty state.
func StateOf(p *profile.Profile) (*ProfileState, error) {
	sec, ok := p.Section(SectionID)
	if !ok || len(sec.Doc) == 0 {
		return NewProfileState(), nil
	}
	if sec.Version != sectionVersion {
		return nil, fmt.Errorf("%w: plugins section version %d", ErrInvalid, sec.Version)
	}
	var d doc
	if err := json.Unmarshal(sec.Doc, &d); err != nil {
		return nil, fmt.Errorf("%w: plugins section: %v", ErrInvalid, err)
	}
	return RestoreProfileState(d.Enabled, d.LoadOrder, d.IndexLocks)
}

// Section is the state as the profile keeps it.
func (s *ProfileState) Section() (profile.Section, error) {
	b, err := json.Marshal(doc{Enabled: s.enabled, LoadOrder: s.loadOrder, IndexLocks: s.locks})
	if err != nil {
		return profile.Section{}, err
	}
	return profile.Section{Version: sectionVersion, Doc: b}, nil
}

// Store writes the state into the profile.
func (s *ProfileState) Store(p *profile.Profile, now time.Time) error {
	sec, err := s.Section()
	if err != nil {
		return err
	}
	return p.SetSection(SectionID, sec, now)
}

// SetEnabled records the enabled state of a plugin, case-insensitively: the
// last write wins.
func (s *ProfileState) SetEnabled(n Name, enabled bool) error {
	if strings.TrimSpace(string(n)) == "" {
		return fmt.Errorf("%w: empty plugin name", ErrInvalid)
	}
	if old, ok := s.byKey[n.Key()]; ok {
		delete(s.enabled, old)
	}
	s.enabled[n] = enabled
	s.byKey[n.Key()] = n
	return nil
}

// Enabled returns the recorded state of a plugin and whether one exists.
func (s *ProfileState) Enabled(n Name) (enabled, known bool) {
	k, ok := s.byKey[n.Key()]
	if !ok {
		return false, false
	}
	return s.enabled[k], true
}

// Active lists the plugins recorded as enabled, sorted by key.
func (s *ProfileState) Active() []Name {
	var out []Name
	for n, on := range s.enabled {
		if on {
			out = append(out, n)
		}
	}
	slices.SortFunc(out, func(a, b Name) int { return strings.Compare(a.Key(), b.Key()) })
	return out
}

// LoadOrder returns the desired load order.
func (s *ProfileState) LoadOrder() []Name { return slices.Clone(s.loadOrder) }

// SetLoadOrder replaces the desired load order (produced by the ordering
// engine or a validated manual move; never by the UI directly).
func (s *ProfileState) SetLoadOrder(order []Name) error {
	if err := ValidateOrder(order); err != nil {
		return err
	}
	s.loadOrder = slices.Clone(order)
	return nil
}

// SetIndexLock pins a plugin at a position of the load order; a negative
// index removes the lock.
func (s *ProfileState) SetIndexLock(n Name, index int) error {
	for k := range s.locks {
		if k.Key() == n.Key() {
			delete(s.locks, k)
		}
	}
	if index >= 0 {
		for k, i := range s.locks {
			if i == index {
				return fmt.Errorf("%w: %q is already locked at %d", ErrDuplicate, k, index)
			}
		}
		s.locks[n] = index
	}
	return nil
}

// IndexLocks returns the locks as ordering locks over plugin keys.
func (s *ProfileState) IndexLocks() []ordering.Lock {
	var out []ordering.Lock
	for n, i := range s.locks {
		out = append(out, ordering.Lock{Item: ordering.Item(n.Key()), Index: i})
	}
	slices.SortFunc(out, func(a, b ordering.Lock) int { return a.Index - b.Index })
	return out
}

// StateDiff is what differs between the plugins sections of two profiles
// (core/07 §5).
type StateDiff struct {
	OnlyA, OnlyB []Name
	Moved        []PositionChange
}

// PositionChange is a plugin at a different position of the load order
// (1-based).
type PositionChange struct {
	Plugin Name
	A, B   int
}

// Compare returns what differs between the states of two profiles.
func Compare(a, b *ProfileState) StateDiff {
	var d StateDiff
	for _, n := range a.Active() {
		if on, _ := b.Enabled(n); !on {
			d.OnlyA = append(d.OnlyA, n)
		}
	}
	for _, n := range b.Active() {
		if on, _ := a.Enabled(n); !on {
			d.OnlyB = append(d.OnlyB, n)
		}
	}
	posB := map[string]int{}
	for i, n := range b.loadOrder {
		posB[n.Key()] = i + 1
	}
	for i, n := range a.loadOrder {
		if j, ok := posB[n.Key()]; ok && j != i+1 {
			d.Moved = append(d.Moved, PositionChange{Plugin: n, A: i + 1, B: j})
		}
	}
	return d
}
