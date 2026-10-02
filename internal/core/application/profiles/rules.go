package profiles

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// RuleList lists every rule of the instance (DLG-10), order rules first.
func (s *Service) RuleList(ctx context.Context, instance game.InstanceID) ([]RuleView, error) {
	set, err := ruleSet(ctx, s.Deps.Rules, instance)
	if err != nil {
		return nil, err
	}
	names, err := modNames(ctx, s.Mods, instance)
	if err != nil {
		return nil, err
	}
	installed, err := s.installedMods(ctx, instance)
	if err != nil {
		return nil, err
	}
	var out []RuleView
	for _, r := range set.OrderRules() {
		out = append(out, orderRuleView(r, names, installed))
	}
	for _, r := range set.DependencyRules() {
		kind := KindRequires
		if r.Kind == rules.Recommends {
			kind = KindRecommends
		}
		out = append(out, RuleView{ID: r.ID, Kind: kind, A: named(names, r.Mod), B: named(names, r.Target), Source: r.Source, Disabled: r.Disabled, Orphan: !installed[r.Mod]})
	}
	for _, r := range set.IncompatibilityRules() {
		out = append(out, RuleView{ID: r.ID, Kind: KindIncompatible, A: named(names, r.A), B: named(names, r.B), Source: r.Source, Disabled: r.Disabled, Orphan: !installed[r.A] || !installed[r.B]})
	}
	return out, nil
}

// installedMods are the mods the active profile knows: every installed mod
// of the instance (INV-ORD-02).
func (s *Service) installedMods(ctx context.Context, instance game.InstanceID) (map[mod.ID]bool, error) {
	id, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return installedSet(p), nil
}

// ProfileMoves is the effect a new rule has on one profile.
type ProfileMoves struct {
	Profile profile.ID
	Name    string
	Moves   []ModMove
}

// ModMove is one mod changing priority because of rules.
type ModMove struct {
	NamedMod
	From, To int
	// Because are the rules that forced the move.
	Because []rules.ID
}

// RulePreview is what creating "winner wins loser" would do (core/05 §4).
// With a cycle nothing would be created: Cycle lists the mods of the loop,
// the first repeated at the end.
type RulePreview struct {
	Cycle    []NamedMod
	Profiles []ProfileMoves
}

// PreviewOrderRule computes, without saving, the moves "winner wins loser"
// causes in every profile, or the cycle that refuses it.
func (s *Service) PreviewOrderRule(ctx context.Context, instance game.InstanceID, winner, loser mod.ID) (RulePreview, error) {
	set, err := ruleSet(ctx, s.Deps.Rules, instance)
	if err != nil {
		return RulePreview{}, err
	}
	names, err := modNames(ctx, s.Mods, instance)
	if err != nil {
		return RulePreview{}, err
	}
	var out RulePreview
	if err := s.addOrderRule(set, winner, loser, names, "preview", time.Time{}); err != nil {
		if c, ok := cycleOf(err); ok {
			out.Cycle = cycleNames(c, names)
			return out, nil
		}
		return out, err
	}
	list, err := s.Profiles.ListByInstance(ctx, instance)
	if err != nil {
		return RulePreview{}, err
	}
	for _, p := range list {
		moves, next, err := p.PreviewReorder(set.OrderEdges())
		if err != nil {
			return RulePreview{}, ruleCycleError(err)
		}
		if len(moves) == 0 {
			continue
		}
		out.Profiles = append(out.Profiles, ProfileMoves{Profile: p.ID(), Name: p.Name(), Moves: modMoves(p.Order(), next, moves, names)})
	}
	return out, nil
}

