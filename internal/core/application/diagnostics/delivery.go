package diagnostics

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/notification"
	"modorchestrator/internal/core/domain/operation"
)

const (
	// aggregateWindow folds notifications of the same kind into one
	// ("12 mods instalados", Vortex NotificationAggregator).
	aggregateWindow = 30 * time.Second
	// longOperation is the duration from which a finished operation may
	// raise a desktop notification (core/10 §2).
	longOperation = 10 * time.Second
	// refreshDelay coalesces bursts of events into one evaluation.
	refreshDelay = 600 * time.Millisecond

	settingDesktop = "ui.desktopNotifications"
)

// Refresh evaluates an instance and records which diagnostics are present.
// A warning or error that was not present before notifies once (core/10
// §2: not on every recalculation), unless suppressed. It returns whether
// the set of problems changed.
func (s *Service) Refresh(ctx context.Context, instance game.InstanceID) (bool, error) {
	s.refreshing.Lock()
	defer s.refreshing.Unlock()
	ds, _, err := s.Evaluate(ctx, instance)
	if err != nil {
		return false, err
	}
	sups, err := s.Suppressions.List(ctx)
	if err != nil {
		return false, err
	}
	visible := map[diagnostic.Key]bool{}
	for _, d := range diagnostic.Visible(ds, sups) {
		visible[d.Key] = true
	}
	now := s.Clock.Now()
	changed := false
	stored, err := s.UoW.Do(ctx, func(ctx context.Context, tx ports.Tx) error {
		prev, err := tx.Presence().List(ctx, instance)
		if err != nil {
			return err
		}
		before := map[diagnostic.Key]diagnostic.Presence{}
		for _, p := range prev {
			before[p.Key] = p
		}
		next := make([]diagnostic.Presence, 0, len(ds))
		for _, d := range ds {
			p, seen := before[d.Key]
			if !seen {
				p = diagnostic.Presence{Key: d.Key, Code: d.Code, Severity: d.Severity, FirstSeen: now}
				changed = true
				if d.Severity != diagnostic.SeverityInfo && visible[d.Key] {
					if err := s.notifyDiagnostic(ctx, tx, instance, d, now); err != nil {
						return err
					}
				}
			}
			p.Severity = d.Severity
			next = append(next, p)
		}
		if len(next) != len(prev) {
			changed = true
		}
		if !changed {
			return nil
		}
		if err := tx.Presence().Replace(ctx, instance, next); err != nil {
			return err
		}
		tx.Emit(event.Event{ID: s.IDs.NewID(), Type: EventChanged, OccurredAt: now,
			Subject: event.EntityRef{Kind: "instance", ID: string(instance)},
			Payload: map[string]string{"instance": string(instance), "count": strconv.Itoa(len(next))}})
		return nil
	})
	if err != nil {
		return false, err
	}
	s.Publisher.Publish(stored...)
	return changed, nil
}

// notifyDiagnostic creates (or aggregates into) the notification of a
// diagnostic that just appeared.
func (s *Service) notifyDiagnostic(ctx context.Context, tx ports.Tx, instance game.InstanceID, d diagnostic.Diagnostic, now time.Time) error {
	params := diagnostic.Params{}
	for k, v := range d.Params {
		params[k] = v
	}
	params["key"] = string(d.Key)
	var subject event.EntityRef
	if len(d.Related) > 0 {
		subject = d.Related[0]
	}
	severity := string(d.Severity)
	if d.IsBlocking() {
		severity = "blocking"
	}
	return s.deliver(ctx, tx, notification.KindDiagnostic, "diag:"+string(instance)+":"+string(d.Code), string(d.Code), params, subject, string(instance), severity, false, now)
}

