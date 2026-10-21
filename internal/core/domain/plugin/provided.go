package plugin

import (
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/rules"
)

// Provided is ordering data from a provider other than the user (D041,
// D140, D143): rules, groups and group assignments. It is calculated on
// every read from the provider's data and never persisted; only the rules
// the user disabled are (ProviderOff).
//
// Provided data is soft: the user's rules, groups and assignments win, and
// a provided item that would close a cycle with them or with the hard
// constraints is left out and reported (Skipped), instead of blocking the
// sort as a cycle of the user's own data does (D028).
type Provided struct {
	Source      rules.Source
	Rules       []Rule
	Groups      []Group
	Assignments map[Name]string
}

// ProvidedRuleID is the stable id of a provided rule: the same pair from
// the same source keeps its id (and its "disabled" mark) across reads.
func ProvidedRuleID(source rules.Source, p, after Name) RuleID {
	return RuleID(string(source) + ":" + p.Key() + ">" + after.Key())
}

// Skipped is provided data left out of the effective set.
type Skipped struct {
	// Kind is "rule", "group" (Group loads after After) or "assignment"
	// (Plugin in Group).
	Kind   string
	Plugin Name
	After  string
	Group  string
}

type provenance struct {
	rules   map[RuleID]rules.Source
	assign  map[string]rules.Source // plugin key
	groups  map[string]rules.Source // group created by a provider
	after   map[string]rules.Source // "group>after" added by a provider
	skipped []Skipped
}

func (p *provenance) clone() *provenance {
	if p == nil {
		return nil
	}
	c := &provenance{rules: map[RuleID]rules.Source{}, assign: map[string]rules.Source{}, groups: map[string]rules.Source{}, after: map[string]rules.Source{}, skipped: slices.Clone(p.skipped)}
	for k, v := range p.rules {
		c.rules[k] = v
	}
	for k, v := range p.assign {
		c.assign[k] = v
	}
	for k, v := range p.groups {
		c.groups[k] = v
	}
	for k, v := range p.after {
		c.after[k] = v
	}
	return c
}

// ProviderOff reports whether the user disabled a provided rule.
func (r *Rules) ProviderOff(id RuleID) bool { return r.off[id] }

// SetProviderOff disables (or enables again) a provided rule by id. The id
// is kept even when the provider no longer gives the rule, so the choice
// survives a provider update that brings it back.
func (r *Rules) SetProviderOff(id RuleID, off bool) {
	if r.off == nil {
		r.off = map[RuleID]bool{}
	}
	if off {
		r.off[id] = true
	} else {
		delete(r.off, id)
	}
}

// WithProvided returns the effective set: this set plus the provided data,
// with the user's data winning, and the provided items that close a cycle
// left out (Skipped). The result is for reading and ordering only; it is
// never saved.
func (r *Rules) WithProvided(chk Check, ps ...Provided) *Rules {
	eff := r.clone()
	eff.prov = &provenance{rules: map[RuleID]rules.Source{}, assign: map[string]rules.Source{}, groups: map[string]rules.Source{}, after: map[string]rules.Source{}}
	for _, p := range ps {
		for _, g := range p.Groups {
			if strings.TrimSpace(g.Name) == "" || eff.hasGroup(g.Name) {
				continue
			}
			eff.groups = append(eff.groups, Group{Name: g.Name})
			eff.prov.groups[g.Name] = p.Source
		}
		for _, g := range p.Groups {
			i := slices.IndexFunc(eff.groups, func(o Group) bool { return o.Name == g.Name })
			if i < 0 {
				continue
			}
			for _, a := range g.After {
				if a == g.Name || !eff.hasGroup(a) || slices.Contains(eff.groups[i].After, a) {
					continue
				}
				eff.groups[i].After = append(eff.groups[i].After, a)
				slices.Sort(eff.groups[i].After)
				eff.prov.after[g.Name+">"+a] = p.Source
			}
		}
		names := make([]Name, 0, len(p.Assignments))
		for n := range p.Assignments {
			names = append(names, n)
		}
		slices.SortFunc(names, func(a, b Name) int { return strings.Compare(a.Key(), b.Key()) })
		for _, n := range names {
			g := p.Assignments[n]
			if _, mine := r.assigned[n.Key()]; mine || g == DefaultGroup || !eff.hasGroup(g) {
				continue
			}
			if _, done := eff.prov.assign[n.Key()]; done {
				continue // first provider wins
			}
			eff.assigned[n.Key()] = g
			eff.spelling[n.Key()] = n
			eff.prov.assign[n.Key()] = p.Source
		}
		for _, rule := range p.Rules {
			if rule.Plugin.Key() == rule.After.Key() || strings.TrimSpace(string(rule.Plugin)) == "" || strings.TrimSpace(string(rule.After)) == "" {
				continue
			}
			if slices.ContainsFunc(eff.rules, func(o Rule) bool {
				return o.ID == rule.ID || (o.Plugin.Key() == rule.Plugin.Key() && o.After.Key() == rule.After.Key())
			}) {
				continue
			}
			rule.Source = p.Source
			rule.Disabled = r.off[rule.ID]
			eff.rules = append(eff.rules, rule)
			eff.prov.rules[rule.ID] = p.Source
		}
	}
	eff.dropProvidedCycles(chk)
	return eff
}

