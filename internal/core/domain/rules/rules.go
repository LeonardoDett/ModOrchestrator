// Package rules models persisted intent between mods of a game instance
// (core/05 §2, core/06): "B wins A" order rules, requirements and
// incompatibilities. State category: desired. Rules belong to the instance,
// not to a profile (D026), and are never created just because a conflict
// exists (D004).
package rules

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
)

// ID identifies a rule.
type ID string

// Source says who asked for a rule. Only user rules can be deleted; the
// others can be disabled (core/05 §2).
type Source string

const (
	SourceUser       Source = "user"
	SourceMetadata   Source = "metadata"
	SourceCollection Source = "collection"
)

func (s Source) valid() bool {
	return s == SourceUser || s == SourceMetadata || s == SourceCollection
}

// Errors returned by rule operations.
var (
	ErrInvalid   = errors.New("rules: invalid")
	ErrDuplicate = errors.New("rules: duplicate")
	ErrNotFound  = errors.New("rules: not found")
	// ErrCycle wraps *ordering.CycleError: the rule would close a cycle and
	// is refused (D028, INV-ORD-04).
	ErrCycle = errors.New("rules: would create a cycle")
)

// OrderRule requires Before to have lower priority than After: After wins
// Before ("B vence A" in the UI, D025).
type OrderRule struct {
	ID        ID
	Before    mod.ID
	After     mod.ID
	Source    Source
	Disabled  bool
	Note      string
	CreatedAt time.Time
}

// Winner and Loser name the rule the way the UI does.
func (r OrderRule) Winner() mod.ID { return r.After }
func (r OrderRule) Loser() mod.ID  { return r.Before }

// DependencyKind distinguishes mandatory and optional requirements.
type DependencyKind string

const (
	Requires   DependencyKind = "requires"
	Recommends DependencyKind = "recommends"
)

// DependencyRule states that Mod needs (or recommends) Target. It never
// imposes an order.
type DependencyRule struct {
	ID        ID
	Mod       mod.ID
	Target    mod.ID
	Kind      DependencyKind
	Source    Source
	Disabled  bool
	Note      string
	CreatedAt time.Time
}

// IncompatibilityRule states that A and B must not be enabled together.
type IncompatibilityRule struct {
	ID        ID
	A, B      mod.ID
	Source    Source
	Disabled  bool
	Note      string
	CreatedAt time.Time
}

// Set is every rule of one instance. It guarantees that rules created by
// the user never close a cycle; cycles coming from other sources are kept
// and reported by Cycle so a blocking diagnostic can explain them.
type Set struct {
	instance game.InstanceID
	order    []OrderRule
	deps     []DependencyRule
	incompat []IncompatibilityRule
}

// Data is the plain form of a Set for persistence.
type Data struct {
	Instance          game.InstanceID
	Order             []OrderRule
	Dependencies      []DependencyRule
	Incompatibilities []IncompatibilityRule
}

// Restore rebuilds a set, validating every rule. Cycles are accepted here
// because they may come from metadata; Cycle reports them.
func Restore(d Data) (*Set, error) {
	if d.Instance == "" {
		return nil, fmt.Errorf("%w: rule set needs an instance", ErrInvalid)
	}
	s := &Set{instance: d.Instance}
	ids := map[ID]bool{}
	claim := func(id ID) error {
		if id == "" {
			return fmt.Errorf("%w: rule without id", ErrInvalid)
		}
		if ids[id] {
			return fmt.Errorf("%w: rule id %q", ErrDuplicate, id)
		}
		ids[id] = true
		return nil
	}
	for _, r := range d.Order {
		if err := errors.Join(claim(r.ID), validateOrder(r)); err != nil {
			return nil, err
		}
		s.order = append(s.order, r)
	}
	for _, r := range d.Dependencies {
		if err := errors.Join(claim(r.ID), validateDependency(r)); err != nil {
			return nil, err
		}
		s.deps = append(s.deps, r)
	}
	for _, r := range d.Incompatibilities {
		if err := errors.Join(claim(r.ID), validateIncompatibility(r)); err != nil {
			return nil, err
		}
		s.incompat = append(s.incompat, r)
	}
	return s, nil
}

// New creates an empty set.
func New(instance game.InstanceID) (*Set, error) { return Restore(Data{Instance: instance}) }

// Data returns a copy for persistence.
func (s *Set) Data() Data {
	return Data{Instance: s.instance, Order: slices.Clone(s.order), Dependencies: slices.Clone(s.deps), Incompatibilities: slices.Clone(s.incompat)}
}

