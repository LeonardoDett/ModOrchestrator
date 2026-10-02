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
	Mod mod.ID
	// Implicit plugins are loaded by the game itself, always active, in
	// the fixed positions at the top (declared by the adapter).
	Implicit bool
	Header   Header
	// HeaderError is set when the adapter could not read the header
	// (plugin_header_unreadable); Header is then empty.
	HeaderError string
}

// LimitUsage is how many active plugins of one kind the load order uses
// and how many the game accepts (core/12 §5: "full" 254, "light" 4096).
type LimitUsage struct {
	Kind string
	Used int
	Max  int
}

// Exceeded reports whether the limit is broken.
func (u LimitUsage) Exceeded() bool { return u.Max > 0 && u.Used > u.Max }

// Entry is one line of a serialized load order: what the adapter writes
// to and reads from the game's load order file (D040).
type Entry struct {
	Name     Name
	Enabled  bool
	Implicit bool
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

// / Rules holds the plugin rules, groups and assignments of one instance.
type Rules struct {
	instance game.InstanceID
	rules    []Rule
	groups   []Group
	assigned map[string]string // plugin key -> group
	spelling map[string]Name   // plugin key -> name as assigned
}

// Data is the plain form for persistence.
type Data struct {
	Instance    game.InstanceID
	Rules       []Rule
	Groups      []Group
	Assignments map[Name]string
}

// Check is what a change is checked against for cycles (D028): the plugins
// of the load order and the hard constraints of the adapter, so a rule or a
// group can never contradict a master (INV-ORD-04).
type Check struct {
	Known []Name
	Hard  []ordering.Edge
}

// NewRules creates the rule set with only the default group.
func NewRules(instance game.InstanceID) (*Rules, error) {
	return RestoreRules(Data{Instance: instance})
}

// RestoreRules rebuilds a rule set. Cycles are accepted (they may come from
// a provider, or from masters that changed) and reported by Cycle.
func RestoreRules(d Data) (*Rules, error) {
	if d.Instance == "" {
		return nil, fmt.Errorf("%w: plugin rules need an instance", ErrInvalid)
	}
	r := &Rules{instance: d.Instance, assigned: map[string]string{}, spelling: map[string]Name{}}
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
		if err := r.assign(p, g); err != nil {
			return nil, err
		}
	}
	return r, nil
}

// Instance returns the owning instance.
func (r *Rules) Instance() game.InstanceID { return r.instance }

// Data returns a copy for persistence.
func (r *Rules) Data() Data {
	d := Data{Instance: r.instance, Rules: slices.Clone(r.rules), Assignments: map[Name]string{}}
	for _, g := range r.groups {
		d.Groups = append(d.Groups, Group{Name: g.Name, After: slices.Clone(g.After)})
	}
	for p, g := range r.assigned {
		d.Assignments[r.spelling[p]] = g
	}
	return d
}

// List returns the rules in creation order.
func (r *Rules) List() []Rule { return slices.Clone(r.rules) }

// Rule returns one rule.
func (r *Rules) Rule(id RuleID) (Rule, bool) {
	i := slices.IndexFunc(r.rules, func(o Rule) bool { return o.ID == id })
	if i < 0 {
		return Rule{}, false
	}
	return r.rules[i], true
}

// Groups returns the groups, default first.
func (r *Rules) Groups() []Group {
	out := make([]Group, len(r.groups))
	for i, g := range r.groups {
		out[i] = Group{Name: g.Name, After: slices.Clone(g.After)}
	}
	return out
}

// Assignments returns the plugins with a group other than default.
func (r *Rules) Assignments() map[Name]string {
	out := make(map[Name]string, len(r.assigned))
	for p, g := range r.assigned {
		out[r.spelling[p]] = g
	}
	return out
}

