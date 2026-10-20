//go:build windows

package system

import (
	"fmt"
	"os"
	"testing"

	"golang.org/x/sys/windows"
)

func TestInstanceRunningProbesWithoutTakingTheLock(t *testing.T) {
	name := fmt.Sprintf("modorchestrator-test-%d-sim", os.Getpid())
	if InstanceRunning(name) {
		t.Fatal("no process holds the lock yet")
	}
	// The probe must not create the mutex: the first process creates it.
	if InstanceRunning(name) {
		t.Fatal("the probe created the mutex")
	}
	h, err := windows.CreateMutex(nil, false, windows.StringToUTF16Ptr(name))
	if err != nil {
		t.Fatal(err)
	}
	if !InstanceRunning(name) {
		t.Fatal("the held lock was not found")
	}
	windows.CloseHandle(h)
	if InstanceRunning(name) {
		t.Fatal("a released lock is still reported")
	}
}
