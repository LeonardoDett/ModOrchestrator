package bridge

import (
	"context"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/options"
)

func TestSecondLaunchBringsTheWindowToTheFront(t *testing.T) {
	raised := 0
	a := &App{front: func(context.Context) { raised++ }}
	lock := SingleInstance(a)
	if lock.UniqueId != InstanceID || InstanceMutex != "wails-app-"+InstanceID+"sim" {
		t.Fatalf("lock %q, mutex %q", lock.UniqueId, InstanceMutex)
	}
	// Before the window is ready there is nothing to raise.
	lock.OnSecondInstanceLaunch(options.SecondInstanceData{Args: []string{"x"}})
	if raised != 0 {
		t.Fatalf("raised %d times before startup", raised)
	}
	a.ctx = context.Background()
	lock.OnSecondInstanceLaunch(options.SecondInstanceData{})
	if raised != 1 {
		t.Fatalf("raised %d times, want 1", raised)
	}
}

func TestRecoveryWindowKeepsTheLock(t *testing.T) {
	a := NewRecoveryApp(nil)
	if a.front == nil || SingleInstance(a).OnSecondInstanceLaunch == nil {
		t.Fatal("the recovery window must answer a second launch")
	}
}

func TestHandOverProcessShowsNothing(t *testing.T) {
	if lock := SingleInstance(nil); lock.OnSecondInstanceLaunch != nil || lock.UniqueId != InstanceID {
		t.Fatalf("hand-over lock = %+v", lock)
	}
}
