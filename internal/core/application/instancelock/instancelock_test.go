package instancelock

import (
	"errors"
	"testing"
)

// INV-OPS-02: at most one mutating operation per instance.
func TestSecondAcquireIsRefusedUntilRelease(t *testing.T) {
	l := New()
	release, err := l.Acquire("i1", "import")
	if err != nil {
		t.Fatal(err)
	}
	var busy *BusyError
	if _, err := l.Acquire("i1", "deploy"); !errors.As(err, &busy) || busy.Holder != "import" || busy.Code() != CodeBusy {
		t.Fatalf("second acquire = %v", err)
	}
	if _, err := l.Acquire("i2", "deploy"); err != nil {
		t.Fatal("other instances are independent")
	}
	release()
	release() // idempotent
	if _, err := l.Acquire("i1", "deploy"); err != nil {
		t.Fatalf("after release: %v", err)
	}
}

// The app update never runs with an operation in progress, and no operation
// starts while it runs (plano-de-publicacao.md, etapa 6).
func TestFreezeExcludesEveryOperation(t *testing.T) {
	l := New()
	release, err := l.Acquire("i1", "deploy")
	if err != nil {
		t.Fatal(err)
	}
	var busy *BusyError
	if _, err := l.Freeze("app_update"); !errors.As(err, &busy) || busy.Holder != "deploy" {
		t.Fatalf("freeze with a running deploy = %v", err)
	}
	release()
	unfreeze, err := l.Freeze("app_update")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := l.Acquire("i2", "import"); !errors.As(err, &busy) || busy.Holder != "app_update" {
		t.Fatalf("acquire while frozen = %v", err)
	}
	if _, err := l.Freeze("app_update"); err == nil {
		t.Fatal("second freeze must be refused")
	}
	unfreeze()
	unfreeze()
	if _, err := l.Acquire("i2", "import"); err != nil {
		t.Fatalf("after unfreeze: %v", err)
	}
}
