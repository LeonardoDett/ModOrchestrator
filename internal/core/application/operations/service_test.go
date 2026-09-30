package operations

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

type memRepo struct {
	mu     sync.Mutex
	ops    map[operation.ID]operation.Operation
	events []event.Event
	fail   bool
}

func newMemRepo() *memRepo { return &memRepo{ops: map[operation.ID]operation.Operation{}} }

func (r *memRepo) Save(_ context.Context, op *operation.Operation, evs []event.Event) ([]event.Event, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.fail {
		return nil, errors.New("disk full")
	}
	r.ops[op.ID] = *op
	out := make([]event.Event, len(evs))
	for i, e := range evs {
		e.Sequence = int64(len(r.events) + 1)
		r.events = append(r.events, e)
		out[i] = e
	}
	return out, nil
}

func (r *memRepo) Get(_ context.Context, id operation.ID) (*operation.Operation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	op, ok := r.ops[id]
	if !ok {
		return nil, ErrNotFound
	}
	return &op, nil
}

func (r *memRepo) ListRecent(_ context.Context, limit int) ([]*operation.Operation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []*operation.Operation
	for _, op := range r.ops {
		op := op
		out = append(out, &op)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (r *memRepo) ListByStatus(_ context.Context, statuses ...operation.Status) ([]*operation.Operation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []*operation.Operation
	for _, op := range r.ops {
		for _, s := range statuses {
			if op.Status == s {
				op := op
				out = append(out, &op)
			}
		}
	}
	return out, nil
}

func (r *memRepo) Events(_ context.Context, id operation.ID) ([]event.Event, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []event.Event
	for _, e := range r.events {
		if e.OperationID == string(id) {
			out = append(out, e)
		}
	}
	return out, nil
}

type recPublisher struct {
	mu     sync.Mutex
	events []event.Event
}

func (p *recPublisher) Publish(evs ...event.Event) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, evs...)
}

type seqIDs struct{ n int }

func (g *seqIDs) NewID() string { g.n++; return fmt.Sprintf("id-%03d", g.n) }

type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

func newService() (*Service, *memRepo, *recPublisher) {
	repo, pub := newMemRepo(), &recPublisher{}
	return NewService(repo, pub, &seqIDs{}, fixedClock{time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}), repo, pub
}

func TestRunSuccessPersistsAndPublishes(t *testing.T) {
	svc, repo, pub := newService()
	ctx := context.Background()
	id, err := svc.Run(ctx, Spec{Kind: "scan", Steps: []string{"walk"}}, func(ctx context.Context, tr *Tracker) error {
		if err := tr.BeginStep(ctx, "walk"); err != nil {
			return err
		}
		if err := tr.Progress(ctx, 1, 1); err != nil {
			return err
		}
		return tr.CompleteStep(ctx, "walk")
	})
	if err != nil {
		t.Fatal(err)
	}
	op, err := svc.Get(ctx, id)
	if err != nil || op.Status != operation.StatusSucceeded {
		t.Fatalf("op = %+v, err = %v", op, err)
	}
	if len(pub.events) != len(repo.events) || len(pub.events) != 6 {
		t.Fatalf("published %d, stored %d events", len(pub.events), len(repo.events))
	}
	for _, e := range pub.events {
		if e.ID == "" || e.Sequence == 0 {
			t.Fatalf("published event without id/sequence: %+v", e)
		}
	}
}

func TestRunFailureKeepsStructuredError(t *testing.T) {
	svc, _, _ := newService()
	ctx := context.Background()
	id, err := svc.Run(ctx, Spec{Kind: "scan", Steps: []string{"walk"}}, func(ctx context.Context, tr *Tracker) error {
		_ = tr.BeginStep(ctx, "walk")
		return &operation.Error{Code: "access_denied", Message: "no permission"}
	})
	if err == nil {
		t.Fatal("expected run error")
	}
	op, _ := svc.Get(ctx, id)
	if op.Status != operation.StatusFailed || op.Error.Code != "access_denied" || op.Error.Step != "walk" {
		t.Fatalf("unexpected op %+v / %+v", op, op.Error)
	}
}

func TestRunCancellation(t *testing.T) {
	svc, _, _ := newService()
	ctx, cancel := context.WithCancel(context.Background())
	id, err := svc.Run(ctx, Spec{Kind: "scan"}, func(ctx context.Context, _ *Tracker) error {
		cancel()
		return ctx.Err()
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
	op, _ := svc.Get(context.Background(), id)
	if op.Status != operation.StatusCancelled {
		t.Fatalf("status = %s", op.Status)
	}
}

func TestRecoverInterrupted(t *testing.T) {
	svc, _, pub := newService()
	ctx := context.Background()
	tr, err := svc.Start(ctx, Spec{Kind: "deploy", Steps: []string{"apply"}})
	if err != nil {
		t.Fatal(err)
	}
	_ = tr.BeginStep(ctx, "apply")

	recovered, err := svc.RecoverInterrupted(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(recovered) != 1 || recovered[0].Status != operation.StatusInterrupted || recovered[0].CurrentStep != "apply" {
		t.Fatalf("recovered = %+v", recovered)
	}
	if last := pub.events[len(pub.events)-1]; last.Type != operation.EventInterrupted {
		t.Fatalf("last event = %s", last.Type)
	}
}

func TestPersistenceFailureIsReported(t *testing.T) {
	svc, repo, pub := newService()
	repo.fail = true
	if _, err := svc.Start(context.Background(), Spec{Kind: "scan"}); err == nil {
		t.Fatal("expected persistence error")
	}
	if len(pub.events) != 0 {
		t.Fatal("events must not be published when persistence fails")
	}
}

func TestRecentValidatesLimit(t *testing.T) {
	svc, _, _ := newService()
	if _, err := svc.Recent(context.Background(), 0); err == nil {
		t.Fatal("expected limit error")
	}
}