func (s *Set) Instance() game.InstanceID                   { return s.instance }
func (s *Set) OrderRules() []OrderRule                     { return slices.Clone(s.order) }
func (s *Set) DependencyRules() []DependencyRule           { return slices.Clone(s.deps) }
func (s *Set) IncompatibilityRules() []IncompatibilityRule { return slices.Clone(s.incompat) }

// AddOrderRule stores "r.After wins r.Before". It is refused when an
// equivalent rule exists or when it would close a cycle with the enabled
// rules; the error then carries the cycle.
func (s *Set) AddOrderRule(r OrderRule) error {
	if err := validateOrder(r); err != nil {
		return err
	}
	if s.hasID(r.ID) {
		return fmt.Errorf("%w: rule id %q", ErrDuplicate, r.ID)
	}
	if slices.ContainsFunc(s.order, func(o OrderRule) bool { return o.Before == r.Before && o.After == r.After }) {
		return fmt.Errorf("%w: %q already wins %q", ErrDuplicate, r.After, r.Before)
	}
	if !r.Disabled {
		if err := s.checkCycle(append(s.OrderEdges(), edgeOf(r))); err != nil {
			return err
		}
	}
	s.order = append(s.order, r)
	return nil
}

// SetOrderRuleDisabled disables or re-enables a rule. Re-enabling is refused
// if it would close a cycle.
func (s *Set) SetOrderRuleDisabled(id ID, disabled bool) error {
	i := slices.IndexFunc(s.order, func(o OrderRule) bool { return o.ID == id })
	if i < 0 {
		return fmt.Errorf("%w: order rule %q", ErrNotFound, id)
	}
	if !disabled && s.order[i].Disabled {
		if err := s.checkCycle(append(s.OrderEdges(), edgeOf(s.order[i]))); err != nil {
			return err
		}
	}
	s.order[i].Disabled = disabled
	return nil
}

// Remove deletes a user rule of any kind. Rules from other sources can only
// be disabled, so their origin stays visible.
func (s *Set) Remove(id ID) error {
	check := func(src Source) error {
		if src != SourceUser {
			return fmt.Errorf("%w: rule %q comes from %s and can only be disabled", ErrInvalid, id, src)
		}
		return nil
	}
	if i := slices.IndexFunc(s.order, func(o OrderRule) bool { return o.ID == id }); i >= 0 {
		if err := check(s.order[i].Source); err != nil {
			return err
		}
		s.order = slices.Delete(s.order, i, i+1)
		return nil
	}
	if i := slices.IndexFunc(s.deps, func(o DependencyRule) bool { return o.ID == id }); i >= 0 {
		if err := check(s.deps[i].Source); err != nil {
			return err
		}
		s.deps = slices.Delete(s.deps, i, i+1)
		return nil
	}
	if i := slices.IndexFunc(s.incompat, func(o IncompatibilityRule) bool { return o.ID == id }); i >= 0 {
		if err := check(s.incompat[i].Source); err != nil {
			return err
		}
		s.incompat = slices.Delete(s.incompat, i, i+1)
		return nil
	}
	return fmt.Errorf("%w: rule %q", ErrNotFound, id)
}

// AddDependency stores a requirement.
func (s *Set) AddDependency(r DependencyRule) error {
	if err := validateDependency(r); err != nil {
		return err
	}
	if s.hasID(r.ID) {
		return fmt.Errorf("%w: rule id %q", ErrDuplicate, r.ID)
	}
	if slices.ContainsFunc(s.deps, func(o DependencyRule) bool { return o.Mod == r.Mod && o.Target == r.Target && o.Kind == r.Kind }) {
		return fmt.Errorf("%w: %q already %s %q", ErrDuplicate, r.Mod, r.Kind, r.Target)
	}
	s.deps = append(s.deps, r)
	return nil
}

// AddIncompatibility stores an incompatibility.
func (s *Set) AddIncompatibility(r IncompatibilityRule) error {
	if err := validateIncompatibility(r); err != nil {
		return err
	}
	if s.hasID(r.ID) {
		return fmt.Errorf("%w: rule id %q", ErrDuplicate, r.ID)
	}
	if slices.ContainsFunc(s.incompat, func(o IncompatibilityRule) bool {
		return (o.A == r.A && o.B == r.B) || (o.A == r.B && o.B == r.A)
	}) {
		return fmt.Errorf("%w: %q and %q already incompatible", ErrDuplicate, r.A, r.B)
	}
	s.incompat = append(s.incompat, r)
	return nil
}

