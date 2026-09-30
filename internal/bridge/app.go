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
	"modorchestrator/internal/infrastructure/logging"
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
	// The quick search reads launchers and the registry only; it runs off
	// the UI path so the window never waits for it (core/11 §3). Nothing is
	// managed by it.
	go func() {
		if n, err := a.c.Games.ScanQuick(context.Background()); err != nil {
			a.c.Logger.Warn("quick game search failed", logging.KeyError, err.Error())
		} else {
			a.c.Logger.Info("quick game search", "found", n)
		}
	}()
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
		LogsDir:               a.c.Paths.Logs,
		CustomTitleBar:        a.c.CustomTitleBar,
	}
}

// ListRecentOperations returns the newest operations first.
func (a *App) ListRecentOperations(limit int) ([]OperationDTO, error) {
	ops, err := a.c.Operations.Recent(a.context(), limit)
	if err != nil {
		return nil, a.fail("list operations", err, nil)
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
		return nil, a.fail("operation events", err, map[string]string{"operation": id})
	}
	out := make([]EventDTO, len(evs))
	for i, e := range evs {
		out[i] = toEventDTO(e)
	}
	return out, nil
}

// ListAppSettings returns every available app-scoped setting with its
// effective value (core/13).
func (a *App) ListAppSettings() ([]SettingDTO, error) {
	all, err := a.c.Settings.App(a.context())
	if err != nil {
		return nil, a.fail("list settings", err, nil)
	}
	out := make([]SettingDTO, len(all))
	for i, e := range all {
		out[i] = toSettingDTO(e)
	}
	return out, nil
}

// SetAppSetting stores an app-scoped value; the UI rereads the settings.
func (a *App) SetAppSetting(key, value string) error {
	if err := a.c.Settings.SetApp(a.context(), key, value); err != nil {
		return a.fail("set setting", err, map[string]string{"key": key, "value": value})
	}
	a.c.Logger.Info("setting changed", "key", key, "value", value)
	return nil
}

// ResetAppSetting restores the default of an app-scoped setting.
func (a *App) ResetAppSetting(key string) error {
	if err := a.c.Settings.ResetApp(a.context(), key); err != nil {
		return a.fail("reset setting", err, map[string]string{"key": key})
	}
	a.c.Logger.Info("setting reset", "key", key)
	return nil
}

// LogTail returns the newest technical log entries matching the filter.
func (a *App) LogTail(filter LogFilterDTO) ([]LogEntryDTO, error) {
	entries, err := logging.Tail(a.c.Paths.Logs, logging.Filter{
		Levels: filter.Levels, Operation: filter.Operation, Text: filter.Text, Limit: filter.Limit,
	})
	if err != nil {
		return nil, a.fail("read log", err, nil)
	}
	out := make([]LogEntryDTO, len(entries))
	for i, e := range entries {
		out[i] = toLogEntryDTO(e)
	}
	return out, nil
}

// OpenLogFolder shows the technical log folder in the file manager.
func (a *App) OpenLogFolder() error {
	if err := a.c.OpenLogFolder(); err != nil {
		return a.fail("open log folder", err, nil)
	}
	return nil
}

// fail logs a failed call and converts it to a coded error for the UI.
func (a *App) fail(call string, err error, params map[string]string) error {
	ui := uiError(err, params)
	a.c.Logger.Warn("bridge call failed", "call", call, logging.KeyError, err.Error())
	return ui
}

func (a *App) context() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