// CreateOrderRule stores "winner wins loser" for the instance and applies
// it to every profile with minimal movement (D025). A rule that would
// close a cycle is refused with the cycle in the error (D028, INV-ORD-04).
func (s *Service) CreateOrderRule(ctx context.Context, instance game.InstanceID, winner, loser mod.ID) (rules.ID, error) {
	var id rules.ID
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		names, err := modNames(ctx, tx.Mods(), instance)
		if err != nil {
			return err
		}
		id = rules.ID(s.IDs.NewID())
		if err := s.addOrderRule(set, winner, loser, names, id, s.Clock.Now()); err != nil {
			return namedCycleError(err, names)
		}
		if err := tx.Rules().Save(ctx, set); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventRuleCreated, subjectInstance, string(instance), map[string]string{
			"rule": string(id), "kind": string(KindWins), "winner": string(winner), "loser": string(loser),
			"winnerName": names[winner], "loserName": names[loser],
		}))
		return s.applyRulesToAll(ctx, tx, instance, set, map[string]string{"rule": string(id)})
	})
	return id, err
}

// addOrderRule validates names and adds the rule to set.
func (s *Service) addOrderRule(set *rules.Set, winner, loser mod.ID, names map[mod.ID]string, id rules.ID, now time.Time) error {
	if winner == loser {
		return fail(CodeRuleSelf, nil, "mod", names[winner])
	}
	for _, m := range []mod.ID{winner, loser} {
		if _, ok := names[m]; !ok {
			return fail(CodeModNotFound, nil, "mod", string(m))
		}
	}
	err := set.AddOrderRule(rules.OrderRule{ID: id, Before: loser, After: winner, Source: rules.SourceUser, CreatedAt: now})
	if errors.Is(err, rules.ErrCycle) {
		return err
	}
	if errors.Is(err, rules.ErrDuplicate) {
		return fail(CodeRuleDuplicate, err, "winner", names[winner], "loser", names[loser])
	}
	return err
}

func cycleOf(err error) (ordering.Cycle, bool) {
	var ce *ordering.CycleError
	if errors.As(err, &ce) {
		return ce.Cycle, true
	}
	return ordering.Cycle{}, false
}

// cycleNames lists the loop as the rules engine found it (each mod must
// come before the next), closing back on the first: A → B → C → A.
func cycleNames(c ordering.Cycle, names map[mod.ID]string) []NamedMod {
	out := make([]NamedMod, 0, len(c.Items)+1)
	for _, it := range c.Items {
		out = append(out, named(names, mod.ID(it)))
	}
	if len(c.Items) > 0 {
		out = append(out, named(names, mod.ID(c.Items[0])))
	}
	return out
}

// modMoves converts engine moves (positions with separators) to mod
// priorities.
func modMoves(before, after []profile.Entry, moves []profile.OrderMove, names map[mod.ID]string) []ModMove {
	prio := func(order []profile.Entry) map[mod.ID]int {
		out := map[mod.ID]int{}
		n := 0
		for _, e := range order {
			if e.Mod != "" {
				n++
				out[e.Mod] = n
			}
		}
		return out
	}
	pb, pa := prio(before), prio(after)
	var out []ModMove
	for _, m := range moves {
		if m.Entry.Mod == "" {
			continue
		}
		mm := ModMove{NamedMod: named(names, m.Entry.Mod), From: pb[m.Entry.Mod], To: pa[m.Entry.Mod]}
		for _, e := range m.Because {
			if !slices.Contains(mm.Because, rules.ID(e.Ref)) {
				mm.Because = append(mm.Because, rules.ID(e.Ref))
			}
		}
		out = append(out, mm)
	}
	return out
}

// AddDependency stores "mod requires/recommends target". It never moves
// anything; diagnostics come with F9.
func (s *Service) AddDependency(ctx context.Context, instance game.InstanceID, m, target mod.ID, kind rules.DependencyKind) (rules.ID, error) {
	id := rules.ID(s.IDs.NewID())
	err := s.editRules(ctx, instance, func(set *rules.Set, names map[mod.ID]string) (map[string]string, error) {
		if m == target {
			return nil, fail(CodeRuleSelf, nil, "mod", names[m])
		}
		if err := checkMods(names, m, target); err != nil {
			return nil, err
		}
		err := set.AddDependency(rules.DependencyRule{ID: id, Mod: m, Target: target, Kind: kind, Source: rules.SourceUser, CreatedAt: s.Clock.Now()})
		return map[string]string{"rule": string(id), "kind": string(kind), "mod": string(m), "target": string(target)}, ruleError(err)
	}, EventRuleCreated)
	return id, err
}

