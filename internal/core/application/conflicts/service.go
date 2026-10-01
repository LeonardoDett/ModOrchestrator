// Package conflicts is the application service of file conflicts (core/05
// §5): the calculated disputes of the active profile, aggregated by pair,
// by mod and by file; file overrides, exclusions and reviews (instance
// intent, D026); and the override_stale, conflicts_unreviewed and
// mod_fully_overwritten diagnostics.
//
// Conflicts are never persisted (INV-CON-04): an in-memory index of the
// installed footprints and a hash cache of staging files are rebuilt on
// demand and can be dropped at any time. Nothing here creates a rule or an
// override because two mods conflict (D004, INV-CON-02); every intent comes
// from a command the user asked for.
package conflicts

import (
	"context"
	"errors"
	"sync"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/application/profiles"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// Event types (core/05 §8).
const (
	EventOverrideSet      event.Type = "override.set"
	EventOverrideCleared  event.Type = "override.cleared"
	EventExclusionSet     event.Type = "exclusion.set"
	EventExclusionCleared event.Type = "exclusion.cleared"
	EventReviewed         event.Type = "conflict.reviewed"

	subjectInstance = "instance"
)

// Settings is what the service reads from the settings service.
type Settings interface {
	InstanceValue(ctx context.Context, instance, key string) (appsettings.Effective, error)
}

// Rules is the part of the profiles service that owns order rules: pair
// decisions create, remove or disable rules and reorder every profile.
type Rules interface {
	PreviewPairDecisions(ctx context.Context, instance game.InstanceID, decisions []profiles.PairDecision) (profiles.RulePreview, error)
	ApplyPairDecisions(ctx context.Context, instance game.InstanceID, decisions []profiles.PairDecision) error
}

// Deps are the ports the service needs.
type Deps struct {
	Instances     ports.GameInstances
	Mods          ports.Mods
	Installations ports.Installations
	Profiles      ports.Profiles
	Rules         ports.Rules
	Overrides     ports.Overrides
	UoW           ports.UnitOfWork
	Publisher     operations.Publisher
	FS            ports.FileReader
	Hasher        ports.Hasher
	Settings      Settings
	OrderRules    Rules
	IDs           operations.IDGenerator
	Clock         operations.Clock
}

// Service implements the conflict use cases.
type Service struct {
	Deps

	mu      sync.Mutex
	indexes map[game.InstanceID]*conflict.Index
	// hashes caches content hashes of staging files by installation and
	// source path; installations are immutable, so a new installation is a
	// new key (D063: SHA-256).
	hashes  map[string]string
	warming map[game.InstanceID]bool
	wg      sync.WaitGroup
}

// NewService wires the service.
func NewService(d Deps) *Service {
	return &Service{Deps: d, indexes: map[game.InstanceID]*conflict.Index{}, hashes: map[string]string{}, warming: map[game.InstanceID]bool{}}
}

// Wait blocks until background hashing finished (tests and shutdown).
func (s *Service) Wait() { s.wg.Wait() }

// state is everything a query needs about one instance, read once.
type state struct {
	inst     game.Instance
	profile  *profile.Profile
	order    []conflict.Slot
	priority map[mod.ID]int
	enabled  map[mod.ID]bool
	names    map[mod.ID]string
	rules    *rules.Set
	intent   *override.Set
	index    *conflict.Index
	eval     conflict.Evaluation
}

// load refreshes the index incrementally (only mods whose installation
// changed are read again) and evaluates the active profile.
func (s *Service) load(ctx context.Context, instance game.InstanceID, includeDisabled bool) (*state, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, pid)
	if err != nil {
		return nil, err
	}
	set, err := ruleSet(ctx, s.Deps.Rules, instance)
	if err != nil {
		return nil, err
	}
	intent, err := intentOf(ctx, s.Overrides, instance)
	if err != nil {
		return nil, err
	}
	st := &state{inst: inst, profile: p, names: map[mod.ID]string{}, rules: set, intent: intent, priority: map[mod.ID]int{}, enabled: map[mod.ID]bool{}}
	current := map[mod.ID]mod.InstallationID{}
	for _, m := range list {
		st.names[m.ID] = m.DisplayName()
		if m.State == mod.StateInstalled && m.Installation != "" {
			current[m.ID] = m.Installation
		}
	}
	if st.index, err = s.refresh(ctx, instance, current); err != nil {
		return nil, err
	}
	for i, m := range p.Mods() {
		if _, installed := current[m]; !installed {
			continue
		}
		on := p.IsEnabled(m)
		st.order = append(st.order, conflict.Slot{Mod: m, Enabled: on})
		st.priority[m], st.enabled[m] = i+1, on
	}
	st.eval = s.evaluate(st, includeDisabled)
	return st, nil
}

