package games

import (
	"context"

	"modorchestrator/internal/core/domain/game"
)

// lockFeature names the holder of the instance lock while a feature
// changes, so a deploy never sees the change half way.
const lockFeature = "games.feature"

// InstanceFeature is one feature of an instance (D115): offered by the
// game, turned on by the user, and in effect when both hold and what it
// requires is in effect.
type InstanceFeature struct {
	ID       game.Capability
	Status   FeatureStatus
	Class    game.FeatureClass
	Requires []game.Capability
	// Enabled is the choice of the user (the default when never chosen).
	Enabled bool
	// Effective is what the core sees.
	Effective bool
	// BlockedBy lists the required features that are not in effect.
	BlockedBy []game.Capability
}

// Features lists every feature of the catalog for an instance, with what
// the game offers, what the user chose and what is in effect.
func (s *Service) Features(ctx context.Context, id game.InstanceID) ([]InstanceFeature, error) {
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	a, _, err := s.lookupInstance(inst)
	if err != nil {
		return nil, err
	}
	offered, err := a.InstanceDefinition(inst.Game, inst.Targets)
	if err != nil {
		return nil, fail(CodeGameUnknown, err, "game", string(inst.Game))
	}
	effective := offered.Effective(inst.Features)
	ids := game.Catalog()
	for _, c := range offered.Capabilities.List() {
		known := false
		for _, k := range ids {
			known = known || k == c
		}
		if !known {
			ids = append(ids, c)
		}
	}
	out := make([]InstanceFeature, 0, len(ids))
	for _, c := range ids {
		spec := game.Describe(c)
		f := InstanceFeature{ID: c, Status: FeatureNotApplicable, Class: spec.Class, Requires: spec.Requires}
		if offered.Capabilities.Has(c) {
			f.Status = FeatureAvailable
			f.Enabled = true
			if chosen, ok := inst.Features[c]; ok && spec.Class == game.ClassOptional {
				f.Enabled = chosen
			}
			f.Effective = effective.Capabilities.Has(c)
			for _, r := range spec.Requires {
				if !effective.Capabilities.Has(r) {
					f.BlockedBy = append(f.BlockedBy, r)
				}
			}
		}
		out = append(out, f)
	}
	return out, nil
}

// SetFeature turns an optional feature of an instance on or off. Turning a
// feature off never touches the game: the app only stops managing that
// part, and what is on disk stays as it is. Turning it on again shows what
// is there through the usual external change triage (D040, D115).
func (s *Service) SetFeature(ctx context.Context, id game.InstanceID, feature game.Capability, enabled bool) error {
	release, err := s.Locks.Acquire(id, lockFeature)
	if err != nil {
		return err
	}
	defer release()
	inst, err := s.Instances.Get(ctx, id)
	if err != nil {
		return err
	}
	a, _, err := s.lookupInstance(inst)
	if err != nil {
		return err
	}
	offered, err := a.InstanceDefinition(inst.Game, inst.Targets)
	if err != nil {
		return fail(CodeGameUnknown, err, "game", string(inst.Game))
	}
	if !offered.Capabilities.Has(feature) {
		return fail(CodeFeatureUnavailable, nil, "feature", string(feature))
	}
	spec := game.Describe(feature)
	if spec.Class != game.ClassOptional {
		return fail(CodeFeatureLocked, nil, "feature", string(feature))
	}
	if enabled {
		now := offered.Effective(inst.Features)
		for _, r := range spec.Requires {
			if !now.Capabilities.Has(r) {
				return fail(CodeFeatureRequires, nil, "feature", string(feature), "requires", string(r))
			}
		}
	}
	choices := map[game.Capability]bool{}
	for c, v := range inst.Features {
		choices[c] = v
	}
	choices[feature] = enabled
	inst.Features = choices
	return s.Instances.Save(ctx, inst)
}
