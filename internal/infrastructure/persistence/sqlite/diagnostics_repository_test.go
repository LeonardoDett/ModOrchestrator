package sqlite

import (
	"context"
	"testing"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/notification"
)

func TestHistoryTagsInstanceAndFilters(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	seedInstance(t, db, "i1")
	uow := NewUnitOfWork(db)
	at := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	ev := func(id string, typ event.Type, subject event.EntityRef, payload map[string]string, d time.Duration) event.Event {
		return event.Event{ID: id, Type: typ, OccurredAt: at.Add(d), Subject: subject, Payload: payload}
	}
	if _, err := uow.Do(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(
			ev("e1", "rule.created", event.EntityRef{Kind: "instance", ID: "i1"}, map[string]string{"winner": "m1", "loser": "m2"}, 0),
			ev("e2", "mod.enabled", event.EntityRef{Kind: "mod", ID: "m9"}, map[string]string{"instance": "i1", "profile": "p1"}, time.Minute),
		)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	auto := ports.WithEventTags(ctx, map[string]string{ports.TagOrigin: ports.OriginAuto, ports.TagRevertOf: "e2"})
	stored, err := uow.Do(auto, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(ev("e3", "mod.disabled", event.EntityRef{Kind: "mod", ID: "m9"}, map[string]string{"instance": "i1", "profile": "p1"}, 2*time.Minute))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if p := stored[0].Payload.(map[string]string); p[ports.TagOrigin] != ports.OriginAuto || p[ports.TagRevertOf] != "e2" {
		t.Fatalf("published events carry the tags: %v", p)
	}
	h := NewHistoryRepository(db)
	all, err := h.Query(ctx, ports.HistoryQuery{Instance: "i1"})
	if err != nil || len(all) != 3 || all[0].ID != "e3" {
		t.Fatalf("newest first by instance: %v %v", all, err)
	}
	if byMod, _ := h.Query(ctx, ports.HistoryQuery{Mod: "m1"}); len(byMod) != 1 || byMod[0].ID != "e1" {
		t.Fatalf("a mod named in the payload matches: %v", byMod)
	}
	if user, _ := h.Query(ctx, ports.HistoryQuery{Origin: ports.OriginUser}); len(user) != 2 {
		t.Fatalf("user origin = %d", len(user))
	}
	if typed, _ := h.Query(ctx, ports.HistoryQuery{TypePrefixes: []string{"mod."}, Before: all[0].Sequence}); len(typed) != 1 || typed[0].ID != "e2" {
		t.Fatalf("type prefix and paging: %v", typed)
	}
	if rev, _ := h.Reverted(ctx, []string{"e1", "e2"}); rev["e2"] != "e3" || rev["e1"] != "" {
		t.Fatalf("reverted = %v", rev)
	}
	if n, _ := h.Prune(ctx, at.Add(90*time.Second)); n != 2 {
		t.Fatalf("pruned %d", n)
	}
}

func TestNotificationsAndSuppressions(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	repo := NewNotificationRepository(db)
	at := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	n, _ := notification.New("n1", notification.KindDiagnostic, "k1", "rule_orphan", diagnostic.Params{"a": "b"}, event.EntityRef{Kind: "rule", ID: "r"}, at)
	n.Instance, n.Severity = "i1", "warning"
	if err := repo.Save(ctx, n); err != nil {
		t.Fatal(err)
	}
	n.Aggregate(at.Add(time.Second))
	if err := repo.Save(ctx, n); err != nil {
		t.Fatal(err)
	}
	got, err := repo.ByRef(ctx, "k1")
	if err != nil || got.Count != 2 || got.Params["a"] != "b" || got.Instance != "i1" {
		t.Fatalf("by ref = %+v %v", got, err)
	}
	got.Dismiss(at)
	repo.Save(ctx, got)
	if list, _ := repo.List(ctx, 0); len(list) != 0 {
		t.Fatal("dismissed notifications are not listed")
	}
	sups := NewSuppressionRepository(db)
	s, _ := diagnostic.NewSuppression("", "rule_orphan", at)
	sups.Save(ctx, s)
	sups.Save(ctx, s)
	if list, _ := sups.List(ctx); len(list) != 1 {
		t.Fatalf("suppressions = %v", list)
	}
	if n, _ := sups.DeleteAll(ctx); n != 1 {
		t.Fatalf("deleted %d", n)
	}
}
