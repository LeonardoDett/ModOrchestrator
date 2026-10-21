package plugins

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/rules"
)

// EventRuleUpdated: a rule was disabled or enabled again.
const EventRuleUpdated event.Type = "plugin_rule.updated"

// EventRulesImported: rules, groups and assignments came from another tool.
const EventRulesImported event.Type = "plugin_rule.imported"

// SetPluginRuleDisabled disables (or enables again) a rule. A provided
// rule (D141) can only be disabled, never removed: the mark is kept by id.
// Enabling a user rule refuses a cycle (D028).
func (s *Service) SetPluginRuleDisabled(ctx context.Context, instance game.InstanceID, id plugin.RuleID, disabled bool) error {
	return s.command(ctx, instance, func(st *state) error {
		r, ok := st.effective.Rule(id)
		if !ok {
			return fail(CodeRuleNotFound, nil, "rule", string(id))
		}
		if st.effective.ProvidedBy(id) != "" {
			st.rules.SetProviderOff(id, disabled)
		} else if err := st.rules.SetRuleDisabled(id, disabled, st.check()); err != nil {
			return ruleError(err)
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(EventRuleUpdated, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "rule": string(id), "plugin": string(r.Plugin), "after": string(r.After), "disabled": strconv.FormatBool(disabled),
		})}})
		return err
	})
}

// ImportedRules are plugin rules, groups and assignments brought from
// another tool (a LOOT userlist). They become the user's own, with source
// "import" (D128): they can be deleted.
type ImportedRules struct {
	Rules       []plugin.Rule
	Groups      []plugin.Group
	Assignments map[plugin.Name]string
}

// ImportResult counts what an import added and what it left out
// (duplicates, unknown groups, cycles).
type ImportResult struct {
	Rules, Groups, Assignments int
	Skipped                    int
}

// ImportPluginRules adds imported rules, groups and assignments to the
// user's set. An item that already exists, names an unknown group or closes
// a cycle is skipped and counted; nothing already there changes.
func (s *Service) ImportPluginRules(ctx context.Context, instance game.InstanceID, in ImportedRules) (ImportResult, error) {
	var res ImportResult
	err := s.command(ctx, instance, func(st *state) error {
		chk := st.check()
		// Groups: create the missing ones first, then their "after".
		for _, g := range in.Groups {
			name := strings.TrimSpace(g.Name)
			if name == "" || st.rules.HasGroup(name) {
				continue
			}
			if err := st.rules.SetGroup(plugin.Group{Name: name}, chk); err != nil {
				res.Skipped++
				continue
			}
			res.Groups++
		}
		for _, g := range in.Groups {
			cur := st.rules.Groups()
			var after []string
			for _, c := range cur {
				if c.Name == g.Name {
					after = c.After
				}
			}
			for _, a := range g.After {
				if a == g.Name || !st.rules.HasGroup(a) || contains(after, a) {
					continue
				}
				probe := append(append([]string{}, after...), a)
				if err := st.rules.SetGroup(plugin.Group{Name: g.Name, After: probe}, chk); err != nil {
					res.Skipped++
					continue
				}
				after = probe
			}
		}
		for n, g := range in.Assignments {
			p := n
			if pl, ok := st.plugin(n); ok {
				p = pl.Name
			}
			if st.rules.GroupOf(p) != plugin.DefaultGroup || !st.rules.HasGroup(g) || g == plugin.DefaultGroup {
				res.Skipped++
				continue
			}
			if err := st.rules.Assign(p, g, chk); err != nil {
				res.Skipped++
				continue
			}
			res.Assignments++
		}
		for _, r := range in.Rules {
			r.ID = plugin.RuleID(s.IDs.NewID())
			r.Source = rules.SourceImport
			r.CreatedAt = s.Clock.Now()
			if pl, ok := st.plugin(r.Plugin); ok {
				r.Plugin = pl.Name
			}
			if pl, ok := st.plugin(r.After); ok {
				r.After = pl.Name
			}
			if err := st.rules.AddRule(r, chk); err != nil {
				if !errors.Is(err, plugin.ErrDuplicate) && !errors.Is(err, plugin.ErrCycle) && !errors.Is(err, plugin.ErrInvalid) {
					return err
				}
				res.Skipped++
				continue
			}
			res.Rules++
		}
		if res.Rules+res.Groups+res.Assignments == 0 {
			return nil
		}
		_, err := s.persist(ctx, mutation{st: st, rules: true, events: []event.Event{s.newEvent(EventRulesImported, subjectInstance, string(instance), map[string]string{
			"instance": string(instance), "rules": strconv.Itoa(res.Rules), "groups": strconv.Itoa(res.Groups), "assignments": strconv.Itoa(res.Assignments),
		})}})
		return err
	})
	return res, err
}

func contains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

// EventProviderUpdated: the data of a provider changed (a new masterlist,
// D141); screens and diagnostics read again.
const EventProviderUpdated event.Type = "plugin_rule.provider_updated"

// ProviderChanged arranges the load order again with the new provider data
// and announces it.
func (s *Service) ProviderChanged(ctx context.Context, instance game.InstanceID) error {
	return s.command(ctx, instance, func(st *state) error {
		a := st.arrange(st.settings.autoSort)
		m := mutation{st: st, events: []event.Event{s.newEvent(EventProviderUpdated, subjectInstance, string(instance), map[string]string{"instance": string(instance)})}}
		if a.sorted && len(a.moves) > 0 {
			m.events = append(m.events, s.newEvent(EventSorted, subjectProfile, string(st.profile.ID()), map[string]string{
				"instance": string(st.inst.ID), "moved": strconv.Itoa(len(a.moves)), "auto": "true",
			}))
			s.rememberSort(ctx, st, a.before)
		}
		_, err := s.persist(ctx, m)
		return err
	})
}
