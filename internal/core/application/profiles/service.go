// Package profiles is the application service of profiles and of the mod
// order (core/07, core/05 §1–4): profile lifecycle, comparison, transfer
// and snapshots; the ModOrder with separators; order rules with cycle
// refusal and per-profile preview; moves refused with alternatives; and the
// reversible history of order changes. Selection and position belong to the
// profile; rules belong to the instance and apply to every profile (D026).
// Nothing here touches the filesystem: changing the desired state only
// makes a deploy pending (F7).
package profiles

import (
	"context"
	"errors"
	"strconv"

	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/profile"
	"modorchestrator/internal/core/domain/rules"
)

// Event types (core/07 §9, core/05 §8).
const (
	EventProfileCreated     event.Type = "profile.created"
	EventProfileRenamed     event.Type = "profile.renamed"
	EventProfileCloned      event.Type = "profile.cloned"
	EventProfileDeleted     event.Type = "profile.deleted"
	EventProfileActivated   event.Type = "profile.activated"
	EventProfileTransferred event.Type = "profile.transferred"
	EventProfileNotes       event.Type = "profile.notes_changed"
	EventSnapshotCreated    event.Type = "snapshot.created"
	EventSnapshotRestored   event.Type = "snapshot.restored"
	EventModEnabled         event.Type = "mod.enabled"
	EventModDisabled        event.Type = "mod.disabled"
	EventOrderChanged       event.Type = "order.changed"
	EventSeparatorChanged   event.Type = "separator.changed"
	EventRuleCreated        event.Type = "rule.created"
	EventRuleRemoved        event.Type = "rule.removed"
	EventRuleDisabled       event.Type = "rule.disabled"
	EventRuleEnabled        event.Type = "rule.enabled"

	subjectProfile  = "profile"
	subjectInstance = "instance"
	subjectMod      = "mod"
	holderActivate  = "activate_profile"
)

// Reasons recorded with an order change, shown by the history.
const (
	ReasonMove     = "move"
	ReasonRule     = "rule"
	ReasonInstall  = "install"
	ReasonTransfer = "transfer"
	ReasonRestore  = "restore"
	ReasonRevert   = "revert"
	ReasonRuleOff  = "rule_removed_by_move"
)

// Settings is what the service reads from the settings service.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
}

// Deps are the ports the service needs.
type Deps struct {
	Instances ports.GameInstances
	Profiles  ports.Profiles
	Rules     ports.Rules
	Mods      ports.Mods
	Events    ports.EventLog
	UoW       ports.UnitOfWork
	Publisher operations.Publisher
	Settings  Settings
	Locks     *instancelock.Locks
	IDs       operations.IDGenerator
	Clock     operations.Clock
}

// Service implements the profile and mod order use cases.
type Service struct{ Deps }

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	return &Service{Deps: d}
}

// commit runs fn in one transaction and publishes the events after the
// commit (INV-OPS-01, anti-pattern 21). Inside fn only the repositories of
// tx may be used: the database has a single connection.
func (s *Service) commit(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) error {
	// Settings are read before the transaction opens: reading them inside
	// would wait for the connection the transaction holds.
	ctx = context.WithValue(ctx, limitsKey{}, limits{
		bulk:      s.intSetting(ctx, "snapshots.bulkThreshold", 10),
		retention: s.intSetting(ctx, "snapshots.autoRetention", 20),
		reorder:   s.intSetting(ctx, "order.snapshotMoveThreshold", 20),
	})
	stored, err := s.UoW.Do(ctx, fn)
	if err != nil {
		return err
	}
	if len(stored) > 0 {
		s.Publisher.Publish(stored...)
	}
	return nil
}

func (s *Service) newEvent(t event.Type, kind, id string, payload map[string]string) event.Event {
	if payload == nil {
		payload = map[string]string{}
	}
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), Subject: event.EntityRef{Kind: kind, ID: id}, Payload: payload}
}

// limits are the snapshot thresholds of core/07 §6 and core/05 §4.
type limits struct{ bulk, retention, reorder int }

type limitsKey struct{}

