// Package bootstrap is the composition root: it is the only place that
// knows every concrete implementation and wires them to core ports.
package bootstrap

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strconv"

	"modorchestrator/internal/core/application/operations"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/eventbus"
	"modorchestrator/internal/infrastructure/logging"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

// Container holds the wired application services.
type Container struct {
	Paths      appdata.Paths
	Events     *eventbus.Bus
	Operations *operations.Service
	Settings   *appsettings.Service
	Logger     *slog.Logger
	// Interrupted lists operations a previous process left unfinished.
	Interrupted   []*operation.Operation
	SchemaVersion int
	// CustomTitleBar is ui.customTitleBar as read at startup: the setting
	// requires a restart, so this is what the running window uses.
	CustomTitleBar bool

	db      *sql.DB
	logFile *logging.RotatingFile
	unsub   func()
}

// New resolves paths, opens and migrates the database, wires services and
// recovers operations interrupted by a previous run.
func New(ctx context.Context) (c *Container, err error) {
	paths, err := appdata.Resolve()
	if err != nil {
		return nil, err
	}
	logFile, err := logging.OpenRotating(paths.Logs, logging.DefaultMaxBytes, logging.DefaultMaxFiles)
	if err != nil {
		return nil, err
	}
	var level slog.LevelVar
	logger := logging.NewLogger(logFile, &level)

	db, err := sqlite.Open(ctx, paths.Database)
	if err != nil {
		logger.Error("open database", logging.KeyError, err.Error())
		logFile.Close()
		return nil, err
	}
	defer func() {
		if err != nil {
			db.Close()
			logFile.Close()
		}
	}()
	version, err := sqlite.SchemaVersion(ctx, db)
	if err != nil {
		return nil, err
	}

	settingsSvc := appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1)
	if lv, err := settingsSvc.AppValue(ctx, "app.logLevel"); err == nil {
		level.Set(logging.ParseLevel(lv.Value))
	}
	customTitleBar := true
	if v, err := settingsSvc.AppValue(ctx, "ui.customTitleBar"); err == nil {
		customTitleBar, _ = strconv.ParseBool(v.Value)
	}

	bus := eventbus.New()
	unsub := bus.Subscribe(logging.OperationEvents(logger))
	ops := operations.NewService(sqlite.NewOperationRepository(db), bus, system.IDs{}, system.Clock{})

	interrupted, err := ops.RecoverInterrupted(ctx)
	if err != nil {
		unsub()
		return nil, fmt.Errorf("bootstrap: recover interrupted operations: %w", err)
	}
	logger.Info("startup", "dataDir", paths.Root, "schemaVersion", version, "interruptedOperations", len(interrupted))

	return &Container{
		Paths:          paths,
		Events:         bus,
		Operations:     ops,
		Settings:       settingsSvc,
		Logger:         logger,
		Interrupted:    interrupted,
		SchemaVersion:  version,
		CustomTitleBar: customTitleBar,
		db:             db,
		logFile:        logFile,
		unsub:          unsub,
	}, nil
}

// OpenLogFolder shows the technical log folder in the file manager.
func (c *Container) OpenLogFolder() error { return system.OpenFolder(c.Paths.Logs) }

// Close releases resources.
func (c *Container) Close() error {
	c.unsub()
	c.Logger.Info("shutdown")
	err := c.db.Close()
	if lerr := c.logFile.Close(); err == nil {
		err = lerr
	}
	return err
}
