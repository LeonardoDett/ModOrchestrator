package operation

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/event"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func newOp(t *testing.T, steps ...string) *Operation {
	t.Helper()
	op, err := New("op-1", "test", event.EntityRef{Kind: "game", ID: "g1"}, steps, t0)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return op
}

func eventTypes(evs []event.Event) []event.Type {
	out := make([]event.Type, len(evs))
	for i, e := range evs {
		out[i] = e.Type
	}
	return out
}

func TestNewValidatesSpec(t *testing.T) {
	cases := map[string]struct {
		id    ID
		kind  Kind
		steps []string
	}{
		"empty id":       {"", "k", nil},
		"empty kind":     {"id", "", nil},
		"empty step":     {"id", "k", []string{""}},
		"duplicate step": {"id", "k", []string{"a", "a"}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := New(c.id, c.kind, event.EntityRef{}, c.steps, t0); !errors.Is(err, ErrInvalidSpec) {
				t.Fatalf("expected ErrInvalidSpec, got %v", err)
			}
		})
	}
}

func TestHappyPathRecordsEveryTransition(t *testing.T) {
	op := newOp(t, "plan", "apply")
	steps := []func() error{
		func() error { return op.Start(t0) },
		func() error { return op.BeginStep("plan", t0) },
		func() error { return op.ReportProgress(Progress{Current: 1, Total: 2}, t0) },
		func() error { return op.CompleteStep("plan", t0) },
		func() error { return op.SkipStep("apply", t0) },
		func() error { return op.Succeed(t0) },
	}
	for i, s := range steps {
		if err := s(); err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
	}
	got := eventTypes(op.PullEvents())
	want := []event.Type{EventCreated, EventStarted, EventStepStarted, EventProgress, EventStepCompleted, EventStepSkipped, EventSucceeded}
	if len(got) != len(want) {
		t.Fatalf("events = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("events = %v, want %v", got, want)
		}
	}
	if len(op.PullEvents()) != 0 {
		t.Fatal("PullEvents must clear pending events")
	}
	if op.Status != StatusSucceeded || op.FinishedAt == nil {
		t.Fatalf("unexpected final state %+v", op)
	}
}

func TestCannotSucceedWithUnfinishedSteps(t *testing.T) {
	op := newOp(t, "plan", "apply")
	_ = op.Start(t0)
	_ = op.BeginStep("plan", t0)
	_ = op.CompleteStep("plan", t0)
	if err := op.Succeed(t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
}

func TestOnlyOneStepRunsAtATime(t *testing.T) {
	op := newOp(t, "a", "b")
	_ = op.Start(t0)
	_ = op.BeginStep("a", t0)
	if err := op.BeginStep("b", t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
	if err := op.BeginStep("missing", t0); err == nil {
		t.Fatal("expected error for unknown step")
	}
}

func TestFailAttributesRunningStep(t *testing.T) {
	op := newOp(t, "extract")
	_ = op.Start(t0)
	_ = op.BeginStep("extract", t0)
	if err := op.Fail(Error{Message: "boom"}, t0); err != nil {
		t.Fatal(err)
	}
	if op.Error == nil || op.Error.Step != "extract" || op.Error.Code != "unknown" {
		t.Fatalf("unexpected error %+v", op.Error)
	}
	if op.Steps[0].Status != StepFailed {
		t.Fatalf("step status = %s", op.Steps[0].Status)
	}
	if err := op.Cancel(t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("terminal operation must not transition again")
	}
}

func TestInterruptedKeepsStopPoint(t *testing.T) {
	op := newOp(t, "apply")
	_ = op.Start(t0)
	_ = op.BeginStep("apply", t0)
	if err := op.MarkInterrupted(t0); err != nil {
		t.Fatal(err)
	}
	if op.Status != StatusInterrupted || op.CurrentStep != "apply" {
		t.Fatalf("interruption must keep the running step, got %+v", op)
	}
	if !op.Status.IsTerminal() {
		t.Fatal("interrupted must be terminal for the process that observed it")
	}
}

func TestProgressValidation(t *testing.T) {
	op := newOp(t)
	if err := op.ReportProgress(Progress{}, t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("progress on pending operation must fail")
	}
	_ = op.Start(t0)
	if err := op.ReportProgress(Progress{Current: 3, Total: 2}, t0); !errors.Is(err, ErrInvalidSpec) {
		t.Fatal("progress beyond total must fail")
	}
	if err := op.ReportProgress(Progress{Current: 5}, t0); err != nil {
		t.Fatalf("indeterminate progress must be accepted: %v", err)
	}
}
