// Package bridge is the UI transport layer: it exposes queries/commands to
// the Wails frontend and forwards committed events. It holds no business
// rules and is the only core-facing package that imports the Wails runtime.
package bridge

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/bootstrap"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/operation"
)

// EventOperation is the frontend channel carrying operation events.
const EventOperation = "operation:event"

// Version is overridden at build time via -ldflags.
var Version = "0.0.0-dev"

// App is bound to the Wails frontend.
type App struct {
	ctx         context.Context
	c           *bootstrap.Container
	unsubscribe func()
	emit        func(ctx context.Context, name string, data ...any)
}

// NewApp creates the binding over a wired container.
func NewApp(c *bootstrap.Container) *App {
	return &App{c: c, emit: runtime.EventsEmit}
}

// Startup is called by Wails when the window is ready.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.unsubscribe = a.c.Events.Subscribe(func(e event.Event) {
		if e.OperationID != "" {
			a.emit(a.ctx, EventOperation, toEventDTO(e))
		}
	})
}

// Shutdown is called by Wails before the process exits.
func (a *App) Shutdown(context.Context) {
	if a.unsubscribe != nil {
		a.unsubscribe()
	}
}

// GetAppInfo returns static application facts for the shell.
func (a *App) GetAppInfo() AppInfo {
	return AppInfo{
		Name:                  "Mod Orchestrator",
		Version:               Version,
		DataDir:               a.c.Paths.Root,
		SchemaVersion:         a.c.SchemaVersion,
		InterruptedOperations: len(a.c.Interrupted),
	}
}

// ListRecentOperations returns the newest operations first.
func (a *App) ListRecentOperations(limit int) ([]OperationDTO, error) {
	ops, err := a.c.Operations.Recent(a.context(), limit)
	if err != nil {
		return nil, err
	}
	out := make([]OperationDTO, len(ops))
	for i, op := range ops {
		out[i] = toOperationDTO(op)
	}
	return out, nil
}

// GetOperationEvents returns the event history of one operation.
func (a *App) GetOperationEvents(id string) ([]EventDTO, error) {
	evs, err := a.c.Operations.Events(a.context(), operation.ID(id))
	if err != nil {
		return nil, err
	}
	out := make([]EventDTO, len(evs))
	for i, e := range evs {
		out[i] = toEventDTO(e)
	}
	return out, nil
}

func (a *App) context() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
