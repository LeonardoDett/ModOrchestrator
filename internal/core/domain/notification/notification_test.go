package notification

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
)

var t0 = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func TestLifecycle(t *testing.T) {
	n, err := New("n1", KindDiagnostic, "rule_cycle#abc", string(diagnostic.CodeRuleCycle), nil, event.EntityRef{Kind: "profile", ID: "p1"}, t0)
	if err != nil {
		t.Fatal(err)
	}
	if err := n.MarkRead(t0); err != nil {
		t.Fatal(err)
	}
	if err := n.MarkRead(t0); !errors.Is(err, ErrInvalidTransition) {
		t.Fatal("read twice must fail")
	}
	n.Aggregate(t0)
	if n.State != StateUnread || n.Count != 2 {
		t.Fatalf("aggregation makes it unread again: %+v", n)
	}
	n.Dismiss(t0)
	if n.State != StateDismissed {
		t.Fatalf("state = %s", n.State)
	}
}

func TestValidation(t *testing.T) {
	if _, err := New("n", KindInfo, "", "c", nil, event.EntityRef{}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("notification without ref must be rejected")
	}
	if _, err := New("n", "toast", "r", "c", nil, event.EntityRef{}, t0); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown kind must be rejected")
	}
}
