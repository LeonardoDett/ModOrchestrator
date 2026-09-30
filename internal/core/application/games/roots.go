package games

import (
	"context"

	"modorchestrator/internal/core/domain/game"
)

// RootCheck is the answer to "is this folder an installation of this game?".
type RootCheck struct {
	Root    string
	Version string
	// Problem is nil when the folder is valid.
	Problem *Problem
}

// CheckRoot validates a folder the user picked ("Localizar manualmente",
// change location) and reads the game version from it. A wrong folder is
// refused with the reason, never accepted with a warning (core/11 §8).
func (s *Service) CheckRoot(ctx context.Context, id game.ID, root string) (RootCheck, error) {
	adapter, _, err := s.lookup(id)
	if err != nil {
		return RootCheck{}, err
	}
	root = cleanRoot(root)
	out := RootCheck{Root: root}
	if game.Volume(root) == "" {
		p := problem(CodeRootInvalid, "reason", string(game.RootNotAbsolute))
		out.Problem = &p
		return out, nil
	}
	if err := adapter.ValidateRoot(ctx, s.FS, id, root); err != nil {
		code, params, ok := CodeOf(err)
		if !ok {
			return out, err
		}
		out.Problem = &Problem{Code: code, Params: params}
		return out, nil
	}
	out.Version = s.version(ctx, adapter, id, root)
	return out, nil
}