// AddRule stores "p loads after q", refusing duplicates and cycles with the
// other enabled rules, the groups and the hard constraints.
func (r *Rules) AddRule(rule Rule, chk Check) error {
	if err := validateRule(rule); err != nil {
		return err
	}
	if slices.ContainsFunc(r.rules, func(o Rule) bool {
		return o.ID == rule.ID || (o.Plugin.Key() == rule.Plugin.Key() && o.After.Key() == rule.After.Key())
	}) {
		return fmt.Errorf("%w: rule %q", ErrDuplicate, rule.ID)
	}
	probe := r.clone()
	probe.rules = append(probe.rules, rule)
	if !rule.Disabled {
		chk.Known = appendIfMissing(chk.Known, rule.Plugin, rule.After)
		if err := probe.check(chk); err != nil {
			return err
		}
	}
	r.rules = probe.rules
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

// SetRuleDisabled disables or enables a rule; enabling refuses a cycle.
func (r *Rules) SetRuleDisabled(id RuleID, disabled bool, chk Check) error {
	i := slices.IndexFunc(r.rules, func(o Rule) bool { return o.ID == id })
	if i < 0 {
		return fmt.Errorf("%w: rule %q", ErrNotFound, id)
	}
	probe := r.clone()
	probe.rules[i].Disabled = disabled
	if !disabled {
		chk.Known = appendIfMissing(chk.Known, r.rules[i].Plugin, r.rules[i].After)
		if err := probe.check(chk); err != nil {
			return err
		}
	}
	r.rules = probe.rules
	return nil
}

// SetGroup creates or updates a group, refusing unknown or cyclic "after"
// (also through the plugins assigned to it and the hard constraints).
func (r *Rules) SetGroup(g Group, chk Check) error {
	for _, a := range g.After {
		if a != g.Name && !r.hasGroup(a) {
			return fmt.Errorf("%w: unknown group %q", ErrInvalid, a)
		}
	}
	probe := r.clone()
	i := slices.IndexFunc(probe.groups, func(o Group) bool { return o.Name == g.Name })
	if i >= 0 {
		probe.groups = slices.Delete(probe.groups, i, i+1)
	}
	if err := probe.putGroup(g); err != nil {
		return err
	}
	if i >= 0 { // keep the position of an updated group
		last := probe.groups[len(probe.groups)-1]
		probe.groups = slices.Insert(probe.groups[:len(probe.groups)-1], i, last)
	}
	if err := probe.check(chk); err != nil {
		return err
	}
	r.groups = probe.groups
	return nil
}

// DeleteGroup removes a group: its plugins go back to the default group and
// the groups that loaded after it stop doing so. The default group cannot
// be deleted.
func (r *Rules) DeleteGroup(name string) error {
	if name == DefaultGroup {
		return fmt.Errorf("%w: the default group cannot be deleted", ErrInvalid)
	}
	i := slices.IndexFunc(r.groups, func(o Group) bool { return o.Name == name })
	if i < 0 {
		return fmt.Errorf("%w: group %q", ErrNotFound, name)
	}
	r.groups = slices.Delete(r.groups, i, i+1)
	for j := range r.groups {
		r.groups[j].After = slices.DeleteFunc(r.groups[j].After, func(a string) bool { return a == name })
	}
	for p, g := range r.assigned {
		if g == name {
			delete(r.assigned, p)
			delete(r.spelling, p)
		}
	}
	return nil
}

// HasGroup reports whether a group exists.
func (r *Rules) HasGroup(name string) bool { return r.hasGroup(name) }

// Assign puts plugin p in group g (DefaultGroup removes the assignment),
// refusing an assignment that closes a cycle.
func (r *Rules) Assign(p Name, g string, chk Check) error {
	probe := r.clone()
	if err := probe.assign(p, g); err != nil {
		return err
	}
	if err := probe.check(chk); err != nil {
		return err
	}
	r.assigned, r.spelling = probe.assigned, probe.spelling
	return nil
}

func (r *Rules) assign(p Name, g string) error {
	if strings.TrimSpace(string(p)) == "" || !r.hasGroup(g) {
		return fmt.Errorf("%w: assignment needs a plugin and a known group", ErrInvalid)
	}
	if g == DefaultGroup {
		delete(r.assigned, p.Key())
		delete(r.spelling, p.Key())
		return nil
	}
	r.assigned[p.Key()] = g
	r.spelling[p.Key()] = p
	return nil
}

// GroupOf returns the group of p.
func (r *Rules) GroupOf(p Name) string {
	if g, ok := r.assigned[p.Key()]; ok {
		return g
	}
	return DefaultGroup
}

// Edges turns enabled rules and groups into ordering constraints over the
// given plugins (items are plugin keys). Groups are transitive: a group
// loads after every group reachable through "after", so an empty group in
// the middle still orders the others (as LOOT groups do). The cost is
// proportional to the product of group sizes, which is acceptable for the
// V1 scale (core/00 §7).
func (r *Rules) Edges(plugins []Name) []ordering.Edge {
	present := map[string]bool{}
	byGroup := map[string][]string{}
	for _, p := range plugins {
		if present[p.Key()] {
			continue
		}
		present[p.Key()] = true
		g := r.GroupOf(p)
		byGroup[g] = append(byGroup[g], p.Key())
	}
	var out []ordering.Edge
	for _, rule := range r.rules {
		if rule.Disabled || !present[rule.Plugin.Key()] || !present[rule.After.Key()] {
			continue
		}
		out = append(out, ordering.Edge{Before: ordering.Item(rule.After.Key()), After: ordering.Item(rule.Plugin.Key()), Ref: RefRulePrefix + string(rule.ID)})
	}
	if _, cyclic := r.groupCycle(); cyclic {
		return out // reported by Cycle; the closure is meaningless
	}
	for _, g := range r.groups {
		for _, a := range r.groupsBefore(g.Name) {
			for _, early := range byGroup[a] {
				for _, late := range byGroup[g.Name] {
					out = append(out, ordering.Edge{Before: ordering.Item(early), After: ordering.Item(late), Ref: RefGroupPrefix + g.Name + ">" + a})
				}
			}
		}
	}
	return out
}

// groupsBefore returns every group name loads after, directly or not, in a
// stable order.
func (r *Rules) groupsBefore(name string) []string {
	var out []string
	seen := map[string]bool{name: true}
	var walk func(string)
	walk = func(n string) {
		i := slices.IndexFunc(r.groups, func(g Group) bool { return g.Name == n })
		if i < 0 {
			return
		}
		for _, a := range r.groups[i].After {
			if !seen[a] {
				seen[a] = true
				out = append(out, a)
				walk(a)
			}
		}
	}
	walk(name)
	return out
}

// Cycle reports a cycle among enabled rules, groups and the hard
// constraints over the given plugins.
func (r *Rules) Cycle(plugins []Name, hard []ordering.Edge) (ordering.Cycle, bool) {
	if c, found := r.groupCycle(); found {
		return c, true
	}
	items := make([]ordering.Item, 0, len(plugins))
	seen := map[string]bool{}
	for _, p := range plugins {
		if !seen[p.Key()] {
			seen[p.Key()] = true
			items = append(items, ordering.Item(p.Key()))
		}
	}
	return ordering.FindCycle(items, append(slices.Clone(hard), r.Edges(plugins)...))
}

// Orphans returns the enabled rules whose plugins are unknown to the
// instance (known reports whether a plugin exists anywhere: inventory or a
// mod that is installed but disabled). Nothing is deleted: the user
// decides.
func (r *Rules) Orphans(known func(Name) bool) []Rule {
	var out []Rule
	for _, rule := range r.rules {
		if !rule.Disabled && (!known(rule.Plugin) || !known(rule.After)) {
			out = append(out, rule)
		}
	}
	return out
}

func (r *Rules) check(chk Check) error {
	if c, found := r.Cycle(chk.Known, chk.Hard); found {
		return fmt.Errorf("%w: %w", ErrCycle, &ordering.CycleError{Cycle: c})
	}
	return nil
}

func (r *Rules) clone() *Rules {
	c := &Rules{instance: r.instance, rules: slices.Clone(r.rules), assigned: map[string]string{}, spelling: map[string]Name{}}
	for _, g := range r.groups {
		c.groups = append(c.groups, Group{Name: g.Name, After: slices.Clone(g.After)})
	}
	for k, v := range r.assigned {
		c.assigned[k] = v
	}
	for k, v := range r.spelling {
		c.spelling[k] = v
	}
	return c
}

func (r *Rules) groupCycle() (ordering.Cycle, bool) {
	var items []ordering.Item
	var edges []ordering.Edge
	for _, g := range r.groups {
		items = append(items, ordering.Item(g.Name))
		for _, a := range g.After {
			edges = append(edges, ordering.Edge{Before: ordering.Item(a), After: ordering.Item(g.Name), Ref: RefGroupPrefix + g.Name + ">" + a})
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
	var after []string
	if len(g.After) > 0 {
		after = slices.Clone(g.After)
		slices.Sort(after)
	}
	r.groups = append(r.groups, Group{Name: g.Name, After: slices.Compact(after)})
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
