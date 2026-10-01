package conflicts

import (
	"context"
	"fmt"
	"slices"
	"strconv"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
)

// Error is a failure with a stable code and parameters for the translated
// message (D044).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("conflicts: %s: %v", e.code, e.cause)
	}
	return "conflicts: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return e.params }

// Error codes (core/05 §7).
const (
	CodeModNotFound    = "mod_not_found"
	CodeNotProvider    = "override_not_provider"
	CodeNothingChosen  = "override_nothing_selected"
	CodeLocationUnsafe = "location_invalid"
)

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause}
	if len(kv) > 0 {
		e.params = map[string]string{}
		for i := 0; i+1 < len(kv); i += 2 {
			e.params[kv[i]] = kv[i+1]
		}
	}
	return e
}

// fingerprints maps each disputed pair to the fingerprint of its current
// set of locations (D027).
func (st *state) fingerprints() map[override.Pair]string {
	out := map[override.Pair]string{}
	for _, ps := range conflict.Pairs(st.eval.Conflicts) {
		out[ps.Pair] = ps.Contested
	}
	return out
}

// providesNow reports whether m deploys loc when enabled: its installation
// has the location and it is not hidden.
func (s *Service) providesNow(st *state, m mod.ID, loc game.Location) bool {
	if st.intent.Excluded(m, loc) {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.ContainsFunc(st.index.Files(m), func(f mod.File) bool { return f.Dest.Key() == loc.Key() })
}

func checkLocations(locs []game.Location) error {
	if len(locs) == 0 {
		return fail(CodeNothingChosen, nil)
	}
	for _, l := range locs {
		if err := l.Validate(); err != nil {
			return fail(CodeLocationUnsafe, err, "path", l.String())
		}
	}
	return nil
}

// SetFileOverrides makes winner the deployed provider of every location,
// regardless of the order (core/05 §5.3; a batch creates one override per
// location, no wildcard in V1). The winner must be enabled and provide each
// location. The pairs of the winner with the other providers of those
// locations become reviewed (core/05 §5.4).
func (s *Service) SetFileOverrides(ctx context.Context, instance game.InstanceID, winner mod.ID, locs []game.Location) error {
	if err := checkLocations(locs); err != nil {
		return err
	}
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return err
	}
	if err := st.check(winner); err != nil {
		return err
	}
	name := st.ref(winner).Name
	for _, l := range locs {
		if !st.enabled[winner] || !s.providesNow(st, winner, l) {
			return fail(CodeNotProvider, nil, "mod", name, "path", l.Path.String())
		}
	}
	reviewed := st.pairsAt(locs, winner)
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		intent, err := intentOf(ctx, tx.Overrides(), instance)
		if err != nil {
			return err
		}
		now := s.Clock.Now()
		for _, l := range locs {
			if err := intent.SetOverride(l, winner, now); err != nil {
				return fail(CodeLocationUnsafe, err, "path", l.String())
			}
		}
		for p, fp := range reviewed {
			_ = intent.MarkReviewed(p.A, p.B, fp, now)
		}
		if err := tx.Overrides().Save(ctx, intent); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventOverrideSet, instance, batchPayload(locs, "winner", string(winner), "winnerName", name)))
		if len(reviewed) > 0 {
			tx.Emit(s.newEvent(EventReviewed, instance, map[string]string{"pairs": strconv.Itoa(len(reviewed)), "reason": "override"}))
		}
		return nil
	})
}

// pairsAt are the disputed pairs of winner with the other providers of
// locs, with their fingerprints.
func (st *state) pairsAt(locs []game.Location, winner mod.ID) map[override.Pair]string {
	keys := map[string]bool{}
	for _, l := range locs {
		keys[l.Key()] = true
	}
	fps := st.fingerprints()
	out := map[override.Pair]string{}
	for _, c := range st.eval.Conflicts {
		if !keys[c.Location.Key()] {
			continue
		}
		for _, p := range c.Providers {
			if p != winner {
				pair := override.NewPair(winner, p)
				out[pair] = fps[pair]
			}
		}
	}
	return out
}

// ClearFileOverrides returns locations to the default winner ("Voltar ao
// padrão"). Locations without an override are ignored.
func (s *Service) ClearFileOverrides(ctx context.Context, instance game.InstanceID, locs []game.Location) error {
	if err := checkLocations(locs); err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		intent, err := intentOf(ctx, tx.Overrides(), instance)
		if err != nil {
			return err
		}
		var cleared []game.Location
		for _, l := range locs {
			if intent.ClearOverride(l) == nil {
				cleared = append(cleared, l)
			}
		}
		if len(cleared) == 0 {
			return nil
		}
		if err := tx.Overrides().Save(ctx, intent); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventOverrideCleared, instance, batchPayload(cleared)))
		return nil
	})
}

