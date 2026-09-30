// Package override models per-file intent of a game instance (core/05 §5.3):
// FileOverride ("at this location, mod X wins regardless of the order"),
// FileExclusion ("mod X does not provide this location") and ConflictReview
// ("the user saw the dispute between A and B as it is now"). State category:
// desired. It belongs to the instance, not to a profile (D026). Staleness is
// detected by the conflict calculation, never fixed silently (INV-CON-03).
package override

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// Errors returned by the set.
var (
	ErrInvalid  = errors.New("override: invalid")
	ErrNotFound = errors.New("override: not found")
)

// FileOverride makes Winner the provider deployed at Location.
type FileOverride struct {
	Location  game.Location
	Winner    mod.ID
	CreatedAt time.Time
}

// FileExclusion removes Location from what Mod provides.
type FileExclusion struct {
	Mod       mod.ID
	Location  game.Location
	CreatedAt time.Time
}

// Pair is an unordered pair of mods, stored with A < B.
type Pair struct{ A, B mod.ID }

// NewPair orders the two mods.
func NewPair(a, b mod.ID) Pair {
	if b < a {
		a, b = b, a
	}
	return Pair{A: a, B: b}
}

// ConflictReview records that the user reviewed Pair while the contested
// locations had fingerprint Contested. It stops being valid when that set
// changes (D027: reviews are informative, never blocking).
type ConflictReview struct {
	Pair       Pair
	Contested  string
	ReviewedAt time.Time
}

// Data is the plain form for persistence.
type Data struct {
	Instance   game.InstanceID
	Overrides  []FileOverride
	Exclusions []FileExclusion
	Reviews    []ConflictReview
}

// Set holds every per-file intent of one instance.
type Set struct {
	instance   game.InstanceID
	overrides  map[string]FileOverride
	exclusions map[string]FileExclusion
	reviews    map[Pair]ConflictReview
}

// New creates an empty set.
func New(instance game.InstanceID) (*Set, error) { return Restore(Data{Instance: instance}) }

// Restore rebuilds a set, validating every entry.
func Restore(d Data) (*Set, error) {
	if d.Instance == "" {
		return nil, fmt.Errorf("%w: set needs an instance", ErrInvalid)
	}
	s := &Set{instance: d.Instance, overrides: map[string]FileOverride{}, exclusions: map[string]FileExclusion{}, reviews: map[Pair]ConflictReview{}}
	for _, o := range d.Overrides {
		if err := s.SetOverride(o.Location, o.Winner, o.CreatedAt); err != nil {
			return nil, err
		}
	}
	for _, e := range d.Exclusions {
		if err := s.Exclude(e.Mod, e.Location, e.CreatedAt); err != nil {
			return nil, err
		}
	}
	for _, r := range d.Reviews {
		if err := s.MarkReviewed(r.Pair.A, r.Pair.B, r.Contested, r.ReviewedAt); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// Data returns a sorted copy for persistence.
func (s *Set) Data() Data {
	return Data{Instance: s.instance, Overrides: s.Overrides(), Exclusions: s.Exclusions(), Reviews: s.Reviews()}
}

// Instance returns the owning instance.
func (s *Set) Instance() game.InstanceID { return s.instance }

// SetOverride creates or replaces the override of loc.
func (s *Set) SetOverride(loc game.Location, winner mod.ID, now time.Time) error {
	if err := loc.Validate(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if winner == "" {
		return fmt.Errorf("%w: override needs a winner", ErrInvalid)
	}
	s.overrides[loc.Key()] = FileOverride{Location: loc, Winner: winner, CreatedAt: now}
	return nil
}

// ClearOverride returns loc to the default (priority) winner.
func (s *Set) ClearOverride(loc game.Location) error {
	if _, ok := s.overrides[loc.Key()]; !ok {
		return fmt.Errorf("%w: no override at %s", ErrNotFound, loc)
	}
	delete(s.overrides, loc.Key())
	return nil
}

// Override returns the override of loc.
func (s *Set) Override(loc game.Location) (FileOverride, bool) {
	o, ok := s.overrides[loc.Key()]
	return o, ok
}

// Overrides returns every override, ordered by location.
func (s *Set) Overrides() []FileOverride {
	out := make([]FileOverride, 0, len(s.overrides))
	for _, o := range s.overrides {
		out = append(out, o)
	}
	slices.SortFunc(out, func(a, b FileOverride) int { return strings.Compare(a.Location.Key(), b.Location.Key()) })
	return out
}

// Exclude hides loc from m.
func (s *Set) Exclude(m mod.ID, loc game.Location, now time.Time) error {
	if err := loc.Validate(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if m == "" {
		return fmt.Errorf("%w: exclusion needs a mod", ErrInvalid)
	}
	s.exclusions[exclusionKey(m, loc)] = FileExclusion{Mod: m, Location: loc, CreatedAt: now}
	return nil
}

// Include undoes an exclusion.
func (s *Set) Include(m mod.ID, loc game.Location) error {
	k := exclusionKey(m, loc)
	if _, ok := s.exclusions[k]; !ok {
		return fmt.Errorf("%w: %q does not exclude %s", ErrNotFound, m, loc)
	}
	delete(s.exclusions, k)
	return nil
}

// Excluded reports whether m no longer provides loc.
func (s *Set) Excluded(m mod.ID, loc game.Location) bool {
	_, ok := s.exclusions[exclusionKey(m, loc)]
	return ok
}

// Exclusions returns every exclusion, ordered by mod then location.
func (s *Set) Exclusions() []FileExclusion {
	out := make([]FileExclusion, 0, len(s.exclusions))
	for _, e := range s.exclusions {
		out = append(out, e)
	}
	slices.SortFunc(out, func(a, b FileExclusion) int {
		return strings.Compare(exclusionKey(a.Mod, a.Location), exclusionKey(b.Mod, b.Location))
	})
	return out
}

// MarkReviewed records a review of the pair for the given contested set.
func (s *Set) MarkReviewed(a, b mod.ID, contested string, now time.Time) error {
	if a == "" || b == "" || a == b || contested == "" {
		return fmt.Errorf("%w: review needs two different mods and the contested fingerprint", ErrInvalid)
	}
	p := NewPair(a, b)
	s.reviews[p] = ConflictReview{Pair: p, Contested: contested, ReviewedAt: now}
	return nil
}

// Reviewed reports whether the pair was reviewed with exactly this contested
// set.
func (s *Set) Reviewed(a, b mod.ID, contested string) bool {
	r, ok := s.reviews[NewPair(a, b)]
	return ok && r.Contested == contested
}

// Reviews returns every review, ordered by pair.
func (s *Set) Reviews() []ConflictReview {
	out := make([]ConflictReview, 0, len(s.reviews))
	for _, r := range s.reviews {
		out = append(out, r)
	}
	slices.SortFunc(out, func(a, b ConflictReview) int {
		return strings.Compare(string(a.Pair.A)+"|"+string(a.Pair.B), string(b.Pair.A)+"|"+string(b.Pair.B))
	})
	return out
}

func exclusionKey(m mod.ID, loc game.Location) string { return string(m) + "|" + loc.Key() }
