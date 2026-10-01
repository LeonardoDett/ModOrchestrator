package profiles

import (
	"context"
	"strconv"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/profile"
)

// historyDepth bounds how far back the order history is read. The full
// history projection with filters and retention is F9 (core/10 §3).
const historyDepth = 500

// OrderChange is one reversible entry of the order history.
type OrderChange struct {
	ID         string
	At         time.Time
	Reason     string
	Moved      int
	RevertOf   string
	Reverted   bool
	Revertible bool
}

// orderEvent is an order.changed event with its decoded payload.
type orderEvent struct {
	ev            event.Event
	before, after string
	reason        string
	revertOf      string
	moved         int
}

// orderEvents reads the order changes of a profile, newest first.
func (s *Service) orderEvents(ctx context.Context, id profile.ID) ([]orderEvent, error) {
	evs, err := s.Events.BySubject(ctx, event.EntityRef{Kind: subjectProfile, ID: string(id)}, historyDepth)
	if err != nil {
		return nil, err
	}
	var out []orderEvent
	for _, e := range evs {
		if e.Type != EventOrderChanged {
			continue
		}
		p, _ := e.Payload.(map[string]string)
		moved, _ := strconv.Atoi(p["moved"])
		out = append(out, orderEvent{ev: e, before: p["before"], after: p["after"], reason: p["reason"], revertOf: p["revertOf"], moved: moved})
	}
	return out, nil
}

// OrderHistory lists the order changes of the active profile, newest
// first, saying which ones can still be reverted: a change is revertible
// while the order is still the one it produced and it was not reverted.
func (s *Service) OrderHistory(ctx context.Context, instance game.InstanceID) ([]OrderChange, error) {
	id, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	evs, err := s.orderEvents(ctx, id)
	if err != nil {
		return nil, err
	}
	reverted := revertedSet(evs)
	current := profile.EncodeOrder(p.Order())
	out := make([]OrderChange, len(evs))
	for i, e := range evs {
		out[i] = OrderChange{
			ID: e.ev.ID, At: e.ev.OccurredAt, Reason: e.reason, Moved: e.moved, RevertOf: e.revertOf,
			Reverted: reverted[e.ev.ID], Revertible: !reverted[e.ev.ID] && e.after == current,
		}
	}
	return out, nil
}

func revertedSet(evs []orderEvent) map[string]bool {
	out := map[string]bool{}
	for _, e := range evs {
		if e.revertOf != "" {
			out[e.revertOf] = true
		}
	}
	return out
}

// undoTarget is the change Ctrl+Z reverts: walking back from the newest,
// reverts undo the change they reverted, so repeated undos keep going back
// (ui/02 F-04).
func (s *Service) undoTarget(ctx context.Context, p *profile.Profile) (event.Event, error) {
	evs, err := s.orderEvents(ctx, p.ID())
	if err != nil {
		return event.Event{}, err
	}
	reverted := revertedSet(evs)
	current := profile.EncodeOrder(p.Order())
	for _, e := range evs {
		if e.revertOf != "" || reverted[e.ev.ID] {
			continue
		}
		if e.after != current {
			break
		}
		return e.ev, nil
	}
	return event.Event{}, fail(CodeNothingToUndo, nil)
}

// UndoOrderChange reverts the latest order change of the active profile.
func (s *Service) UndoOrderChange(ctx context.Context, instance game.InstanceID) error {
	id, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return err
	}
	p, err := s.Profiles.Get(ctx, id)
	if err != nil {
		return err
	}
	target, err := s.undoTarget(ctx, p)
	if err != nil {
		return err
	}
	return s.RevertOrderChange(ctx, instance, target.ID)
}

// RevertOrderChange brings back the order before change id. It is a new
// command with its own history entry, never an erasure (core/10 §3). It is
// refused when the order changed since (order_history_stale) or when the
// old order breaks rules created since (order_violates_rules).
func (s *Service) RevertOrderChange(ctx context.Context, instance game.InstanceID, id string) error {
	// The event log is read before the transaction (single connection); the
	// order is compared again inside it, so a change in between is stale.
	active, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return err
	}
	evs, err := s.orderEvents(ctx, active)
	if err != nil {
		return err
	}
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		p, err := activeProfile(ctx, tx, instance)
		if err != nil {
			return err
		}
		if p.ID() != active {
			return fail(CodeHistoryStale, nil)
		}
		var target *orderEvent
		for i := range evs {
			if evs[i].ev.ID == id {
				target = &evs[i]
			}
		}
		if target == nil || revertedSet(evs)[id] || target.after != profile.EncodeOrder(p.Order()) {
			return fail(CodeHistoryStale, nil)
		}
		order, err := profile.DecodeOrder(target.before)
		if err != nil {
			return err
		}
		// Separators deleted since cannot come back; they make the change
		// stale rather than being recreated with unknown labels.
		seps := p.Separators()
		before := p.Data()
		if err := p.ReplaceOrder(order, seps, s.Clock.Now()); err != nil {
			return fail(CodeHistoryStale, err)
		}
		set, err := ruleSet(ctx, tx.Rules(), instance)
		if err != nil {
			return err
		}
		if v := p.Violations(set.OrderEdges()); len(v) > 0 {
			return fail(CodeOrderViolates, nil, "count", strconv.Itoa(len(v)))
		}
		return s.saveMoved(ctx, tx, p, before, ReasonRevert, map[string]string{"revertOf": id})
	})
}