// dropProvidedCycles leaves out, one at a time, a provided item of each
// cycle until no cycle has one. A cycle made only of the user's data and
// the hard constraints stays, and is reported as before (D028).
func (r *Rules) dropProvidedCycles(chk Check) {
	for range 10000 {
		c, found := r.Cycle(chk.Known, chk.Hard)
		if !found || !r.dropOne(c) {
			return
		}
	}
}

func (r *Rules) dropOne(c ordering.Cycle) bool {
	// As LOOT ranks its edges, groups give way before "load after" rules:
	// first a plugin's provided group, then a provided relation between
	// groups, last a provided rule.
	for _, e := range c.Edges {
		if !strings.HasPrefix(e.Ref, RefGroupPrefix) {
			continue
		}
		for _, item := range []ordering.Item{e.After, e.Before} {
			k := string(item)
			if _, ok := r.prov.assign[k]; ok {
				r.prov.skipped = append(r.prov.skipped, Skipped{Kind: "assignment", Plugin: r.spelling[k], Group: r.assigned[k]})
				delete(r.assigned, k)
				delete(r.spelling, k)
				delete(r.prov.assign, k)
				return true
			}
		}
	}
	for _, e := range c.Edges {
		if !strings.HasPrefix(e.Ref, RefGroupPrefix) {
			continue
		}
		g, a, _ := strings.Cut(strings.TrimPrefix(e.Ref, RefGroupPrefix), ">")
		if _, ok := r.prov.after[g+">"+a]; ok {
			i := slices.IndexFunc(r.groups, func(o Group) bool { return o.Name == g })
			r.groups[i].After = slices.DeleteFunc(r.groups[i].After, func(x string) bool { return x == a })
			delete(r.prov.after, g+">"+a)
			r.prov.skipped = append(r.prov.skipped, Skipped{Kind: "group", Group: g, After: a})
			return true
		}
	}
	for _, e := range c.Edges {
		if !strings.HasPrefix(e.Ref, RefRulePrefix) {
			continue
		}
		id := RuleID(strings.TrimPrefix(e.Ref, RefRulePrefix))
		i := slices.IndexFunc(r.rules, func(o Rule) bool { return o.ID == id })
		if _, ok := r.prov.rules[id]; !ok || i < 0 {
			continue
		}
		rule := r.rules[i]
		r.rules = slices.Delete(r.rules, i, i+1)
		delete(r.prov.rules, id)
		r.prov.skipped = append(r.prov.skipped, Skipped{Kind: "rule", Plugin: rule.Plugin, After: string(rule.After)})
		return true
	}
	return false
}

// Skipped lists the provided items left out because they closed a cycle.
func (r *Rules) Skipped() []Skipped {
	if r.prov == nil {
		return nil
	}
	return slices.Clone(r.prov.skipped)
}

// ProvidedBy returns the provider of a rule of the effective set ("" for
// the user's own).
func (r *Rules) ProvidedBy(id RuleID) rules.Source {
	if r.prov == nil {
		return ""
	}
	return r.prov.rules[id]
}

// GroupProvidedBy returns the provider that created a group ("" for the
// user's own groups).
func (r *Rules) GroupProvidedBy(name string) rules.Source {
	if r.prov == nil {
		return ""
	}
	return r.prov.groups[name]
}

// AssignmentProvidedBy returns the provider of a plugin's group ("" when
// the user chose it, or for the default group).
func (r *Rules) AssignmentProvidedBy(n Name) rules.Source {
	if r.prov == nil {
		return ""
	}
	return r.prov.assign[n.Key()]
}
