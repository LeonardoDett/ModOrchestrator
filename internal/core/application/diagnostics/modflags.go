package diagnostics

import (
	"context"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
)

// ModFlags is what the visible problems say about one mod (Mods › Filtros,
// "Situação": board JogoModsMenus).
type ModFlags struct {
	// Error: an error-level problem names the mod.
	Error bool
	// MissingRequirement: the mod needs something that is missing or off.
	MissingRequirement bool
}

// ModFlags reads the visible diagnostics of an instance and marks the mods
// they are about: the first mod a diagnostic relates to is its subject.
func (s *Service) ModFlags(ctx context.Context, instance game.InstanceID) (map[string]ModFlags, error) {
	ds, _, err := s.Evaluate(ctx, instance)
	if err != nil {
		return nil, err
	}
	sups, err := s.Suppressions.List(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string]ModFlags{}
	for _, d := range diagnostic.Visible(ds, sups) {
		subject := ""
		for _, r := range d.Related {
			if r.Kind == "mod" {
				subject = r.ID
				break
			}
		}
		if subject == "" {
			continue
		}
		f := out[subject]
		if d.Code == diagnostic.CodeModRequirementMissing {
			f.MissingRequirement = true
		}
		if d.Severity == diagnostic.SeverityError && d.Code != diagnostic.CodeModRequirementMissing {
			f.Error = true
		}
		if f != (ModFlags{}) {
			out[subject] = f
		}
	}
	return out, nil
}
