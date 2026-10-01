package profiles

import (
	"context"
	"errors"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// OrderEntry is one position of the ModOrder as the Mods table shows it.
type OrderEntry struct {
	Mod mod.ID
	// Priority is the 1-based priority of a mod (separators have none).
	Priority  int
	Separator *SeparatorView
}

// SeparatorView is a separator with the counts of its block (ui/telas/
// mods.md §5.3).
type SeparatorView struct {
	profile.Separator
	Enabled, Total int
}

// OrderView is the ModOrder of the active profile.
type OrderView struct {
	Profile     profile.ID
	ProfileName string
	Entries     []OrderEntry
	// Undo is the order change Ctrl+Z would revert, if any (ui/02 F-04).
	Undo string
}

// OrderView returns the active profile's mod order with separators.
func (s *Service) OrderView(ctx context.Context, instance game.InstanceID) (OrderView, error) {
	id, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return OrderView{}, err
	}
	p, err := s.Profiles.Get(ctx, id)
	if err != nil {
		return OrderView{}, err
	}
	out := OrderView{Profile: id, ProfileName: p.Name()}
	prio := 0
	var current *SeparatorView
	for _, e := range p.Order() {
		if e.Separator != "" {
			sep, _ := p.Separator(e.Separator)
			current = &SeparatorView{Separator: sep}
			out.Entries = append(out.Entries, OrderEntry{Separator: current})
			continue
		}
		prio++
		out.Entries = append(out.Entries, OrderEntry{Mod: e.Mod, Priority: prio})
		if current != nil {
			current.Total++
			if p.IsEnabled(e.Mod) {
				current.Enabled++
			}
		}
	}
	if target, err := s.undoTarget(ctx, p); err == nil {
		out.Undo = target.ID
	}
	return out, nil
}

// MoveMode is what to do when the requested position breaks order rules
// (core/05 §4, DLG-11).
type MoveMode string

const (
	// MoveExact applies only a valid position; otherwise it refuses with
	// the violated rules and the nearest valid position.
	MoveExact MoveMode = "exact"
	// MoveNearest applies the nearest valid position.
	MoveNearest MoveMode = "nearest"
	// MoveRemoveRules removes (user) or disables (other sources) the
	// violated rules and applies the requested position.
	MoveRemoveRules MoveMode = "remove_rules"
)

// RuleView is a rule with names, as every rule list shows it.
type RuleView struct {
	ID       rules.ID
	Kind     RuleKind
	A, B     NamedMod
	Source   rules.Source
	Disabled bool
	// Orphan means a side is no longer installed (INV-LIB-05).
	Orphan bool
}

// RuleKind is the UI kind of a rule: for "wins", A wins B.
type RuleKind string

const (
	KindWins         RuleKind = "wins"
	KindRequires     RuleKind = "requires"
	KindRecommends   RuleKind = "recommends"
	KindIncompatible RuleKind = "incompatible"
)

// MoveResult is the outcome of MoveMods. When Applied is false nothing
// changed and Violated/Nearest explain why and what is possible.
type MoveResult struct {
	Applied  bool
	Violated []RuleView
	// NearestPriority is the priority the first moved mod would get at the
	// nearest valid position, 0 when there is none.
	NearestPriority int
	HasNearest      bool
}