func limitsOf(ctx context.Context) limits {
	if l, ok := ctx.Value(limitsKey{}).(limits); ok {
		return l
	}
	return limits{bulk: 10, retention: 20, reorder: 20}
}

func (s *Service) intSetting(ctx context.Context, key string, def int) int {
	v, err := s.Settings.AppValue(ctx, key)
	if err != nil {
		return def
	}
	n, err := strconv.Atoi(v.Value)
	if err != nil {
		return def
	}
	return n
}

// activeProfile returns the active profile of an instance through tx.
func activeProfile(ctx context.Context, tx ports.Tx, instance game.InstanceID) (*profile.Profile, error) {
	id, err := tx.Profiles().Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	return tx.Profiles().Get(ctx, id)
}

// getProfile maps a missing profile to profile_not_found.
func getProfile(ctx context.Context, repo ports.Profiles, id profile.ID) (*profile.Profile, error) {
	p, err := repo.Get(ctx, id)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, fail(CodeProfileNotFound, err, "profile", string(id))
	}
	return p, err
}

// ruleSet reads the rules of an instance; a missing set is an empty one.
func ruleSet(ctx context.Context, repo ports.Rules, instance game.InstanceID) (*rules.Set, error) {
	set, err := repo.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return rules.New(instance)
	}
	return set, err
}

// modNames maps every mod of the instance to its display name.
func modNames(ctx context.Context, repo ports.Mods, instance game.InstanceID) (map[mod.ID]string, error) {
	list, err := repo.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	out := make(map[mod.ID]string, len(list))
	for _, m := range list {
		out[m.ID] = m.DisplayName()
	}
	return out, nil
}

// snapshot saves a restore point of state (taken before a change) and
// prunes old automatic ones (core/07 §6).
func (s *Service) snapshot(ctx context.Context, tx ports.Tx, state profile.Data, reason profile.SnapshotReason) (profile.SnapshotID, error) {
	snap := profile.Snapshot{ID: profile.SnapshotID(s.IDs.NewID()), Profile: state.ID, Reason: reason, CreatedAt: s.Clock.Now(), State: state}
	if err := tx.Profiles().SaveSnapshot(ctx, snap); err != nil {
		return "", err
	}
	if reason != profile.SnapshotManual {
		all, err := tx.Profiles().Snapshots(ctx, state.ID)
		if err != nil {
			return "", err
		}
		for _, id := range profile.PruneSnapshots(all, limitsOf(ctx).retention) {
			if err := tx.Profiles().DeleteSnapshot(ctx, id); err != nil {
				return "", err
			}
		}
	}
	tx.Emit(s.newEvent(EventSnapshotCreated, subjectProfile, string(state.ID), map[string]string{
		"snapshot": string(snap.ID), "reason": string(reason),
	}))
	return snap.ID, nil
}

// recordOrder emits order.changed for a profile whose order went from
// before to its current order, with both orders so the change can be
// reverted from history (core/10 §3), and takes the automatic snapshot of
// large reorders (core/05 §4). It does nothing when the order is the same.
func (s *Service) recordOrder(ctx context.Context, tx ports.Tx, p *profile.Profile, before profile.Data, reason string, extra map[string]string) error {
	after := p.Order()
	moved := profile.Displacement(before.Order, after)
	if moved == 0 && len(before.Order) == len(after) && profile.EncodeOrder(before.Order) == profile.EncodeOrder(after) {
		return nil
	}
	if moved > limitsOf(ctx).reorder {
		if _, err := s.snapshot(ctx, tx, before, profile.SnapshotReorder); err != nil {
			return err
		}
	}
	payload := map[string]string{
		"reason": reason, "moved": strconv.Itoa(moved),
		"before": profile.EncodeOrder(before.Order), "after": profile.EncodeOrder(after),
	}
	for k, v := range extra {
		payload[k] = v
	}
	tx.Emit(s.newEvent(EventOrderChanged, subjectProfile, string(p.ID()), payload))
	return nil
}

// lock refuses the command when another mutating operation holds the
// instance (D038); short commands take and release it at once.
func (s *Service) lock(instance game.InstanceID, holder string) (func(), error) {
	return s.Locks.Acquire(instance, holder)
}
