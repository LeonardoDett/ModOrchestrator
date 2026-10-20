package bridge

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/bootstrap"
)

// InstanceID names the single instance lock of the app (D141). It never
// changes between versions: an old and a new build must find each other.
const InstanceID = "modorchestrator-6f1d2a7c-3b0e-4e57-9a5d-2c8f0b41e9d3"

// InstanceMutex is the name of the mutex Wails creates for InstanceID on
// Windows (v2 single_instance.go: "wails-app-" + id + "sim").
const InstanceMutex = "wails-app-" + InstanceID + "sim"

// SingleInstance is the lock of the window: the first process holds it and
// a second launch hands its arguments to the first one and exits (D141).
// The arguments are ignored for now: nothing opens a file or a link yet.
// A nil app (the process that only hands over) shows nothing.
func SingleInstance(a *App) *options.SingleInstanceLock {
	lock := &options.SingleInstanceLock{UniqueId: InstanceID}
	if a != nil {
		lock.OnSecondInstanceLaunch = a.secondInstance
	}
	return lock
}

// InstanceRunning reports whether a process of the app already holds the
// lock, asked before the database is opened.
func InstanceRunning() bool { return bootstrap.InstanceRunning(InstanceMutex) }

// QuitAtOnce closes a window that opened only to hand over and found no
// first window to hand over to.
func QuitAtOnce(ctx context.Context) { runtime.Quit(ctx) }

// secondInstance brings the window of this process to the front. Before
// the window is ready there is nothing to show; the launch that is running
// opens it anyway.
func (a *App) secondInstance(options.SecondInstanceData) {
	if a.ctx == nil {
		return
	}
	a.front(a.ctx)
}

// bringToFront restores and shows the window and raises it above the others
// (the always-on-top toggle makes Windows reorder it without stealing the
// keyboard from a dialog of the app).
func bringToFront(ctx context.Context) {
	runtime.WindowUnminimise(ctx)
	runtime.WindowShow(ctx)
	runtime.WindowSetAlwaysOnTop(ctx, true)
	runtime.WindowSetAlwaysOnTop(ctx, false)
}