// MoveMods moves entries (mods or separators; a separator brings its block)
// of the active profile to the anchor. An invalid position is refused with
// alternatives and changes nothing (core/05 §4, INV-ORD-03); the other
// modes are the explicit alternatives.
func (s *Service) MoveMods(ctx context.Context, instance game.InstanceID, entries []profile.Entry, anchor profile.Anchor, mode MoveMode) (MoveResult, error) {
	var res MoveResult
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		index, err := p.Resolve(entries, anchor)
		if err != nil {
			return movingError(err)
		}
		before := p.Data()
		now := s.Clock.Now()
		err = p.Move(entries, index, set.OrderEdges(), now)
		var refusal *profile.MoveRefusal
		if !errors.As(err, &refusal) {
			if err != nil {
				return movingError(err)
			}
			res.Applied = true
			return s.saveMoved(ctx, tx, p, before, ReasonMove, nil)
		}
		switch mode {
		case MoveNearest:
			if refusal.Nearest < 0 {
				return fail(CodeOrderViolates, err)
			}
			if err := p.Move(entries, refusal.Nearest, set.OrderEdges(), now); err != nil {
				return err
			}
			res.Applied = true
			return s.saveMoved(ctx, tx, p, before, ReasonMove, nil)
		case MoveRemoveRules:
			var removed []string
			for _, e := range refusal.Violated {
				id := rules.ID(e.Ref)
				r, _ := set.OrderRule(id)
				t := EventRuleRemoved
				if r.Source == rules.SourceUser {
					err = set.Remove(id)
				} else {
					t, err = EventRuleDisabled, set.SetDisabled(id, true)
				}
				if err != nil {
					return ruleError(err)
				}
				removed = append(removed, string(id))
				tx.Emit(s.newEvent(t, subjectInstance, string(instance), map[string]string{
					"rule": string(id), "kind": string(KindWins), "winner": string(r.After), "loser": string(r.Before), "source": string(r.Source),
				}))
			}
			if err := tx.Rules().Save(ctx, set); err != nil {
				return err
			}
			if err := p.Move(entries, index, set.OrderEdges(), now); err != nil {
				return err
			}
			res.Applied = true
			return s.saveMoved(ctx, tx, p, before, ReasonRuleOff, map[string]string{"rules": strings.Join(removed, ",")})
		}
		names, err := modNames(ctx, tx.Mods(), instance)
		if err != nil {
			return err
		}
		installed := installedSet(p)
		for _, e := range refusal.Violated {
			if r, ok := set.OrderRule(rules.ID(e.Ref)); ok {
				res.Violated = append(res.Violated, orderRuleView(r, names, installed))
			}
		}
		if refusal.Nearest >= 0 {
			res.HasNearest = true
			res.NearestPriority = firstMovedPriority(refusal.NearestOrder, entries, p)
		}
		return nil
	})
	return res, err
}

// saveMoved records the order change and saves the profile.
func (s *Service) saveMoved(ctx context.Context, tx ports.Tx, p *profile.Profile, before profile.Data, reason string, extra map[string]string) error {
	if err := s.recordOrder(ctx, tx, p, before, reason, extra); err != nil {
		return err
	}
	return tx.Profiles().Save(ctx, p)
}

// firstMovedPriority is the priority the first moved mod has in order.
func firstMovedPriority(order []profile.Entry, entries []profile.Entry, p *profile.Profile) int {
	moving := map[profile.Entry]bool{}
	for _, e := range entries {
		moving[e] = true
		if e.Separator != "" {
			if block, err := p.BlockMods(e.Separator); err == nil {
				for _, m := range block {
					moving[profile.Entry{Mod: m}] = true
				}
			}
		}
	}
	prio := 0
	for _, e := range order {
		if e.Mod == "" {
			continue
		}
		prio++
		if moving[e] {
			return prio
		}
	}
	return prio + 1
}

func movingError(err error) error {
	if errors.Is(err, profile.ErrNotFound) || errors.Is(err, profile.ErrInvalid) {
		return fail(CodeModNotFound, err)
	}
	return err
}

func installedSet(p *profile.Profile) map[mod.ID]bool {
	out := map[mod.ID]bool{}
	for _, m := range p.Mods() {
		out[m] = true
	}
	return out
}

func named(names map[mod.ID]string, id mod.ID) NamedMod {
	n := names[id]
	if n == "" {
		n = string(id)
	}
	return NamedMod{ID: id, Name: n}
}

func orderRuleView(r rules.OrderRule, names map[mod.ID]string, installed map[mod.ID]bool) RuleView {
	return RuleView{
		ID: r.ID, Kind: KindWins, A: named(names, r.After), B: named(names, r.Before), Source: r.Source,
		Disabled: r.Disabled, Orphan: !installed[r.After] || !installed[r.Before],
	}
}