// deliver stores a notification, folding it into an unread one with the
// same aggregation reference created a moment ago.
func (s *Service) deliver(ctx context.Context, tx ports.Tx, kind notification.Kind, ref, code string, params diagnostic.Params, subject event.EntityRef, instance, severity string, desktop bool, now time.Time) error {
	n, err := tx.Notifications().ByRef(ctx, ref)
	switch {
	case err == nil && n.State == notification.StateUnread && now.Sub(n.UpdatedAt) <= aggregateWindow:
		n.Aggregate(now)
		if n.Params == nil {
			n.Params = diagnostic.Params{}
		}
		delete(n.Params, "key") // several problems: the link opens the list
	case err == nil || errors.Is(err, ports.ErrNotFound):
		n, err = notification.New(notification.ID(s.IDs.NewID()), kind, ref, code, params, subject, now)
		if err != nil {
			return err
		}
		n.Instance, n.Severity = instance, severity
	default:
		return err
	}
	if err := tx.Notifications().Save(ctx, n); err != nil {
		return err
	}
	tx.Emit(event.Event{ID: s.IDs.NewID(), Type: EventNotificationCreated, OccurredAt: now, Subject: subject,
		Payload: map[string]string{"notification": string(n.ID), "kind": string(kind), "code": code,
			"count": strconv.Itoa(n.Count), "desktop": strconv.FormatBool(desktop), "instance": instance}})
	return nil
}

// Notifications lists the notifications that were not dismissed, newest
// first (the bell, ui/00 §2.3).
func (s *Service) Notifications(ctx context.Context, limit int) ([]*notification.Notification, error) {
	return s.Notifs.List(ctx, limit)
}

// MarkRead marks notifications as read; every unread one when ids is empty
// ("marcar todas como lidas").
func (s *Service) MarkRead(ctx context.Context, ids []notification.ID) error {
	return s.updateNotifications(ctx, ids, func(n *notification.Notification, now time.Time) bool {
		return n.State == notification.StateUnread && n.MarkRead(now) == nil
	})
}

// Dismiss removes notifications from the bell; every one when ids is
// empty. It never resolves nor hides the diagnostic behind it.
func (s *Service) Dismiss(ctx context.Context, ids []notification.ID) error {
	return s.updateNotifications(ctx, ids, func(n *notification.Notification, now time.Time) bool {
		n.Dismiss(now)
		return true
	})
}

func (s *Service) updateNotifications(ctx context.Context, ids []notification.ID, fn func(*notification.Notification, time.Time) bool) error {
	now := s.Clock.Now()
	stored, err := s.UoW.Do(ctx, func(ctx context.Context, tx ports.Tx) error {
		var list []*notification.Notification
		if len(ids) == 0 {
			all, err := tx.Notifications().List(ctx, 1000)
			if err != nil {
				return err
			}
			list = all
		} else {
			for _, id := range ids {
				n, err := tx.Notifications().Get(ctx, id)
				if errors.Is(err, ports.ErrNotFound) {
					continue
				}
				if err != nil {
					return err
				}
				list = append(list, n)
			}
		}
		changed := 0
		for _, n := range list {
			if fn(n, now) {
				if err := tx.Notifications().Save(ctx, n); err != nil {
					return err
				}
				changed++
			}
		}
		if changed > 0 {
			tx.Emit(event.Event{ID: s.IDs.NewID(), Type: "notification.updated", OccurredAt: now, Payload: map[string]string{"count": strconv.Itoa(changed)}})
		}
		return nil
	})
	if err == nil {
		s.Publisher.Publish(stored...)
	}
	return err
}

// operationFinished turns the end of an operation into a notification
// (core/10 §2): failures and cancellations always; successes except the
// ones auto-deploy produced (it acts on the user's own changes and its
// status is visible). Several of the same kind in a short time aggregate.
func (s *Service) operationFinished(ctx context.Context, e event.Event, p operation.EventPayload, auto bool, started time.Time, desktopOn bool) error {
	if p.Status == operation.StatusSucceeded && auto {
		return nil
	}
	instance := s.instanceOf(ctx, e.Subject)
	params := diagnostic.Params{"kind": string(p.Kind), "operation": e.OperationID}
	if auto {
		params["auto"] = "true"
	}
	severity := "info"
	switch p.Status {
	case operation.StatusFailed:
		severity = "error"
		if p.Error != nil {
			params["error"] = p.Error.Code
			for k, v := range p.Error.Params {
				params["error."+k] = v
			}
		}
	case operation.StatusCancelled:
		severity = "warning"
	}
	desktop := desktopOn && !started.IsZero() && e.OccurredAt.Sub(started) >= longOperation
	ref := "op:" + string(p.Kind) + ":" + string(p.Status) + ":" + instance
	stored, err := s.UoW.Do(ctx, func(ctx context.Context, tx ports.Tx) error {
		return s.deliver(ctx, tx, notification.KindOperationResult, ref, "operation_"+string(p.Status), params, e.Subject, instance, severity, desktop, e.OccurredAt)
	})
	if err != nil {
		return err
	}
	s.Publisher.Publish(stored...)
	return nil
}