// SetFileExclusions hides locations from m (MO2 "hide", core/05 §5.3) or
// shows them again. Hiding needs m to provide each location.
func (s *Service) SetFileExclusions(ctx context.Context, instance game.InstanceID, m mod.ID, locs []game.Location, hidden bool) error {
	if err := checkLocations(locs); err != nil {
		return err
	}
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return err
	}
	if err := st.check(m); err != nil {
		return err
	}
	name := st.ref(m).Name
	if hidden {
		for _, l := range locs {
			s.mu.Lock()
			has := slices.ContainsFunc(st.index.Files(m), func(f mod.File) bool { return f.Dest.Key() == l.Key() })
			s.mu.Unlock()
			if !has {
				return fail(CodeNotProvider, nil, "mod", name, "path", l.Path.String())
			}
		}
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		intent, err := intentOf(ctx, tx.Overrides(), instance)
		if err != nil {
			return err
		}
		var changed []game.Location
		for _, l := range locs {
			switch {
			case hidden && !intent.Excluded(m, l):
				if err := intent.Exclude(m, l, s.Clock.Now()); err != nil {
					return fail(CodeLocationUnsafe, err, "path", l.String())
				}
				changed = append(changed, l)
			case !hidden && intent.Include(m, l) == nil:
				changed = append(changed, l)
			}
		}
		if len(changed) == 0 {
			return nil
		}
		if err := tx.Overrides().Save(ctx, intent); err != nil {
			return err
		}
		t := EventExclusionCleared
		if hidden {
			t = EventExclusionSet
		}
		tx.Emit(s.newEvent(t, instance, batchPayload(changed, "mod", string(m), "modName", name)))
		return nil
	})
}

// MarkReviewed records that the user saw the given pairs as they are now
// (D027: informative only). Pairs without a current dispute are skipped.
func (s *Service) MarkReviewed(ctx context.Context, instance game.InstanceID, pairs []override.Pair) error {
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return err
	}
	return s.markReviewed(ctx, instance, st, pairs, "user")
}

func (s *Service) markReviewed(ctx context.Context, instance game.InstanceID, st *state, pairs []override.Pair, reason string) error {
	fps := st.fingerprints()
	todo := map[override.Pair]string{}
	for _, p := range pairs {
		p = override.NewPair(p.A, p.B)
		if fp, ok := fps[p]; ok {
			todo[p] = fp
		}
	}
	if len(todo) == 0 {
		return nil
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		intent, err := intentOf(ctx, tx.Overrides(), instance)
		if err != nil {
			return err
		}
		now := s.Clock.Now()
		for p, fp := range todo {
			if err := intent.MarkReviewed(p.A, p.B, fp, now); err != nil {
				return err
			}
		}
		if err := tx.Overrides().Save(ctx, intent); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventReviewed, instance, map[string]string{"pairs": strconv.Itoa(len(todo)), "reason": reason}))
		return nil
	})
}

// PreviewPairDecisions shows what saving the conflict editor (DLG-08) or a
// pair action of the Conflicts screen would move, or the refusing cycle.
func (s *Service) PreviewPairDecisions(ctx context.Context, instance game.InstanceID, decisions []profiles.PairDecision) (profiles.RulePreview, error) {
	return s.OrderRules.PreviewPairDecisions(ctx, instance, decisions)
}

// DecidePairs saves explicit pair decisions as order rules (never because
// of the conflict alone, D004) and marks the pairs reviewed (core/05 §5.4).
func (s *Service) DecidePairs(ctx context.Context, instance game.InstanceID, decisions []profiles.PairDecision) error {
	if err := s.OrderRules.ApplyPairDecisions(ctx, instance, decisions); err != nil {
		return err
	}
	// The set of disputed locations does not depend on the order, so the
	// review stays valid after the reorder.
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return err
	}
	pairs := make([]override.Pair, len(decisions))
	for i, d := range decisions {
		pairs[i] = override.NewPair(d.Mod, d.Opponent)
	}
	return s.markReviewed(ctx, instance, st, pairs, "rule")
}

// batchPayload describes a batch of locations for history: the count and
// the first path.
func batchPayload(locs []game.Location, kv ...string) map[string]string {
	p := map[string]string{"count": strconv.Itoa(len(locs)), "target": string(locs[0].Target), "path": locs[0].Path.String()}
	for i := 0; i+1 < len(kv); i += 2 {
		p[kv[i]] = kv[i+1]
	}
	return p
}
