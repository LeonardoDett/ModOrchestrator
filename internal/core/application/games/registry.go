package games

import (
	"errors"
	"fmt"
	"slices"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
)

// Registry holds the adapters wired at bootstrap (D031) and the games they
// define. Everything the core knows about a specific game comes through it.
// The adapters are fixed; the games of the adapter that hosts user entries
// (ports.EntryHost) change with SetEntries (D117).
type Registry struct {
	adapters []ports.GameAdapter
	// diagnostics and texts come from the adapters' catalogs (D131).
	diagnostics diagnostic.Catalog
	texts       adapterTexts

	mu    sync.RWMutex
	byGame map[game.ID]ports.GameAdapter
	defs   []game.Definition
}

// NewRegistry validates every definition and refuses duplicates.
func NewRegistry(adapters ...ports.GameAdapter) (*Registry, error) {
	r := &Registry{}
	names := map[string]bool{}
	for _, a := range adapters {
		if names[a.Name()] {
			return nil, fmt.Errorf("games: adapter %q registered twice", a.Name())
		}
		names[a.Name()] = true
		r.adapters = append(r.adapters, a)
	}
	var err error
	if r.diagnostics, r.texts, err = buildCatalogs(r.adapters); err != nil {
		return nil, err
	}
	if err := r.rebuild(); err != nil {
		return nil, err
	}
	return r, nil
}

// rebuild reads the definitions of every adapter again. Nothing changes
// when one of them is refused.
func (r *Registry) rebuild() error {
	byGame := map[game.ID]ports.GameAdapter{}
	var defs []game.Definition
	for _, a := range r.adapters {
		if err := checkContracts(a); err != nil {
			return err
		}
		_, host := a.(ports.EntryHost)
		for _, d := range a.Definitions() {
			if err := d.Validate(); err != nil {
				return fmt.Errorf("games: adapter %s: %w", a.Name(), err)
			}
			if _, dup := byGame[d.ID]; dup {
				return fmt.Errorf("games: game %q defined by two adapters", d.ID)
			}
			if game.IsUserEntry(d.ID) && !host {
				return fmt.Errorf("games: adapter %s: id %q is in the namespace of user entries", a.Name(), d.ID)
			}
			byGame[d.ID] = a
			defs = append(defs, d)
		}
	}
	r.mu.Lock()
	r.byGame, r.defs = byGame, defs
	r.mu.Unlock()
	return nil
}

// SetEntries replaces the games described by the user (D117). Every entry
// must be in the user namespace, so it never takes the id of a game the app
// ships. With no adapter that hosts entries only an empty list is accepted.
func (r *Registry) SetEntries(entries []game.Manifest) error {
	var host ports.EntryHost
	for _, a := range r.adapters {
		if h, ok := a.(ports.EntryHost); ok {
			host = h
			break
		}
	}
	if host == nil {
		if len(entries) == 0 {
			return nil
		}
		return errors.New("games: no adapter hosts user entries")
	}
	for _, m := range entries {
		if !game.IsUserEntry(m.ID) {
			return fmt.Errorf("%w: entry %q is outside the user namespace", game.ErrInvalid, m.ID)
		}
	}
	if err := host.SetEntries(entries); err != nil {
		return err
	}
	return r.rebuild()
}

// Adapter returns the adapter serving the game.
func (r *Registry) Adapter(id game.ID) (ports.GameAdapter, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
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
func (r *Registry) Definitions() []game.Definition {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return slices.Clone(r.defs)
}

// Definition returns the static definition of a game.
func (r *Registry) Definition(id game.ID) (game.Definition, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	i := slices.IndexFunc(r.defs, func(d game.Definition) bool { return d.ID == id })
	if i < 0 {
		return game.Definition{}, false
	}
	return r.defs[i], true
}

// hints gathers the registry hints declared by every definition.
func (r *Registry) hints() []ports.RegistryHint {
	var out []ports.RegistryHint
	for _, d := range r.Definitions() {
		out = append(out, d.Discovery.Registry...)
	}
	return out
}