func (s *Service) evaluate(st *state, includeDisabled bool) conflict.Evaluation {
	s.mu.Lock()
	defer s.mu.Unlock()
	return st.index.Evaluate(conflict.EvalInput{
		Order: st.order, IncludeDisabled: includeDisabled, Intent: st.intent, RuleEdges: st.rules.OrderEdges(),
		Hash: func(m mod.ID, f mod.File) (string, bool) {
			id, _ := st.index.Installation(m)
			h, ok := s.hashes[hashKey(id, f)]
			return h, ok
		},
	})
}

// refresh brings the index of an instance to the current installations.
func (s *Service) refresh(ctx context.Context, instance game.InstanceID, current map[mod.ID]mod.InstallationID) (*conflict.Index, error) {
	s.mu.Lock()
	idx := s.indexes[instance]
	if idx == nil {
		idx = conflict.NewIndex()
		s.indexes[instance] = idx
	}
	var stale []mod.InstallationID
	for _, m := range idx.Mods() {
		if _, ok := current[m]; !ok {
			idx.Remove(m)
		}
	}
	for m, id := range current {
		if have, ok := idx.Installation(m); !ok || have != id {
			stale = append(stale, id)
		}
	}
	s.mu.Unlock()
	// Installations are read without holding the lock; Put is idempotent.
	for _, id := range stale {
		inst, err := s.Installations.Get(ctx, id)
		if errors.Is(err, ports.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		idx.Put(inst)
		s.mu.Unlock()
	}
	return idx, nil
}

func hashKey(id mod.InstallationID, f mod.File) string { return string(id) + "|" + f.Source.Key() }

// warm hashes, in the background, the files whose hash decides redundancy
// (core/05 §5.1 "hash sob demanda, com cache"). Queries report how many are
// pending; the UI reads again until none is (D021).
func (s *Service) warm(st *state) {
	if len(st.eval.NeedHash) == 0 {
		return
	}
	s.mu.Lock()
	if s.warming[st.inst.ID] {
		s.mu.Unlock()
		return
	}
	s.warming[st.inst.ID] = true
	s.mu.Unlock()
	reqs := append([]conflict.HashRequest(nil), st.eval.NeedHash...)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer func() {
			s.mu.Lock()
			delete(s.warming, st.inst.ID)
			s.mu.Unlock()
		}()
		s.hashFiles(context.Background(), st, reqs)
	}()
}

// WarmHashes computes every pending hash of the instance now.
func (s *Service) WarmHashes(ctx context.Context, instance game.InstanceID) error {
	st, err := s.load(ctx, instance, true)
	if err != nil {
		return err
	}
	s.hashFiles(ctx, st, st.eval.NeedHash)
	return nil
}

func (s *Service) hashFiles(ctx context.Context, st *state, reqs []conflict.HashRequest) {
	for _, r := range reqs {
		if ctx.Err() != nil {
			return
		}
		s.mu.Lock()
		id, _ := st.index.Installation(r.Mod)
		_, done := s.hashes[hashKey(id, r.File)]
		s.mu.Unlock()
		if done {
			continue
		}
		path := game.JoinPath(game.JoinPath(st.inst.Staging, string(r.Mod)), r.File.Source.String())
		rc, err := s.FS.Open(ctx, path)
		if err != nil {
			// An unreadable staging file is never redundant; integrity
			// problems are reported by the staging check (core/10).
			s.store(id, r.File, "unreadable:"+string(r.Mod))
			continue
		}
		h, err := s.Hasher.Hash(ctx, rc)
		rc.Close()
		if err != nil {
			s.store(id, r.File, "unreadable:"+string(r.Mod))
			continue
		}
		s.store(id, r.File, h)
	}
}

func (s *Service) store(id mod.InstallationID, f mod.File, h string) {
	s.mu.Lock()
	s.hashes[hashKey(id, f)] = h
	s.mu.Unlock()
}

// commit runs fn in one transaction and publishes the events after the
// commit (INV-OPS-01).
func (s *Service) commit(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) error {
	stored, err := s.UoW.Do(ctx, fn)
	if err != nil {
		return err
	}
	if len(stored) > 0 {
		s.Publisher.Publish(stored...)
	}
	return nil
}

func (s *Service) newEvent(t event.Type, instance game.InstanceID, payload map[string]string) event.Event {
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), Subject: event.EntityRef{Kind: subjectInstance, ID: string(instance)}, Payload: payload}
}

func ruleSet(ctx context.Context, repo ports.Rules, instance game.InstanceID) (*rules.Set, error) {
	set, err := repo.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return rules.New(instance)
	}
	return set, err
}

func intentOf(ctx context.Context, repo ports.Overrides, instance game.InstanceID) (*override.Set, error) {
	set, err := repo.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return override.New(instance)
	}
	return set, err
}
