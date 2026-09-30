package diagnostic

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

var (
	modA = event.EntityRef{Kind: "mod", ID: "a"}
	modB = event.EntityRef{Kind: "mod", ID: "b"}
)

func cycleSpec() Spec {
	return Spec{
		Code: CodeRuleCycle, Severity: SeverityError, Params: Params{"count": "2"},
		Evidence: []Evidence{{Kind: "rule", Ref: &event.EntityRef{Kind: "rule", ID: "r1"}}},
		Actions:  []Action{{ID: "open_cycle", Target: &modA}},
		Blocks:   []operation.Kind{"deploy"},
		Related:  []event.EntityRef{modB, modA},
	}
}

func TestBlockingIsPerOperation(t *testing.T) {
	d, err := New(cycleSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !d.IsBlocking() || !d.BlocksOperation("deploy") || d.BlocksOperation("import") {
		t.Fatal("a cycle blocks deploy but not import")
	}
	if got := Blocking([]Diagnostic{d}, "deploy"); len(got) != 1 {
		t.Fatalf("Blocking(deploy) = %v", got)
	}
}

func TestKeyIsStableAcrossRecomputation(t *testing.T) {
	a, _ := New(cycleSpec())
	s := cycleSpec()
	s.Related = []event.EntityRef{modA, modB, modA}
	s.Params = Params{"count": "3"}
	b, _ := New(s)
	if a.Key != b.Key {
		t.Fatal("same problem about the same entities must keep its key")
	}
	if NewKey(CodeRuleCycle, modA) == a.Key || NewKey("other", modA, modB) == a.Key {
		t.Fatal("different entities or codes must have different keys")
	}
}

func TestInvariants(t *testing.T) {
	cases := map[string]func(*Spec){
		"no evidence":       func(s *Spec) { s.Evidence = nil },
		"error without act": func(s *Spec) { s.Actions = nil },
		"warning blocks":    func(s *Spec) { s.Severity = SeverityWarning },
		"unknown severity":  func(s *Spec) { s.Severity = "fatal" },
		"no code":           func(s *Spec) { s.Code = "" },
		"action without id": func(s *Spec) { s.Actions = []Action{{}} },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s := cycleSpec()
			mutate(&s)
			if _, err := New(s); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
	info := Spec{Code: CodeConflictsUnreviewed, Severity: SeverityInfo, Evidence: []Evidence{{Kind: "pairs", Params: Params{"count": "3"}}}}
	if _, err := New(info); err != nil {
		t.Fatalf("non-blocking info needs no action: %v", err)
	}
}

func TestSuppressionNeverHidesBlocking(t *testing.T) {
	blocking, _ := New(cycleSpec())
	info, _ := New(Spec{Code: CodeConflictsUnreviewed, Severity: SeverityInfo, Evidence: []Evidence{{Kind: "pairs"}}})
	byCode, err := NewSuppression("", CodeConflictsUnreviewed, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	byKey, _ := NewSuppression(blocking.Key, "", time.Time{})
	got := Visible([]Diagnostic{blocking, info}, []Suppression{byCode, byKey})
	if len(got) != 1 || got[0].Code != CodeRuleCycle {
		t.Fatalf("visible = %v", got)
	}
	if _, err := NewSuppression("k", "c", time.Time{}); !errors.Is(err, ErrInvalid) {
		t.Fatal("suppression targets a key or a code, not both")
	}
}
