package operations

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

// Spec describes an operation to start.
type Spec struct {
	Kind    operation.Kind
	Subject event.EntityRef
	Steps   []string
}

// Service creates, advances and queries operations.
type Service struct {
	repo  Repository
	pub   Publisher
	ids   IDGenerator
	clock Clock
}

// NewService wires the service to its ports.
func NewService(repo Repository, pub Publisher, ids IDGenerator, clock Clock) *Service {
	return &Service{repo: repo, pub: pub, ids: ids, clock: clock}
}

// Start creates and starts an operation, returning a tracker to drive it.
func (s *Service) Start(ctx context.Context, spec Spec) (*Tracker, error) {
	now := s.clock.Now()
	op, err := operation.New(operation.ID(s.ids.NewID()), spec.Kind, spec.Subject, spec.Steps, now)
	if err != nil {
		return nil, err
	}
	if err := op.Start(now); err != nil {
		return nil, err
	}
	if err := s.commit(ctx, op); err != nil {
		return nil, err
	}
	return &Tracker{svc: s, op: op}, nil
}

// Run starts an operation and executes fn. A nil return succeeds the
// operation; an error fails it with a structured error (an *operation.Error
// is kept as is). Context cancellation cancels the operation.
func (s *Service) Run(ctx context.Context, spec Spec, fn func(ctx context.Context, t *Tracker) error) (operation.ID, error) {
	t, err := s.Start(ctx, spec)
	if err != nil {
		return "", err
	}
	runErr := fn(ctx, t)
	// Finalization must be persisted even if the caller's context is done.
	finalCtx := context.WithoutCancel(ctx)
	switch {
	case runErr == nil:
		return t.ID(), t.Succeed(finalCtx)
	case errors.Is(runErr, context.Canceled):
		if err := t.Cancel(finalCtx); err != nil {
			return t.ID(), errors.Join(runErr, err)
		}
		return t.ID(), runErr
	default:
		var opErr *operation.Error
		if !errors.As(runErr, &opErr) {
			opErr = &operation.Error{Code: "internal", Message: runErr.Error()}
		}
		if err := t.Fail(finalCtx, *opErr); err != nil {
			return t.ID(), errors.Join(runErr, err)
		}
		return t.ID(), runErr
	}
}

// RecoverInterrupted marks every operation left pending/running by a
// previous process as interrupted, so it is surfaced instead of silently
// looking alive. It returns the affected operations.
func (s *Service) RecoverInterrupted(ctx context.Context) ([]*operation.Operation, error) {
	stale, err := s.repo.ListByStatus(ctx, operation.StatusPending, operation.StatusRunning)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	for _, op := range stale {
		if err := op.MarkInterrupted(now); err != nil {
			return nil, err
		}
		if err := s.commit(ctx, op); err != nil {
			return nil, err
		}
	}
	return stale, nil
}

// Get returns one operation.
func (s *Service) Get(ctx context.Context, id operation.ID) (*operation.Operation, error) {
	return s.repo.Get(ctx, id)
}

// Recent returns the most recently created operations.
func (s *Service) Recent(ctx context.Context, limit int) ([]*operation.Operation, error) {
	if limit <= 0 || limit > 500 {
		return nil, fmt.Errorf("operations: limit must be between 1 and 500, got %d", limit)
	}
	return s.repo.ListRecent(ctx, limit)
}

// Events returns the persisted event history of an operation.
func (s *Service) Events(ctx context.Context, id operation.ID) ([]event.Event, error) {
	return s.repo.Events(ctx, id)
}

func (s *Service) commit(ctx context.Context, op *operation.Operation) error {
	events := op.PullEvents()
	for i := range events {
		events[i].ID = s.ids.NewID()
	}
	stored, err := s.repo.Save(ctx, op, events)
	if err != nil {
		return fmt.Errorf("operations: persist %s: %w", op.ID, err)
	}
	s.pub.Publish(stored...)
	return nil
}

// Tracker drives one running operation. It is safe for concurrent use.
type Tracker struct {
	mu  sync.Mutex
	svc *Service
	op  *operation.Operation
}

// ID returns the operation identifier.
func (t *Tracker) ID() operation.ID { return t.op.ID }

// BeginStep starts a declared step.
func (t *Tracker) BeginStep(ctx context.Context, name string) error {
	return t.apply(ctx, func(op *operation.Operation) error { return op.BeginStep(name, t.svc.clock.Now()) })
}

// CompleteStep finishes the running step.
func (t *Tracker) CompleteStep(ctx context.Context, name string) error {
	return t.apply(ctx, func(op *operation.Operation) error { return op.CompleteStep(name, t.svc.clock.Now()) })
}

// SkipStep marks a pending step as not executed.
func (t *Tracker) SkipStep(ctx context.Context, name string) error {
	return t.apply(ctx, func(op *operation.Operation) error { return op.SkipStep(name, t.svc.clock.Now()) })
}

// Progress reports progress of the running step.
func (t *Tracker) Progress(ctx context.Context, current, total int64) error {
	return t.apply(ctx, func(op *operation.Operation) error {
		return op.ReportProgress(operation.Progress{Current: current, Total: total}, t.svc.clock.Now())
	})
}

// Succeed finishes the operation successfully.
func (t *Tracker) Succeed(ctx context.Context) error {
	return t.apply(ctx, func(op *operation.Operation) error { return op.Succeed(t.svc.clock.Now()) })
}

// Fail finishes the operation with a structured error.
func (t *Tracker) Fail(ctx context.Context, cause operation.Error) error {
	return t.apply(ctx, func(op *operation.Operation) error { return op.Fail(cause, t.svc.clock.Now()) })
}

// Cancel finishes the operation as cancelled.
func (t *Tracker) Cancel(ctx context.Context) error {
	return t.apply(ctx, func(op *operation.Operation) error { return op.Cancel(t.svc.clock.Now()) })
}

func (t *Tracker) apply(ctx context.Context, mutate func(*operation.Operation) error) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if err := mutate(t.op); err != nil {
		return err
	}
	return t.svc.commit(ctx, t.op)
}
