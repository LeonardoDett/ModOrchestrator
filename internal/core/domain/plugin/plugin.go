// Package plugin models loadable units and their ordering intent (core/08).
// Plugin management is a game capability: the adapter recognises plugins,
// reads headers and declares hard constraints; the core owns the model and
// the ordering engine (D029) and assumes no algorithm such as LOOT (D041).
//
// Plugin (inventory) is calculated. Rules, groups and group assignments are
// desired state of the instance (D026). The enabled state and the load order
// are desired state of a profile (package profile). The load order is a
// layer independent from the mod order (D006, INV-ORD-06).
package plugin

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/rules"
)

// Name is a plugin file name. Identity is case-insensitive (Key).
type Name string

// Key is the identity used to compare plugin names.
func (n Name) Key() string { return strings.ToLower(string(n)) }

// Errors returned by plugin entities.
var (
	ErrInvalid   = errors.New("plugin: invalid")
	ErrDuplicate = errors.New("plugin: duplicate")
	ErrNotFound  = errors.New("plugin: not found")
	// ErrCycle wraps *ordering.CycleError (D028).
	ErrCycle = errors.New("plugin: would create a cycle")
)

// Origin says where a plugin in the inventory comes from.
type Origin string

const (
	OriginMod       Origin = "mod"
	OriginBaseGame  Origin = "base_game"
	OriginImplicit  Origin = "implicit"
	OriginUnmanaged Origin = "unmanaged"
)

// Flag is an adapter-defined header flag, normalised (e.g. "master",
// "light").
type Flag string

// Header is what the adapter reads from the plugin file.
type Header struct {
	Flags       []Flag
	Masters     []Name
	Description string
	Author      string
	Version     string
}

// Plugin is one entry of the calculated inventory (core/08 §2).
type Plugin struct {
	Name     Name
	Location game.Location
	Origin   Origin
	// Mod is the providing mod when Origin is OriginMod.
	Mod    mod.ID
	Header Header
}

// HasFlag reports whether the header carries f.
func (p Plugin) HasFlag(f Flag) bool { return slices.Contains(p.Header.Flags, f) }

// ValidateOrder checks a load order: non-empty names, each once
// (case-insensitive).
func ValidateOrder(order []Name) error {
	seen := make(map[string]struct{}, len(order))
	for _, n := range order {
		if strings.TrimSpace(string(n)) == "" {
			return fmt.Errorf("%w: empty plugin name", ErrInvalid)
		}
		if _, dup := seen[n.Key()]; dup {
			return fmt.Errorf("%w: plugin %q listed twice", ErrDuplicate, n)
		}
		seen[n.Key()] = struct{}{}
	}
	return nil
}

// RuleID identifies a plugin rule.
type RuleID string

// Rule requires Plugin to load after After ("carrega depois de").
type Rule struct {
	ID        RuleID
	Plugin    Name
	After     Name
	Source    rules.Source
	Disabled  bool
	CreatedAt time.Time
}

// DefaultGroup always exists; unassigned plugins belong to it.
const DefaultGroup = "default"

// Group is a named set of plugins that loads after the groups in After.
type Group struct {
	Name  string
	After []string
}

// Rules holds the plugin rules, groups and assignments of one instance.
type Rules struct {
	instance game.InstanceID
	rules    []Rule
	groups   []Group
	assigned map[string]string // plugin key -> group
}

// Data is the plain form for persistence.
type Data struct {
	Instance    game.InstanceID
	Rules       []Rule
	Groups      []Group
	Assignments map[Name]string
}

// NewRules creates the rule set with only the default group.
func NewRules(instance game.InstanceID) (*Rules, error) {
	return RestoreRules(Data{Instance: instance})
}

