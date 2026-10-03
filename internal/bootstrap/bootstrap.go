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
	"time"

	"modorchestrator/internal/adapters/generic"
	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/application/backups"
	"modorchestrator/internal/core/application/conflicts"
	"modorchestrator/internal/core/application/deployment"
	"modorchestrator/internal/core/application/diagnostics"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/history"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/launch"
	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/overview"
	"modorchestrator/internal/core/application/plugins"
	profilesvc "modorchestrator/internal/core/application/profiles"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/settings"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/archive"
	"modorchestrator/internal/infrastructure/eventbus"
	"modorchestrator/internal/infrastructure/filesystem"
	"modorchestrator/internal/infrastructure/hashing"
	"modorchestrator/internal/infrastructure/logging"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/plugincache"
	"modorchestrator/internal/infrastructure/stores"
	"modorchestrator/internal/infrastructure/supportbundle"
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
	Deployment *deployment.Service
	AutoDeploy *deployment.AutoDeployer
	// Plugins owns the plugin inventory and the load order (core/08).
	Plugins *plugins.Service
	// Diagnostics gathers health checks, suppressions and notifications;
	// History is the projection of events with reversal (core/10).
	Diagnostics *diagnostics.Service
	History     *history.Service
	// Launch owns Play (core/11 §6); Overview the summaries of the
	// Overview and the Dashboard; Backups the database backups (core/14).
	Launch   *launch.Service
	Overview *overview.Service
	Backups  *backups.Service
	Logger   *slog.Logger
	// Interrupted lists operations a previous process left unfinished.
	Interrupted []*operation.Operation
	// InterruptedDeploys lists instances with a deploy journal to reconcile.
	InterruptedDeploys []game.InstanceID
	SchemaVersion      int
	// CustomTitleBar is ui.customTitleBar as read at startup: the setting
	// requires a restart, so this is what the running window uses.
	CustomTitleBar bool
	// GPUAcceleration is app.gpuAcceleration as read at startup.
	GPUAcceleration bool
	// StartupSettings are the restart-required settings as read at
	// startup ("Reiniciar agora" compares against them).
	StartupSettings map[string]string
	// Restored: a database backup was put in place at this start.
	Restored bool
	// LongPaths is the OS long path support (workarounds.longPathSupport):
	// enabled, and whether it could be read.
	LongPaths, LongPathsKnown bool

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

	// A restore asked for in the previous run is put in place before the
	// database opens (core/14 §4).
	restored, err := sqlite.ApplyPendingRestore(paths.Database, paths.RestorePending)
	if err != nil {
		logger.Error("apply restore", logging.KeyError, err.Error())
	} else if restored {
		logger.Info("database restored from backup")
	}
	db, err := sqlite.OpenUnmigrated(ctx, paths.Database)
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
	fsys := filesystem.New()
	ids, clock := system.IDs{}, system.Clock{}
	appState := sqlite.NewAppState(db)
	backupSvc := backups.NewService(backups.Deps{
		Store: sqlite.NewBackups(db), FS: fsys, State: appState, Clock: clock,
		Dir: paths.Backups, Pending: paths.RestorePending,
	})
	// Before migrating an existing database, a pre-migration backup
	// (core/14 §2–3). A failure is logged and recorded, not fatal: each
	// migration is its own transaction.
	if cur, latest, perr := sqlite.PendingMigrations(ctx, db); perr == nil && cur > 0 && cur < latest {
		if _, berr := backupSvc.Create(ctx, backups.KindPreMigration); berr != nil {
			logger.Error("pre-migration backup", logging.KeyError, berr.Error())
		}
	}
	if err = sqlite.Migrate(ctx, db); err != nil {
		logger.Error("migrate database", logging.KeyError, err.Error())
		return nil, err
	}
	version, err := sqlite.SchemaVersion(ctx, db)
	if err != nil {
		return nil, err
	}

	settingsSvc := appsettings.NewService(sqlite.NewSettingsRepository(db), system.Locale{}, settings.V1)
	settingsSvc.DataDir, settingsSvc.Prefs = paths.Root, system.Preferences{}
	if lv, err := settingsSvc.AppValue(ctx, "app.logLevel"); err == nil {
		level.Set(logging.ParseLevel(lv.Value))
	}
	customTitleBar, gpu := true, true
	if v, err := settingsSvc.AppValue(ctx, "ui.customTitleBar"); err == nil {
		customTitleBar, _ = strconv.ParseBool(v.Value)
	}
	if v, err := settingsSvc.AppValue(ctx, "app.gpuAcceleration"); err == nil {
		gpu, _ = strconv.ParseBool(v.Value)
	}
	startupSettings, err := settingsSvc.RestartValues(ctx)
	if err != nil {
		return nil, err
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
	// One lock table for every mutating service (D065, INV-OPS-02).
	locks := instancelock.New()
	instances := sqlite.NewGameInstanceRepository(db)
	profiles := sqlite.NewProfileRepository(db)
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
		Processes:   system.Processes{},
		Settings:    settingsSvc,
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
		Manifests:     sqlite.NewManifestRepository(db),
		State:         appState,
		Events:        sqlite.NewEventLog(db),
		UoW:           sqlite.NewUnitOfWork(db),
		Publisher:     bus,
		FS:            fsys,
		Extractor:     archive.New(),
		Hasher:        hashing.SHA256{},
		Versions:      system.FileVersions{},
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

	pluginsSvc := plugins.NewService(plugins.Deps{
		Registry:      registry,
		Instances:     instances,
		Mods:          sqlite.NewModRepository(db),
		Installations: sqlite.NewInstallationRepository(db),
		Profiles:      profiles,
		Rules:         sqlite.NewRuleRepository(db),
		Overrides:     sqlite.NewOverrideRepository(db),
		PluginRules:   sqlite.NewPluginRuleRepository(db),
		Manifests:     sqlite.NewManifestRepository(db),
		State:         appState,
		UoW:           sqlite.NewUnitOfWork(db),
		Publisher:     bus,
		FS:            fsys,
		Hasher:        hashing.SHA256{},
		Folders:       system.Folders{},
		Cache:         plugincache.New(paths.Cache),
		Settings:      settingsSvc,
		Ops:           ops,
		Locks:         locks,
		IDs:           ids,
		Clock:         clock,
	})

	deploySvc := deployment.NewService(deployment.Deps{
		Registry:      registry,
		Instances:     instances,
		Mods:          sqlite.NewModRepository(db),
		Installations: sqlite.NewInstallationRepository(db),
		Profiles:      profiles,
		Rules:         sqlite.NewRuleRepository(db),
		Overrides:     sqlite.NewOverrideRepository(db),
		Manifests:     sqlite.NewManifestRepository(db),
		Journals:      sqlite.NewJournalRepository(db),
		State:         appState,
		UoW:           sqlite.NewUnitOfWork(db),
		Publisher:     bus,
		FS:            fsys,
		Settings:      settingsSvc,
		Foreign:       gamesSvc,
		Archives:      sqlite.NewArchiveRepository(db),
		Decisions:     sqlite.NewExternalDecisionRepository(db),
		Hasher:        hashing.SHA256{},
		Library:       librarySvc,
		Exclusions:    conflictsSvc,
		LoadOrder:     pluginsSvc,
		Ops:           ops,
		Locks:         locks,
		IDs:           ids,
		Clock:         clock,
	})
	// Auto-deploy follows committed changes of the desired state (D036).
	autoDeploy := deployment.NewAutoDeployer(deploySvc)
	unsubAuto := bus.Subscribe(autoDeploy.Handle)
	prevUnsub := unsub
	unsub = func() { unsubAuto(); prevUnsub() }

	diagSvc := diagnostics.NewService(diagnostics.Deps{
		Registry:     registry,
		Instances:    instances,
		Profiles:     profiles,
		Mods:         sqlite.NewModRepository(db),
		Rules:        sqlite.NewRuleRepository(db),
		Suppressions: sqlite.NewSuppressionRepository(db),
		Presence:     sqlite.NewPresenceRepository(db),
		Notifs:       sqlite.NewNotificationRepository(db),
		State:        appState,
		UoW:          sqlite.NewUnitOfWork(db),
		Publisher:    bus,
		FS:           fsys,
		Settings:     settingsSvc,
		Conflicts:    conflictsSvc,
		Deploy:       deploySvc,
		Games:        gamesSvc,
		Library:      librarySvc,
		Commands:     profilesSvc,
		Plugins:      pluginsSvc,
		IDs:          ids,
		Clock:        clock,
	})
	diagSvc.Backups = backupSvc
	backupSvc.OnFailure = func() { _ = diagSvc.RefreshAll(context.Background()) }
	launchSvc := launch.NewService(launch.Deps{
		Registry: registry, Instances: instances, FS: fsys, Launcher: system.Launcher{},
		Deploy: deploySvc, Diagnostics: diagSvc, Games: gamesSvc, Settings: settingsSvc,
		Ops: ops, UoW: sqlite.NewUnitOfWork(db), Publisher: bus, IDs: ids, Clock: clock,
	})
	historySvc := history.NewService(history.Deps{
		History:   sqlite.NewHistoryRepository(db),
		Mods:      sqlite.NewModRepository(db),
		Profiles:  profiles,
		Settings:  settingsSvc,
		Commands:  profilesSvc,
		Conflicts: conflictsSvc,
		Library:   librarySvc,
		Clock:     clock,
	})
	// Diagnostics follow every committed change (core/10 §1: recalculated
	// after their triggers) and turn operation outcomes into notifications.
	unsubDiag := bus.Subscribe(diagSvc.Handle)
	prevUnsub2 := unsub
	unsub = func() { unsubDiag(); prevUnsub2() }
	// The load order follows the inventory (core/08 §3) and the file is
	// watched while the app is open (core/08 §7).
	unsubPlugins := bus.Subscribe(pluginsSvc.Handle)
	prevUnsub3 := unsub
	unsub = func() { unsubPlugins(); prevUnsub3() }
	pluginsSvc.StartMonitor(2 * time.Second)
	// Play turns into "Em execução" and deploy stays blocked while the
	// game runs (core/11 §6).
	launchSvc.StartMonitor(2 * time.Second)
	overviewSvc := overview.NewService(overview.Sources{
		Games: gamesSvc, Instances: instances, Deploy: deploySvc, Diagnostics: diagSvc,
		Library: librarySvc, Conflicts: conflictsSvc, Plugins: pluginsSvc, History: historySvc,
		Settings: settingsSvc, Facts: sqlite.NewFacts(db),
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
	// Staging moves are finished or discarded; deploy journals stay for the
	// user's "Reconcile now" (deploy_interrupted, core/14 §5).
	if err := deploySvc.Recover(ctx); err != nil {
		logger.Error("deployment recovery", logging.KeyError, err.Error())
	}
	// After a restore the manifests may not match the disk: every instance
	// is "unknown" until a scan (core/14 §4).
	if restored {
		if err := deploySvc.MarkUnverified(ctx); err != nil {
			logger.Error("mark restored instances", logging.KeyError, err.Error())
		}
		_ = backupSvc.Restored(ctx)
	}
	interruptedDeploys, err := deploySvc.Interrupted(ctx)
	if err != nil {
		logger.Error("deploy journals", logging.KeyError, err.Error())
	}
	if n, err := historySvc.Prune(ctx); err != nil {
		logger.Error("history retention", logging.KeyError, err.Error())
	} else if n > 0 {
		logger.Info("history retention", "pruned", n)
	}
	verifyStaging := false
	if v, err := settingsSvc.AppValue(ctx, "library.verifyStagingOnStartup"); err == nil {
		verifyStaging, _ = strconv.ParseBool(v.Value)
	}
	// The first evaluation runs off the startup path; it records which
	// problems exist so only new ones notify later.
	go func() {
		bg := context.Background()
		if verifyStaging {
			_ = diagSvc.VerifyStagingAll(bg)
		}
		if err := diagSvc.RefreshAll(bg); err != nil {
			logger.Warn("diagnostics refresh", logging.KeyError, err.Error())
		}
	}()
	// The app opened without error: keep it as the last good startup, then
	// back up every hour of use with changes (core/14 §3).
	backupSvc.Start(time.Hour)
	go func() {
		if _, err := backupSvc.Create(context.Background(), backups.KindStartup); err != nil {
			logger.Error("startup backup", logging.KeyError, err.Error())
		}
	}()
	longPaths, longPathsKnown := system.Preferences{}.LongPaths()
	logger.Info("startup", "dataDir", paths.Root, "schemaVersion", version, "interruptedOperations", len(interrupted), "interruptedDeploys", len(interruptedDeploys))

	return &Container{
		Paths:              paths,
		Events:             bus,
		Operations:         ops,
		Settings:           settingsSvc,
		Games:              gamesSvc,
		Library:            librarySvc,
		Profiles:           profilesSvc,
		Conflicts:          conflictsSvc,
		Deployment:         deploySvc,
		AutoDeploy:         autoDeploy,
		Plugins:            pluginsSvc,
		Diagnostics:        diagSvc,
		History:            historySvc,
		Launch:             launchSvc,
		Overview:           overviewSvc,
		Backups:            backupSvc,
		Logger:             logger,
		Interrupted:        interrupted,
		InterruptedDeploys: interruptedDeploys,
		SchemaVersion:      version,
		CustomTitleBar:     customTitleBar,
		GPUAcceleration:    gpu,
		StartupSettings:    startupSettings,
		Restored:           restored,
		LongPaths:          longPaths,
		LongPathsKnown:     longPathsKnown,
		db:                 db,
		logFile:            logFile,
		unsub:              unsub,
	}, nil
}

// OpenLogFolder shows the technical log folder in the file manager.
func (c *Container) OpenLogFolder() error { return system.OpenFolder(c.Paths.Logs) }

// Close releases resources.
func (c *Container) Close() error {
	c.unsub()
	c.AutoDeploy.Close()
	c.Plugins.Close()
	c.Diagnostics.Close()
	c.Launch.Close()
	// The exit backup (core/14 §3 "na saída normal") before the database
	// closes.
	c.Backups.Close()
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

// ExportSupportBundle writes the support bundle zip to path (core/10 §4).
func (c *Container) ExportSupportBundle(ctx context.Context, path, appVersion string) error {
	home, _ := os.UserHomeDir()
	b, err := c.Diagnostics.SupportBundle(ctx, appVersion, c.SchemaVersion, home, c.Settings)
	if err != nil {
		return err
	}
	return supportbundle.Write(path, b, c.Paths.Logs)
}

// WaitForRestart waits for the previous process of a restart to exit
// before this one opens the database.
func WaitForRestart(args []string, timeout time.Duration) { system.WaitForPrevious(args, timeout) }

// Restart starts a new process of the app that waits for this one; the
// caller quits right after ("Reiniciar agora", core/13).
func (c *Container) Restart() error { return system.Restart() }
