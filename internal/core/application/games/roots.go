package games

import (
	"context"
	"strings"

	"modorchestrator/internal/core/application/ports"

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
	out.Version = s.version(ctx, id, root)
	return out, nil
}

// Recognition is a game a chosen folder holds (R5d): the game, the marker
// file that proves it and the version read from the folder.
type Recognition struct {
	Game    game.ID
	Name    string
	Marker  string
	Version string
}

// Recognize tells which games a folder chosen by hand holds: every game of
// the registry whose marker file is in the folder and whose adapter
// accepts it as a root. It only reads the folder, never below it.
func (s *Service) Recognize(ctx context.Context, root string) ([]Recognition, error) {
	entries, err := s.FS.ReadDir(ctx, root)
	if err != nil {
		return nil, err
	}
	present := map[string]string{}
	for _, e := range entries {
		if !e.IsDir {
			present[strings.ToLower(e.Name)] = e.Name
		}
	}
	var out []Recognition
	for _, d := range s.Registry.Definitions() {
		for _, m := range d.Discovery.Markers {
			name, ok := present[strings.ToLower(m)]
			if !ok {
				continue
			}
			a, ok := s.Registry.Adapter(d.ID)
			if !ok || a.ValidateRoot(ctx, s.FS, d.ID, root) != nil {
				continue
			}
			out = append(out, Recognition{Game: d.ID, Name: d.Name, Marker: name, Version: s.version(ctx, d.ID, root)})
			break
		}
	}
	return out, nil
}

// Templates lists the ready-made layouts of custom games, from the adapter
// that serves them (D129).
func (s *Service) Templates() []ports.GameTemplate {
	for _, a := range s.Registry.Adapters() {
		if p, ok := a.(ports.TemplateProvider); ok {
			return p.Templates()
		}
	}
	return nil
}