// CreateSeparator inserts a separator in the active profile at the anchor
// (top when the anchor is empty).
func (s *Service) CreateSeparator(ctx context.Context, instance game.InstanceID, label, color string, anchor profile.Anchor) (profile.SeparatorID, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return "", fail(CodeNameEmpty, nil)
	}
	id := profile.SeparatorID(s.IDs.NewID())
	err := s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		index := 0
		if anchor.Kind != "" {
			// The separator is not in the order yet: resolve against the
			// order as is, using an empty block.
			if index, err = resolveForNew(p, anchor); err != nil {
				return movingError(err)
			}
		}
		before := p.Data()
		if err := p.AddSeparator(profile.Separator{ID: id, Label: label, Color: color}, index, s.Clock.Now()); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventSeparatorChanged, subjectProfile, string(p.ID()), map[string]string{"separator": string(id), "change": "created", "label": label}))
		return s.saveMoved(ctx, tx, p, before, ReasonMove, nil)
	})
	return id, err
}

// resolveForNew is Resolve for an entry that is not in the order yet.
func resolveForNew(p *profile.Profile, a profile.Anchor) (int, error) {
	order := p.Order()
	switch a.Kind {
	case profile.AnchorTop:
		return 0, nil
	case profile.AnchorBottom:
		return len(order), nil
	}
	for i, e := range order {
		if e == a.Entry {
			if a.Kind == profile.AnchorAfter {
				return i + 1, nil
			}
			return i, nil
		}
	}
	return 0, profile.ErrNotFound
}

// UpdateSeparator changes label, colour or collapsed state.
func (s *Service) UpdateSeparator(ctx context.Context, instance game.InstanceID, sep profile.Separator) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		if strings.TrimSpace(sep.Label) == "" {
			return fail(CodeNameEmpty, nil)
		}
		if _, ok := p.Separator(sep.ID); !ok {
			return fail(CodeSeparatorUnknown, nil, "separator", string(sep.ID))
		}
		if err := p.UpdateSeparator(sep, s.Clock.Now()); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventSeparatorChanged, subjectProfile, string(p.ID()), map[string]string{"separator": string(sep.ID), "change": "updated", "label": sep.Label}))
		return tx.Profiles().Save(ctx, p)
	})
}

// DeleteSeparator removes a separator; its mods stay where they are.
func (s *Service) DeleteSeparator(ctx context.Context, instance game.InstanceID, id profile.SeparatorID) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		sep, ok := p.Separator(id)
		if !ok {
			return fail(CodeSeparatorUnknown, nil, "separator", string(id))
		}
		before := p.Data()
		if err := p.RemoveSeparator(id, s.Clock.Now()); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventSeparatorChanged, subjectProfile, string(p.ID()), map[string]string{"separator": string(id), "change": "deleted", "label": sep.Label}))
		return s.saveMoved(ctx, tx, p, before, ReasonMove, nil)
	})
}

// SetBlockEnabled enables or disables every installed mod of a separator
// block (ui/telas/mods.md §5.3).
func (s *Service) SetBlockEnabled(ctx context.Context, instance game.InstanceID, id profile.SeparatorID, enabled bool) error {
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		block, err := p.BlockMods(id)
		if err != nil {
			return fail(CodeSeparatorUnknown, err, "separator", string(id))
		}
		if len(block) > limitsOf(ctx).bulk {
			if _, err := s.snapshot(ctx, tx, p.Data(), profile.SnapshotBulkEnable); err != nil {
				return err
			}
		}
		return s.setEnabled(ctx, tx, p, block, enabled)
	})
}

// applyRulesToAll reorders every profile of the instance with the given
// rule set and records the moves (rule creation, re-enabling). It returns
// the moves per profile.
func (s *Service) applyRulesToAll(ctx context.Context, tx ports.Tx, instance game.InstanceID, set *rules.Set, extra map[string]string) error {
	list, err := tx.Profiles().ListByInstance(ctx, instance)
	if err != nil {
		return err
	}
	for _, p := range list {
		before := p.Data()
		moves, err := p.Reorder(set.OrderEdges(), s.Clock.Now())
		if err != nil {
			return ruleCycleError(err)
		}
		if len(moves) == 0 {
			continue
		}
		if err := s.saveMoved(ctx, tx, p, before, ReasonRule, extra); err != nil {
			return err
		}
	}
	return nil
}

func ruleCycleError(err error) error {
	if errors.Is(err, ordering.ErrCycle) {
		return fail(CodeRuleCycle, err)
	}
	return err
}