// RestoreRules rebuilds a rule set. Cycles are accepted (they may come from
// a provider) and reported by Cycle.
func RestoreRules(d Data) (*Rules, error) {
	if d.Instance == "" {
		return nil, fmt.Errorf("%w: plugin rules need an instance", ErrInvalid)
	}
	r := &Rules{instance: d.Instance, assigned: map[string]string{}}
	groups := d.Groups
	if !slices.ContainsFunc(groups, func(g Group) bool { return g.Name == DefaultGroup }) {
		groups = append([]Group{{Name: DefaultGroup}}, groups...)
	}
	for _, g := range groups {
		if err := r.putGroup(g); err != nil {
			return nil, err
		}
	}
	for _, g := range r.groups {
		for _, a := range g.After {
			if !r.hasGroup(a) {
				return nil, fmt.Errorf("%w: group %q loads after unknown group %q", ErrInvalid, g.Name, a)
			}
		}
	}
	for _, rule := range d.Rules {
		if err := validateRule(rule); err != nil {
			return nil, err
		}
		if slices.ContainsFunc(r.rules, func(o Rule) bool { return o.ID == rule.ID }) {
			return nil, fmt.Errorf("%w: rule id %q", ErrDuplicate, rule.ID)
		}
		r.rules = append(r.rules, rule)
	}
	for p, g := range d.Assignments {
		if err := r.Assign(p, g); err != nil {
			return nil, err
		}
	}
	return r, nil
}

// Data returns a copy for persistence.
func (r *Rules) Data() Data {
	d := Data{Instance: r.instance, Rules: slices.Clone(r.rules), Assignments: map[Name]string{}}
	for _, g := range r.groups {
		d.Groups = append(d.Groups, Group{Name: g.Name, After: slices.Clone(g.After)})
	}
	for p, g := range r.assigned {
		d.Assignments[Name(p)] = g
	}
	return d
}

// AddRule stores "p loads after q", refusing duplicates and cycles with the
// other enabled rules and groups.
func (r *Rules) AddRule(rule Rule, known []Name) error {
	if err := validateRule(rule); err != nil {
		return err
	}
	if slices.ContainsFunc(r.rules, func(o Rule) bool {
		return o.ID == rule.ID || (o.Plugin.Key() == rule.Plugin.Key() && o.After.Key() == rule.After.Key())
	}) {
		return fmt.Errorf("%w: rule %q", ErrDuplicate, rule.ID)
	}
	if !rule.Disabled {
		probe := *r
		probe.rules = append(slices.Clone(r.rules), rule)
		if err := probe.checkCycle(appendIfMissing(known, rule.Plugin, rule.After)); err != nil {
			return err
		}
	}
	r.rules = append(r.rules, rule)
	return nil
}

// RemoveRule deletes a user rule; rules from other sources can only be
// disabled.
func (r *Rules) RemoveRule(id RuleID) error {
	i := slices.IndexFunc(r.rules, func(o Rule) bool { return o.ID == id })
	if i < 0 {
		return fmt.Errorf("%w: rule %q", ErrNotFound, id)
	}
	if r.rules[i].Source != rules.SourceUser {
		return fmt.Errorf("%w: rule %q can only be disabled", ErrInvalid, id)
	}
	r.rules = slices.Delete(r.rules, i, i+1)
	return nil
}

// SetGroup creates or updates a group, refusing unknown or cyclic "after".
func (r *Rules) SetGroup(g Group) error {
	for _, a := range g.After {
		if a != g.Name && !r.hasGroup(a) {
			return fmt.Errorf("%w: unknown group %q", ErrInvalid, a)
		}
	}
	probe := &Rules{instance: r.instance, rules: r.rules, assigned: r.assigned}
	for _, o := range r.groups {
		if o.Name != g.Name {
			probe.groups = append(probe.groups, o)
		}
	}
	if err := probe.putGroup(g); err != nil {
		return err
	}
	if c, found := probe.groupCycle(); found {
		return fmt.Errorf("%w: %w", ErrCycle, &ordering.CycleError{Cycle: c})
	}
	r.groups = probe.groups
	return nil
}

// Assign puts plugin p in group g (DefaultGroup removes the assignment).
func (r *Rules) Assign(p Name, g string) error {
	if strings.TrimSpace(string(p)) == "" || !r.hasGroup(g) {
		return fmt.Errorf("%w: assignment needs a plugin and a known group", ErrInvalid)
	}
	if g == DefaultGroup {
		delete(r.assigned, p.Key())
		return nil
	}
	r.assigned[p.Key()] = g
	return nil
}

// GroupOf returns the group of p.
func (r *Rules) GroupOf(p Name) string {
	if g, ok := r.assigned[p.Key()]; ok {
		return g
	}
	return DefaultGroup
}

