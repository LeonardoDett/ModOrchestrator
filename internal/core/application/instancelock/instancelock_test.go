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