// OrderEdges returns the enabled order rules as ordering constraints; the
// edge Ref is the rule id.
func (s *Set) OrderEdges() []ordering.Edge {
	var out []ordering.Edge
	for _, r := range s.order {
		if !r.Disabled {
			out = append(out, edgeOf(r))
		}
	}
	return out
}

// Cycle reports a cycle among enabled order rules, which can only exist when
// rules came from outside the user (D028). A cycle blocks reordering and
// deploy through a diagnostic.
func (s *Set) Cycle() (ordering.Cycle, bool) {
	edges := s.OrderEdges()
	return ordering.FindCycle(itemsOf(edges), edges)
}

// Orphans returns the ids of rules that reference a mod not in installed.
// They are reported, not deleted (INV-LIB-05).
func (s *Set) Orphans(installed map[mod.ID]bool) []ID {
	var out []ID
	for _, r := range s.order {
		if !installed[r.Before] || !installed[r.After] {
			out = append(out, r.ID)
		}
	}
	for _, r := range s.deps {
		if !installed[r.Mod] {
			out = append(out, r.ID) // the requiring mod is gone; a missing Target is a broken requirement, not an orphan
		}
	}
	for _, r := range s.incompat {
		if !installed[r.A] || !installed[r.B] {
			out = append(out, r.ID)
		}
	}
	return out
}

// Involving returns every rule id that mentions m, for inspectors.
func (s *Set) Involving(m mod.ID) []ID {
	var out []ID
	for _, r := range s.order {
		if r.Before == m || r.After == m {
			out = append(out, r.ID)
		}
	}
	for _, r := range s.deps {
		if r.Mod == m || r.Target == m {
			out = append(out, r.ID)
		}
	}
	for _, r := range s.incompat {
		if r.A == m || r.B == m {
			out = append(out, r.ID)
		}
	}
	return out
}

func (s *Set) checkCycle(edges []ordering.Edge) error {
	if c, found := ordering.FindCycle(itemsOf(edges), edges); found {
		return fmt.Errorf("%w: %w", ErrCycle, &ordering.CycleError{Cycle: c})
	}
	return nil
}

func (s *Set) hasID(id ID) bool {
	return slices.ContainsFunc(s.order, func(o OrderRule) bool { return o.ID == id }) ||
		slices.ContainsFunc(s.deps, func(o DependencyRule) bool { return o.ID == id }) ||
		slices.ContainsFunc(s.incompat, func(o IncompatibilityRule) bool { return o.ID == id })
}

func edgeOf(r OrderRule) ordering.Edge {
	return ordering.Edge{Before: ordering.Item(r.Before), After: ordering.Item(r.After), Ref: string(r.ID)}
}

func itemsOf(edges []ordering.Edge) []ordering.Item {
	seen := map[ordering.Item]bool{}
	var out []ordering.Item
	for _, e := range edges {
		for _, it := range []ordering.Item{e.Before, e.After} {
			if !seen[it] {
				seen[it] = true
				out = append(out, it)
			}
		}
	}
	slices.Sort(out)
	return out
}

func validateOrder(r OrderRule) error {
	if r.ID == "" || r.Before == "" || r.After == "" || !r.Source.valid() {
		return fmt.Errorf("%w: order rule needs id, both mods and a known source", ErrInvalid)
	}
	if r.Before == r.After {
		return fmt.Errorf("%w: mod %q cannot win against itself", ErrInvalid, r.After)
	}
	return nil
}

func validateDependency(r DependencyRule) error {
	if r.ID == "" || r.Mod == "" || r.Target == "" || !r.Source.valid() {
		return fmt.Errorf("%w: dependency needs id, both mods and a known source", ErrInvalid)
	}
	if r.Kind != Requires && r.Kind != Recommends {
		return fmt.Errorf("%w: unknown dependency kind %q", ErrInvalid, r.Kind)
	}
	if r.Mod == r.Target {
		return fmt.Errorf("%w: mod %q cannot require itself", ErrInvalid, r.Mod)
	}
	return nil
}

func validateIncompatibility(r IncompatibilityRule) error {
	if r.ID == "" || r.A == "" || r.B == "" || !r.Source.valid() || r.A == r.B {
		return fmt.Errorf("%w: incompatibility needs id, two different mods and a known source", ErrInvalid)
	}
	return nil
}