// Edges turns rules and groups into ordering constraints over the given
// plugins (items are plugin keys). Group edges connect every plugin of a
// group to every plugin of the groups it loads after; the cost is
// proportional to the product of group sizes, which is acceptable for the
// V1 scale (core/00 §7).
func (r *Rules) Edges(plugins []Name) []ordering.Edge {
	present := map[string]bool{}
	byGroup := map[string][]string{}
	for _, p := range plugins {
		present[p.Key()] = true
		g := r.GroupOf(p)
		byGroup[g] = append(byGroup[g], p.Key())
	}
	var out []ordering.Edge
	for _, rule := range r.rules {
		if rule.Disabled || !present[rule.Plugin.Key()] || !present[rule.After.Key()] {
			continue
		}
		out = append(out, ordering.Edge{Before: ordering.Item(rule.After.Key()), After: ordering.Item(rule.Plugin.Key()), Ref: "rule:" + string(rule.ID)})
	}
	for _, g := range r.groups {
		for _, a := range g.After {
			for _, early := range byGroup[a] {
				for _, late := range byGroup[g.Name] {
					out = append(out, ordering.Edge{Before: ordering.Item(early), After: ordering.Item(late), Ref: "group:" + g.Name + ">" + a})
				}
			}
		}
	}
	return out
}

// Cycle reports a cycle among enabled rules and groups over the given
// plugins.
func (r *Rules) Cycle(plugins []Name) (ordering.Cycle, bool) {
	if c, found := r.groupCycle(); found {
		return c, true
	}
	items := make([]ordering.Item, len(plugins))
	for i, p := range plugins {
		items[i] = ordering.Item(p.Key())
	}
	return ordering.FindCycle(items, r.Edges(plugins))
}

func (r *Rules) checkCycle(plugins []Name) error {
	if c, found := r.Cycle(plugins); found {
		return fmt.Errorf("%w: %w", ErrCycle, &ordering.CycleError{Cycle: c})
	}
	return nil
}

func (r *Rules) groupCycle() (ordering.Cycle, bool) {
	var items []ordering.Item
	var edges []ordering.Edge
	for _, g := range r.groups {
		items = append(items, ordering.Item(g.Name))
		for _, a := range g.After {
			edges = append(edges, ordering.Edge{Before: ordering.Item(a), After: ordering.Item(g.Name), Ref: "group:" + g.Name + ">" + a})
		}
	}
	return ordering.FindCycle(items, edges)
}

func (r *Rules) putGroup(g Group) error {
	if strings.TrimSpace(g.Name) == "" {
		return fmt.Errorf("%w: group needs a name", ErrInvalid)
	}
	if slices.Contains(g.After, g.Name) {
		return fmt.Errorf("%w: group %q cannot load after itself", ErrInvalid, g.Name)
	}
	if r.hasGroup(g.Name) {
		return fmt.Errorf("%w: group %q", ErrDuplicate, g.Name)
	}
	r.groups = append(r.groups, Group{Name: g.Name, After: slices.Clone(g.After)})
	return nil
}

func (r *Rules) hasGroup(name string) bool {
	return slices.ContainsFunc(r.groups, func(g Group) bool { return g.Name == name })
}

func validateRule(rule Rule) error {
	if rule.ID == "" || strings.TrimSpace(string(rule.Plugin)) == "" || strings.TrimSpace(string(rule.After)) == "" {
		return fmt.Errorf("%w: rule needs id, plugin and the plugin it loads after", ErrInvalid)
	}
	if rule.Plugin.Key() == rule.After.Key() {
		return fmt.Errorf("%w: %q cannot load after itself", ErrInvalid, rule.Plugin)
	}
	switch rule.Source {
	case rules.SourceUser, rules.SourceMetadata, rules.SourceCollection:
	default:
		return fmt.Errorf("%w: unknown rule source %q", ErrInvalid, rule.Source)
	}
	return nil
}

func appendIfMissing(names []Name, more ...Name) []Name {
	out := slices.Clone(names)
	for _, m := range more {
		if !slices.ContainsFunc(out, func(n Name) bool { return n.Key() == m.Key() }) {
			out = append(out, m)
		}
	}
	return out
}
