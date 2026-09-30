package profile

import (
	"fmt"
	"slices"
	"time"

	"modorchestrator/internal/core/domain/mod"
)

// SnapshotID identifies a restore point.
type SnapshotID string

// SnapshotReason says why a restore point was taken (core/07 §6).
type SnapshotReason string

const (
	SnapshotManual       SnapshotReason = "manual"
	SnapshotBulkEnable   SnapshotReason = "before_bulk_enable"
	SnapshotTransfer     SnapshotReason = "before_transfer"
	SnapshotReorder      SnapshotReason = "before_reorder"
	SnapshotSort         SnapshotReason = "before_sort"
	SnapshotBeforeRevert SnapshotReason = "before_restore"
)

// Snapshot is a copy of the selection and orders of a profile.
type Snapshot struct {
	ID        SnapshotID
	Profile   ID
	Reason    SnapshotReason
	CreatedAt time.Time
	State     Data
}

// TakeSnapshot copies the current state.
func (p *Profile) TakeSnapshot(id SnapshotID, reason SnapshotReason, now time.Time) (Snapshot, error) {
	if id == "" || reason == "" {
		return Snapshot{}, fmt.Errorf("%w: snapshot needs id and reason", ErrInvalid)
	}
	return Snapshot{ID: id, Profile: p.d.ID, Reason: reason, CreatedAt: now, State: p.Data()}, nil
}

// RestoreSnapshot replaces selection, mod order, separators, plugin states,
// load order and locks with the snapshot. Mods the snapshot knows but the
// profile no longer has are ignored and returned; mods added after the
// snapshot stay, disabled, at the end (core/07 §6). Name, notes and
// features are not touched.
func (p *Profile) RestoreSnapshot(s Snapshot, now time.Time) (ignored []mod.ID, err error) {
	if s.Profile != p.d.ID {
		return nil, fmt.Errorf("%w: snapshot %q belongs to another profile", ErrInvalid, s.ID)
	}
	current := p.d.Mods
	next := cloneData(p.d)
	next.Mods = map[mod.ID]ModState{}
	next.Order = nil
	next.Separators = slices.Clone(s.State.Separators)
	for _, e := range s.State.Order {
		if e.Mod != "" {
			if _, ok := current[e.Mod]; !ok {
				ignored = append(ignored, e.Mod)
				continue
			}
			next.Mods[e.Mod] = s.State.Mods[e.Mod]
		}
		next.Order = append(next.Order, e)
	}
	for _, e := range p.d.Order {
		if e.Mod != "" {
			if _, ok := next.Mods[e.Mod]; !ok {
				next.Mods[e.Mod] = ModState{}
				next.Order = append(next.Order, e)
			}
		}
	}
	snap := cloneData(s.State)
	next.PluginsEnabled, next.LoadOrder, next.IndexLocks = snap.PluginsEnabled, snap.LoadOrder, snap.IndexLocks
	next.UpdatedAt = now
	restored, err := Restore(next)
	if err != nil {
		return nil, err
	}
	p.d = restored.d
	return ignored, nil
}
