// Package bootstrap is the composition root: it is the only place that
// knows every concrete implementation and wires them to core ports.
package bootstrap

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"strconv"

	"modorchestrator/internal/adapters/generic"
	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/application/conflicts"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/operations"
	profilesvc "modorchestrator/internal/core/application/profiles"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/archive"
	"modorchestrator/internal/infrastructure/eventbus"
	"modorchestrator/internal/infrastructure/filesystem"
	"modorchestrator/internal/infrastructure/hashing"
	"modorchestrator/internal/infrastructure/logging"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/stores"
	"modorchestrator/internal/infrastructure/system"
)

// Container holds the wired application services.
type Container struct {
	Paths      appdata.Paths
	Events     *eventbus.Bus
	Operations *operations.Service
	Settings   *appsettings.Service
	Games      *games.Service
	Library    *library.Service
	Profiles   *profilesvc.Service
	Conflicts  *conflicts.Service
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

	// Adapters are compiled in and registered here (D031); the core learns
	// about games only through this registry.
	registry, err := games.NewRegistry(generic.Adapter{}, skyrimse.Adapter{})
	if err != nil {
		unsub()
		return nil, fmt.Errorf("bootstrap: adapters: %w", err)
	}
	fsys := filesystem.New()
	ids, clock := system.IDs{}, system.Clock{}
	// One lock table for every mutating service (D065, INV-OPS-02).
	locks := instancelock.New()
	instances := sqlite.NewGameInstanceRepository(db)
	profiles := sqlite.NewProfileRepository(db)
	appState := sqlite.NewAppState(db)
	gamesSvc := games.NewService(games.Deps{
		Registry:    registry,
		Instances:   instances,
		Profiles:    profiles,
		State:       appState,
		Deployments: sqlite.NewDeploymentState(db),
		FS:          fsys,
		Drives:      fsys,
		Versions:    system.FileVersions{},
		Stores:      &stores.Scanner{FS: fsys, Reg: stores.NewRegistry(), Env: os.Getenv},
		Ops:         ops,
		IDs:         ids,
		Clock:       clock,
		Locks:       locks,
	})
	librarySvc := library.NewService(library.Deps{
		Registry:      registry,
		Instances:     instances,
		Mods:          sqlite.NewModRepository(db),
		Archives:      sqlite.NewArchiveRepository(db),
		Installations: sqlite.NewInstallationRepository(db),
		Categories:    sqlite.NewCategoryRepository(db),
		Profiles:      profiles,
		Rules:         sqlite.NewRuleRepository(db),
		State:         appState,
		Events:        sqlite.NewEventLog(db),
		UoW:           sqlite.NewUnitOfWork(db),
		Publisher:     bus,
		FS:            fsys,
		Extractor:     archive.New(),
		Hasher:        hashing.SHA256{},
		Settings:      settingsSvc,
		Ops:           ops,
		Locks:         locks,
		IDs:           ids,
		Clock:         clock,
	})

	profilesSvc := profilesvc.NewService(profilesvc.Deps{
		Instances: instances,
		Profiles:  profiles,
		Rules:     sqlite.NewRuleRepository(db),
		Mods:      sqlite.NewModRepository(db),
		Events:    sqlite.NewEventLog(db),
		UoW:       sqlite.NewUnitOfWork(db),
		Publisher: bus,
		Settings:  settingsSvc,
		Locks:     locks,
		IDs:       ids,
		Clock:     clock,
	})

	conflictsSvc := conflicts.NewService(conflicts.Deps{
		Instances:     instances,
		Mods:          sqlite.NewModRepository(db),
		Installations: sqlite.NewInstallationRepository(db),
		Profiles:      profiles,
		Rules:         sqlite.NewRuleRepository(db),
		Overrides:     sqlite.NewOverrideRepository(db),
		UoW:           sqlite.NewUnitOfWork(db),
		Publisher:     bus,
		FS:            fsys,
		Hasher:        hashing.SHA256{},
		Settings:      settingsSvc,
		OrderRules:    profilesSvc,
		IDs:           ids,
		Clock:         clock,
	})

	interrupted, err := ops.RecoverInterrupted(ctx)
	if err != nil {
		unsub()
		return nil, fmt.Errorf("bootstrap: recover interrupted operations: %w", err)
	}
	// The library is brought back to committed state before any command
	// (core/02 §3 "Retomada", D064). A failure is logged, not fatal: the
	// leftovers stay where they are and nothing is lost.
	if err := librarySvc.Recover(ctx); err != nil {
		logger.Error("library recovery", logging.KeyError, err.Error())
	}
	logger.Info("startup", "dataDir", paths.Root, "schemaVersion", version, "interruptedOperations", len(interrupted))

	return &Container{
		Paths:          paths,
		Events:         bus,
		Operations:     ops,
		Settings:       settingsSvc,
		Games:          gamesSvc,
		Library:        librarySvc,
		Profiles:       profilesSvc,
		Conflicts:      conflictsSvc,
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

// OpenFolder shows a folder in the file manager. Callers pass only paths
// the application resolved itself (an instance's own folders).
func (c *Container) OpenFolder(path string) error { return system.OpenFolder(path) }
