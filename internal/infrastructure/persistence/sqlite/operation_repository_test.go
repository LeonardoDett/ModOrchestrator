package sqlite

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

type nopPublisher struct{}

func (nopPublisher) Publish(...event.Event) {}

type counterIDs struct{ n int }

func (c *counterIDs) NewID() string { c.n++; return fmt.Sprintf("id-%04d", c.n) }

type tickClock struct{ t time.Time }

func (c *tickClock) Now() time.Time { c.t = c.t.Add(time.Millisecond); return c.t }

func openTemp(t *testing.T) (string, func() *OperationRepository) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "state.db")
	return path, func() *OperationRepository {
		db, err := Open(context.Background(), path)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		return NewOperationRepository(db)
	}
}

func TestMigrationsAreIdempotent(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	v, err := SchemaVersion(ctx, db)
	if err != nil || v != LatestSchemaVersion() || v == 0 {
		t.Fatalf("schema version = %d (latest %d), err = %v", v, LatestSchemaVersion(), err)
	}
}

func TestRefusesNewerSchema(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO schema_migrations(version, name) VALUES (999, 'future')`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err == nil {
		t.Fatal("expected refusal of newer schema")
	}
}

func TestRoundTripAndRecoveryAcrossRestart(t *testing.T) {
	ctx := context.Background()
	_, open := openTemp(t)
	clock := &tickClock{t: time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC)}
	ids := &counterIDs{}

	// First "process": start an operation and stop mid-step.
	repo := open()
	svc := operations.NewService(repo, nopPublisher{}, ids, clock)
	tr, err := svc.Start(ctx, operations.Spec{Kind: "deploy", Subject: event.EntityRef{Kind: "game", ID: "g1"}, Steps: []string{"plan", "apply"}})
	if err != nil {
		t.Fatal(err)
	}
	must(t, tr.BeginStep(ctx, "plan"))
	must(t, tr.Progress(ctx, 2, 4))

	got, err := repo.Get(ctx, tr.ID())
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != operation.StatusRunning || got.CurrentStep != "plan" || got.Progress.Current != 2 || got.Subject.ID != "g1" {
		t.Fatalf("round trip mismatch: %+v", got)
	}

	// Second "process" on the same file: recovery marks it interrupted.
	repo2 := open()
	svc2 := operations.NewService(repo2, nopPublisher{}, ids, clock)
	recovered, err := svc2.RecoverInterrupted(ctx)
	if err != nil || len(recovered) != 1 {
		t.Fatalf("recovered = %v, err = %v", recovered, err)
	}
	after, _ := repo2.Get(ctx, tr.ID())
	if after.Status != operation.StatusInterrupted || after.CurrentStep != "plan" || after.FinishedAt == nil {
		t.Fatalf("after recovery: %+v", after)
	}

	evs, err := repo2.Events(ctx, tr.ID())
	if err != nil {
		t.Fatal(err)
	}
	wantTypes := []event.Type{operation.EventCreated, operation.EventStarted, operation.EventStepStarted, operation.EventProgress, operation.EventInterrupted}
	if len(evs) != len(wantTypes) {
		t.Fatalf("events = %d, want %d", len(evs), len(wantTypes))
	}
	for i, e := range evs {
		if e.Type != wantTypes[i] {
			t.Fatalf("event %d = %s, want %s", i, e.Type, wantTypes[i])
		}
		if i > 0 && e.Sequence <= evs[i-1].Sequence {
			t.Fatal("event sequences must increase")
		}
	}
	p, ok := evs[3].Payload.(operation.EventPayload)
	if !ok || p.Progress == nil || p.Progress.Total != 4 || p.Kind != "deploy" {
		t.Fatalf("progress payload = %#v", evs[3].Payload)
	}
}

func TestFailedOperationKeepsError(t *testing.T) {
	ctx := context.Background()
	_, open := openTemp(t)
	repo := open()
	svc := operations.NewService(repo, nopPublisher{}, &counterIDs{}, &tickClock{t: time.Now()})
	id, runErr := svc.Run(ctx, operations.Spec{Kind: "scan", Steps: []string{"walk"}}, func(ctx context.Context, tr *operations.Tracker) error {
		must(t, tr.BeginStep(ctx, "walk"))
		return &operation.Error{Code: "io", Message: "read failed", Detail: "EACCES", Retryable: true}
	})
	if runErr == nil {
		t.Fatal("expected error")
	}
	got, err := repo.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Error == nil || got.Error.Code != "io" || got.Error.Step != "walk" || !got.Error.Retryable {
		t.Fatalf("error = %+v", got.Error)
	}
	if got.Steps[0].Status != operation.StepFailed {
		t.Fatalf("step = %+v", got.Steps[0])
	}
}

func TestRecentOrderingAndNotFound(t *testing.T) {
	ctx := context.Background()
	_, open := openTemp(t)
	repo := open()
	svc := operations.NewService(repo, nopPublisher{}, &counterIDs{}, &tickClock{t: time.Now()})
	var last operation.ID
	for i := 0; i < 3; i++ {
		id, err := svc.Run(ctx, operations.Spec{Kind: "noop"}, func(context.Context, *operations.Tracker) error { return nil })
		must(t, err)
		last = id
	}
	recent, err := svc.Recent(ctx, 2)
	must(t, err)
	if len(recent) != 2 || recent[0].ID != last {
		t.Fatalf("recent = %+v", recent)
	}
	if _, err := repo.Get(ctx, "missing"); !errors.Is(err, operations.ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
