package games

import (
	"fmt"
	"slices"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Registry holds the adapters wired at bootstrap (D031). Everything the core
// knows about a specific game comes through it.
type Registry struct {
	adapters []ports.GameAdapter
	byGame   map[game.ID]ports.GameAdapter
	defs     []game.Definition
}

// NewRegistry validates every definition and refuses duplicates.
func NewRegistry(adapters ...ports.GameAdapter) (*Registry, error) {
	r := &Registry{byGame: map[game.ID]ports.GameAdapter{}}
	names := map[string]bool{}
	for _, a := range adapters {
		if names[a.Name()] {
			return nil, fmt.Errorf("games: adapter %q registered twice", a.Name())
		}
		names[a.Name()] = true
		for _, d := range a.Definitions() {
			if err := d.Validate(); err != nil {
				return nil, fmt.Errorf("games: adapter %s: %w", a.Name(), err)
			}
			if _, dup := r.byGame[d.ID]; dup {
				return nil, fmt.Errorf("games: game %q defined by two adapters", d.ID)
			}
			r.byGame[d.ID] = a
			r.defs = append(r.defs, d)
		}
		r.adapters = append(r.adapters, a)
	}
	return r, nil
}

// Adapter returns the adapter serving the game.
func (r *Registry) Adapter(id game.ID) (ports.GameAdapter, bool) {
	a, ok := r.byGame[id]
	return a, ok
}

// ByName returns an adapter by its registered name (stored in instances).
func (r *Registry) ByName(name string) (ports.GameAdapter, bool) {
	i := slices.IndexFunc(r.adapters, func(a ports.GameAdapter) bool { return a.Name() == name })
	if i < 0 {
		return nil, false
	}
	return r.adapters[i], true
}

// Adapters returns the adapters in registration order.
func (r *Registry) Adapters() []ports.GameAdapter { return slices.Clone(r.adapters) }

// Definitions returns every definition in registration order.
func (r *Registry) Definitions() []game.Definition { return slices.Clone(r.defs) }

// Definition returns the static definition of a game.
func (r *Registry) Definition(id game.ID) (game.Definition, bool) {
	i := slices.IndexFunc(r.defs, func(d game.Definition) bool { return d.ID == id })
	if i < 0 {
		return game.Definition{}, false
	}
	return r.defs[i], true
}

// hints gathers the registry hints declared by every adapter.
func (r *Registry) hints() []ports.RegistryHint {
	var out []ports.RegistryHint
	for _, d := range r.defs {
		out = append(out, r.byGame[d.ID].RegistryHints(d.ID)...)
	}
	return out
}
