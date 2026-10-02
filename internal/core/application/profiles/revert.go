package profiles

import (
	"context"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// ruleDescription is the definition of a rule as event payload: enough to
// recreate it when the history reverts its removal (core/10 §3).
func ruleDescription(set *rules.Set, id rules.ID) map[string]string {
	out := map[string]string{"rule": string(id)}
	for _, r := range set.OrderRules() {
		if r.ID == id {
			out["kind"], out["winner"], out["loser"], out["source"] = string(KindWins), string(r.After), string(r.Before), string(r.Source)
		}
	}
	for _, r := range set.DependencyRules() {
		if r.ID == id {
			out["kind"], out["mod"], out["target"], out["source"] = string(r.Kind), string(r.Mod), string(r.Target), string(r.Source)
		}
	}
	for _, r := range set.IncompatibilityRules() {
		if r.ID == id {
			out["kind"], out["a"], out["b"], out["source"] = string(KindIncompatible), string(r.A), string(r.B), string(r.Source)
		}
	}
	return out
}

// RestoreRule recreates a removed rule from its description (the payload of
// rule.removed), with its id when it is free. It goes through the same
// checks as creating a rule: a rule that would now close a cycle is refused
// (D028) and an order rule runs the engine in every profile (D069).
func (s *Service) RestoreRule(ctx context.Context, instance game.InstanceID, desc map[string]string) (rules.ID, error) {
	id := rules.ID(desc["rule"])
	source := rules.Source(desc["source"])
	if source == "" {
		source = rules.SourceUser
	}
	var created rules.ID
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		names, err := modNames(ctx, tx.Mods(), instance)
		if err != nil {
			return err
		}
		if id == "" || ruleExists(set, id) {
			id = rules.ID(s.IDs.NewID())
		}
		now := s.Clock.Now()
		switch RuleKind(desc["kind"]) {
		case KindWins:
			winner, loser := mod.ID(desc["winner"]), mod.ID(desc["loser"])
			if err := checkMods(names, winner, loser); err != nil {
				return err
			}
			if err := set.AddOrderRule(rules.OrderRule{ID: id, Before: loser, After: winner, Source: source, CreatedAt: now}); err != nil {
				return namedCycleError(err, names)
			}
		case KindRequires, KindRecommends:
			m, target := mod.ID(desc["mod"]), mod.ID(desc["target"])
			if err := checkMods(names, m, target); err != nil {
				return err
			}
			if err := set.AddDependency(rules.DependencyRule{ID: id, Mod: m, Target: target, Kind: rules.DependencyKind(desc["kind"]), Source: source, CreatedAt: now}); err != nil {
				return ruleError(err)
			}
		case KindIncompatible:
			a, b := mod.ID(desc["a"]), mod.ID(desc["b"])
			if err := checkMods(names, a, b); err != nil {
				return err
			}
			if err := set.AddIncompatibility(rules.IncompatibilityRule{ID: id, A: a, B: b, Source: source, CreatedAt: now}); err != nil {
				return ruleError(err)
			}
		default:
			return fail(CodeRuleNotFound, nil, "rule", string(id))
		}
		if err := tx.Rules().Save(ctx, set); err != nil {
			return err
		}
		created = id
		tx.Emit(s.newEvent(EventRuleCreated, subjectInstance, string(instance), ruleDescription(set, id)))
		if RuleKind(desc["kind"]) == KindWins {
			return s.applyRulesToAll(ctx, tx, instance, set, map[string]string{"rule": string(id)})
		}
		return nil
	})
	return created, err
}

func ruleExists(set *rules.Set, id rules.ID) bool {
	return len(ruleDescription(set, id)) > 1
}

// RuleExists reports whether a rule of the instance still exists, and
// whether it is disabled.
func (s *Service) RuleExists(ctx context.Context, instance game.InstanceID, id rules.ID) (exists, disabled bool, err error) {
	set, err := ruleSet(ctx, s.Rules, instance)
	if err != nil {
		return false, false, err
	}
	for _, r := range set.OrderRules() {
		if r.ID == id {
			return true, r.Disabled, nil
		}
	}
	for _, r := range set.DependencyRules() {
		if r.ID == id {
			return true, r.Disabled, nil
		}
	}
	for _, r := range set.IncompatibilityRules() {
		if r.ID == id {
			return true, r.Disabled, nil
		}
	}
	return false, false, nil
}

// SetModsEnabledIn enables or disables mods in a given profile (the
// history reverts a change of any profile, core/10 §3). The mods must be
// installed; a mod already in the wanted state is left alone.
func (s *Service) SetModsEnabledIn(ctx context.Context, id profile.ID, ids []mod.ID, enabled bool) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := getProfile(ctx, tx.Profiles(), id)
		if err != nil {
			return err
		}
		return s.setEnabled(ctx, tx, p, ids, enabled)
	})
}

// IsModEnabled reports the state of a mod in a profile.
func (s *Service) IsModEnabled(ctx context.Context, id profile.ID, m mod.ID) (bool, error) {
	p, err := getProfile(ctx, s.Profiles, id)
	if err != nil {
		return false, err
	}
	return p.IsEnabled(m), nil
}

// ActiveProfile returns the active profile of an instance.
func (s *Service) ActiveProfile(ctx context.Context, instance game.InstanceID) (profile.ID, error) {
	return s.Profiles.Active(ctx, instance)
}

// Impact is what enabling or disabling mods means for requirements, by name
// (core/06 §6).
type Impact struct {
	AlsoEnable []NamedMod
	Affected   []NamedMod
}

// EnableImpact tells, before or after enabling ids in the active profile,
// which disabled mods they require ("Também habilitar: X, Y"), or, when
// disabling, which enabled mods depend on them. It never changes anything.
func (s *Service) EnableImpact(ctx context.Context, instance game.InstanceID, ids []mod.ID, enabling bool) (Impact, error) {
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return Impact{}, err
	}
	p, err := getProfile(ctx, s.Profiles, pid)
	if err != nil {
		return Impact{}, err
	}
	set, err := ruleSet(ctx, s.Rules, instance)
	if err != nil {
		return Impact{}, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return Impact{}, err
	}
	facts := health.Mods{}
	for _, m := range list {
		facts[m.ID] = health.ModFact{ID: m.ID, Name: m.DisplayName(), State: m.State, Enabled: p.IsEnabled(m.ID)}
	}
	if enabling {
		// The mods being enabled count as enabled already.
		for _, id := range ids {
			if f, ok := facts[id]; ok {
				f.Enabled = true
				facts[id] = f
			}
		}
	}
	got := health.EnableImpact(set, facts, ids, enabling)
	named := func(ids []mod.ID) []NamedMod {
		out := make([]NamedMod, len(ids))
		for i, id := range ids {
			out[i] = NamedMod{ID: id, Name: facts[id].Name}
		}
		return out
	}
	return Impact{AlsoEnable: named(got.AlsoEnable), Affected: named(got.Affected)}, nil
}