func (s *Service) instanceOf(ctx context.Context, ref event.EntityRef) string {
	switch ref.Kind {
	case "instance":
		return ref.ID
	case "mod":
		if m, err := s.Mods.Get(ctx, modID(ref.ID)); err == nil {
			return string(m.Instance)
		}
	}
	return ""
}

// watcher follows committed events: it re-evaluates the instances shortly
// after any change (so a problem appears and notifies without the user
// asking, and disappears when its cause is gone) and turns operation
// outcomes into notifications.
type watcher struct {
	s       *Service
	mu      sync.Mutex
	timer   *time.Timer
	closed  bool
	auto    map[string]bool
	started map[string]time.Time
	wg      sync.WaitGroup
}

func newWatcher(s *Service) *watcher {
	return &watcher{s: s, auto: map[string]bool{}, started: map[string]time.Time{}}
}

// Handle is subscribed to the event bus by the composition root.
func (s *Service) Handle(e event.Event) { s.watch.handle(e) }

// Close stops the watcher and waits for work in flight.
func (s *Service) Close() {
	s.watch.mu.Lock()
	s.watch.closed = true
	if s.watch.timer != nil {
		s.watch.timer.Stop()
	}
	s.watch.mu.Unlock()
	s.watch.wg.Wait()
}

func (w *watcher) handle(e event.Event) {
	t := string(e.Type)
	if strings.HasPrefix(t, "diagnostics.") || strings.HasPrefix(t, "notification.") || t == "operation.progress" {
		return
	}
	if m, ok := e.Payload.(map[string]string); ok && e.OperationID != "" && m[ports.TagOrigin] == ports.OriginAuto {
		w.mu.Lock()
		w.auto[e.OperationID] = true
		w.mu.Unlock()
	}
	if p, ok := e.Payload.(operation.EventPayload); ok {
		switch p.Status {
		case operation.StatusRunning:
			if e.Type == "operation.started" {
				w.mu.Lock()
				w.started[e.OperationID] = e.OccurredAt
				w.mu.Unlock()
			}
		case operation.StatusSucceeded, operation.StatusFailed, operation.StatusCancelled:
			w.mu.Lock()
			auto, started, closed := w.auto[e.OperationID], w.started[e.OperationID], w.closed
			delete(w.auto, e.OperationID)
			delete(w.started, e.OperationID)
			if !closed {
				w.wg.Add(1)
			}
			w.mu.Unlock()
			if !closed {
				go func() {
					defer w.wg.Done()
					ctx := context.Background()
					desktop := false
					if v, err := w.s.Settings.AppValue(ctx, settingDesktop); err == nil {
						desktop, _ = strconv.ParseBool(v.Value)
					}
					_ = w.s.operationFinished(ctx, e, p, auto, started, desktop)
				}()
			}
		}
	}
	w.trigger()
}

// trigger schedules one evaluation of every instance after a short delay.
func (w *watcher) trigger() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return
	}
	if w.timer != nil {
		w.timer.Stop()
	}
	w.timer = time.AfterFunc(refreshDelay, w.run)
}

func (w *watcher) run() {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	w.wg.Add(1)
	w.mu.Unlock()
	defer w.wg.Done()
	ctx := context.Background()
	list, err := w.s.Instances.List(ctx)
	if err != nil {
		return
	}
	for _, inst := range list {
		_, _ = w.s.Refresh(ctx, inst.ID)
	}
}

// RefreshAll evaluates every instance now (startup, tests).
func (s *Service) RefreshAll(ctx context.Context) error {
	list, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, inst := range list {
		if _, err := s.Refresh(ctx, inst.ID); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func modID(id string) mod.ID { return mod.ID(id) }
