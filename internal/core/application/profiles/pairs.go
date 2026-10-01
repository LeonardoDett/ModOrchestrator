package profiles

import (
	"context"
	"strconv"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/rules"
)

// PairChoice is what the conflict editor of a mod (DLG-08) asks for one
// opponent. Choosing is always an explicit user action: no rule exists
// because two mods conflict (D004, INV-CON-02).
type PairChoice string

const (
	// ChoiceWins: Mod wins Opponent (order rule Opponent → Mod).
	ChoiceWins PairChoice = "wins"
	// ChoiceLoses: Opponent wins Mod.
	ChoiceLoses PairChoice = "loses"
	// ChoiceOrder: no rule between them; the priority decides.
	ChoiceOrder PairChoice = "order"
)

// PairDecision is one line of DLG-08.
type PairDecision struct {
	Mod, Opponent mod.ID
	Choice        PairChoice
}

// PairRule is the order rule that currently decides a pair, if any.
type PairRule struct {
	ID       rules.ID
	Winner   mod.ID
	Source   rules.Source
	Disabled bool
}

// PairRules returns the direct order rules between a and b (either
// direction), enabled first.
func PairRules(set *rules.Set, a, b mod.ID) []PairRule {
	var on, off []PairRule
	for _, r := range set.OrderRules() {
		if (r.Before == a && r.After == b) || (r.Before == b && r.After == a) {
			pr := PairRule{ID: r.ID, Winner: r.After, Source: r.Source, Disabled: r.Disabled}
			if r.Disabled {
				off = append(off, pr)
			} else {
				on = append(on, pr)
			}
		}
	}
	return append(on, off...)
}

// PreviewPairDecisions computes, without saving, what saving DLG-08 would
// move in every profile, or the cycle that refuses it.
func (s *Service) PreviewPairDecisions(ctx context.Context, instance game.InstanceID, decisions []PairDecision) (RulePreview, error) {
	set, err := ruleSet(ctx, s.Deps.Rules, instance)
	if err != nil {
		return RulePreview{}, err
	}
	names, err := modNames(ctx, s.Mods, instance)
	if err != nil {
		return RulePreview{}, err
	}
	var out RulePreview
	n := 0
	preview := func() rules.ID { n++; return rules.ID("preview-" + strconv.Itoa(n)) }
	if _, err := applyPairDecisions(set, decisions, names, preview, time.Time{}); err != nil {
		if c, ok := cycleOf(err); ok {
			out.Cycle = cycleNames(c, names)
			return out, nil
		}
		return out, namedCycleError(err, names)
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
		if len(moves) > 0 {
			out.Profiles = append(out.Profiles, ProfileMoves{Profile: p.ID(), Name: p.Name(), Moves: modMoves(p.Order(), next, moves, names)})
		}
	}
	return out, nil
}

// ApplyPairDecisions saves DLG-08 in one transaction: rules are created,
// re-enabled, removed (user rules) or disabled (other sources, core/05 §2),
// then every profile is reordered once with minimal movement (D025). A
// decision that would close a cycle refuses the whole save (D028).
func (s *Service) ApplyPairDecisions(ctx context.Context, instance game.InstanceID, decisions []PairDecision) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		names, err := modNames(ctx, tx.Mods(), instance)
		if err != nil {
			return err
		}
		changes, err := applyPairDecisions(set, decisions, names, func() rules.ID { return rules.ID(s.IDs.NewID()) }, s.Clock.Now())
		if err != nil {
			return namedCycleError(err, names)
		}
		if len(changes) == 0 {
			return nil
		}
		if err := tx.Rules().Save(ctx, set); err != nil {
			return err
		}
		reorder := false
		for _, c := range changes {
			tx.Emit(s.newEvent(c.event, subjectInstance, string(instance), c.payload))
			reorder = reorder || c.event == EventRuleCreated || c.event == EventRuleEnabled
		}
		if !reorder {
			return nil // removing or disabling never moves anything (core/05 §4)
		}
		return s.applyRulesToAll(ctx, tx, instance, set, map[string]string{"rule": string(changes[len(changes)-1].rule)})
	})
}

type ruleChange struct {
	event   event.Type
	rule    rules.ID
	payload map[string]string
}

// applyPairDecisions edits set. Rules that stop applying go first, so that a
// decision reversing a pair never collides with its own old rule.
func applyPairDecisions(set *rules.Set, decisions []PairDecision, names map[mod.ID]string, newID func() rules.ID, now time.Time) ([]ruleChange, error) {
	type want struct{ winner, loser mod.ID }
	wants := make([]*want, len(decisions))
	for i, d := range decisions {
		if d.Mod == d.Opponent {
			return nil, fail(CodeRuleSelf, nil, "mod", names[d.Mod])
		}
		if err := checkMods(names, d.Mod, d.Opponent); err != nil {
			return nil, err
		}
		switch d.Choice {
		case ChoiceWins:
			wants[i] = &want{d.Mod, d.Opponent}
		case ChoiceLoses:
			wants[i] = &want{d.Opponent, d.Mod}
		case ChoiceOrder:
		default:
			return nil, fail(CodeRuleNotFound, nil, "choice", string(d.Choice))
		}
	}
	var changes []ruleChange
	satisfied := make([]bool, len(decisions))
	for i, d := range decisions {
		for _, r := range PairRules(set, d.Mod, d.Opponent) {
			if w := wants[i]; w != nil && r.Winner == w.winner {
				// An enabled rule in the wanted direction already decides
				// the pair; a disabled one is re-enabled below.
				satisfied[i] = satisfied[i] || !r.Disabled
				continue
			}
			if r.Disabled {
				continue
			}
			if r.Source == rules.SourceUser {
				if err := set.Remove(r.ID); err != nil {
					return nil, ruleError(err)
				}
				changes = append(changes, ruleChange{EventRuleRemoved, r.ID, map[string]string{"rule": string(r.ID)}})
			} else {
				if err := set.SetDisabled(r.ID, true); err != nil {
					return nil, ruleError(err)
				}
				changes = append(changes, ruleChange{EventRuleDisabled, r.ID, map[string]string{"rule": string(r.ID)}})
			}
		}
	}
	for i := range decisions {
		w := wants[i]
		if w == nil || satisfied[i] {
			continue
		}
		if dis := disabledRule(set, w.winner, w.loser); dis != "" {
			if err := set.SetDisabled(dis, false); err != nil {
				return nil, err
			}
			changes = append(changes, ruleChange{EventRuleEnabled, dis, map[string]string{"rule": string(dis)}})
			continue
		}
		id := newID()
		if err := set.AddOrderRule(rules.OrderRule{ID: id, Before: w.loser, After: w.winner, Source: rules.SourceUser, CreatedAt: now}); err != nil {
			return nil, err
		}
		changes = append(changes, ruleChange{EventRuleCreated, id, map[string]string{
			"rule": string(id), "kind": string(KindWins), "winner": string(w.winner), "loser": string(w.loser),
			"winnerName": names[w.winner], "loserName": names[w.loser],
		}})
	}
	return changes, nil
}

// disabledRule finds a disabled rule "winner wins loser" to re-enable
// instead of duplicating it.
func disabledRule(set *rules.Set, winner, loser mod.ID) rules.ID {
	for _, r := range set.OrderRules() {
		if r.Disabled && r.After == winner && r.Before == loser {
			return r.ID
		}
	}
	return ""
}