// AddIncompatibility stores "a is incompatible with b".
func (s *Service) AddIncompatibility(ctx context.Context, instance game.InstanceID, a, b mod.ID) (rules.ID, error) {
	id := rules.ID(s.IDs.NewID())
	err := s.editRules(ctx, instance, func(set *rules.Set, names map[mod.ID]string) (map[string]string, error) {
		if a == b {
			return nil, fail(CodeRuleSelf, nil, "mod", names[a])
		}
		if err := checkMods(names, a, b); err != nil {
			return nil, err
		}
		err := set.AddIncompatibility(rules.IncompatibilityRule{ID: id, A: a, B: b, Source: rules.SourceUser, CreatedAt: s.Clock.Now()})
		return map[string]string{"rule": string(id), "kind": string(KindIncompatible), "a": string(a), "b": string(b)}, ruleError(err)
	}, EventRuleCreated)
	return id, err
}

// RemoveRule deletes a user rule. Removing never moves anything (core/05
// §4); rules from other sources can only be disabled.
func (s *Service) RemoveRule(ctx context.Context, instance game.InstanceID, id rules.ID) error {
	return s.editRules(ctx, instance, func(set *rules.Set, _ map[mod.ID]string) (map[string]string, error) {
		desc := ruleDescription(set, id)
		return desc, ruleError(set.Remove(id))
	}, EventRuleRemoved)
}

// SetRuleDisabled disables or re-enables a rule. Re-enabling an order rule
// is refused if it closes a cycle and otherwise reorders every profile.
func (s *Service) SetRuleDisabled(ctx context.Context, instance game.InstanceID, id rules.ID, disabled bool) error {
	t := EventRuleEnabled
	if disabled {
		t = EventRuleDisabled
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		if err := set.SetDisabled(id, disabled); err != nil {
			names, nerr := modNames(ctx, tx.Mods(), instance)
			if nerr != nil {
				return nerr
			}
			return namedCycleError(err, names)
		}
		if err := tx.Rules().Save(ctx, set); err != nil {
			return err
		}
		tx.Emit(s.newEvent(t, subjectInstance, string(instance), map[string]string{"rule": string(id)}))
		if _, isOrder := set.OrderRule(id); isOrder && !disabled {
			return s.applyRulesToAll(ctx, tx, instance, set, map[string]string{"rule": string(id)})
		}
		return nil
	})
}

func (s *Service) editRules(ctx context.Context, instance game.InstanceID, fn func(*rules.Set, map[mod.ID]string) (map[string]string, error), t event.Type) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		names, err := modNames(ctx, tx.Mods(), instance)
		if err != nil {
			return err
		}
		payload, err := fn(set, names)
		if err != nil {
			return err
		}
		if err := tx.Rules().Save(ctx, set); err != nil {
			return err
		}
		tx.Emit(s.newEvent(t, subjectInstance, string(instance), payload))
		return nil
	})
}

func checkMods(names map[mod.ID]string, ids ...mod.ID) error {
	for _, m := range ids {
		if _, ok := names[m]; !ok {
			return fail(CodeModNotFound, nil, "mod", string(m))
		}
	}
	return nil
}

// namedCycleError turns a refused cycle into rule_would_create_cycle with
// the loop by name (core/05 §9: "recusada mostrando A → B → C → A"); other
// errors are mapped by ruleError.
func namedCycleError(err error, names map[mod.ID]string) error {
	c, ok := cycleOf(err)
	if !ok {
		return ruleError(err)
	}
	parts := make([]string, 0, len(c.Items)+1)
	for _, m := range cycleNames(c, names) {
		parts = append(parts, m.Name)
	}
	return fail(CodeRuleCycle, err, "cycle", strings.Join(parts, " → "))
}
