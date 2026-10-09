package bootstrap

import (
	"context"
	"errors"

	"modorchestrator/internal/core/application/backups"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/filesystem"
	"modorchestrator/internal/infrastructure/persistence/sqlite"
	"modorchestrator/internal/infrastructure/system"
)

// Reasons the database could not be used (core/14 §2, §5).
const (
	ReasonCorrupt         = "corrupt"
	ReasonNewerSchema     = "newer_schema"
	ReasonMigrationFailed = "migration_failed"
	ReasonStartupFailed   = "startup_failed"
)

// StartupFailure is returned by New when the database cannot be used: the
// app opens the recovery screen instead of the shell (core/14 §5).
type StartupFailure struct {
	Reason string
	Paths  appdata.Paths
	Err    error
}

func (f *StartupFailure) Error() string { return "startup: " + f.Reason + ": " + f.Err.Error() }
func (f *StartupFailure) Unwrap() error { return f.Err }

func startupFailure(paths appdata.Paths, err error) error {
	var f *StartupFailure
	if errors.As(err, &f) {
		return err
	}
	reason := ReasonStartupFailed
	switch {
	case errors.Is(err, sqlite.ErrNewerSchema):
		reason = ReasonNewerSchema
	case sqlite.IsCorrupt(err):
		reason = ReasonCorrupt
	case errors.Is(err, sqlite.ErrMigration):
		reason = ReasonMigrationFailed
	}
	return &StartupFailure{Reason: reason, Paths: paths, Err: err}
}

// Recovery is what the recovery screen can do without the database:
// restore a validated backup, start from scratch (the database is set
// aside, every folder stays), open the backups and logs folders, restart.
type Recovery struct {
	Failure  *StartupFailure
	Language string
	backups  *backups.Service
}

// NewRecovery wires the recovery screen for a failed startup.
func NewRecovery(f *StartupFailure) *Recovery {
	return &Recovery{
		Failure:  f,
		Language: appsettings.MatchLanguage(system.Locale{}.Language(), []string{"en", "pt-BR"}),
		backups: backups.NewService(backups.Deps{
			Store: sqlite.NewBackups(nil), FS: filesystem.New(), Clock: system.Clock{},
			Dir: f.Paths.Backups, Pending: f.Paths.RestorePending,
		}),
	}
}

// Backups lists the backups, newest first, validated.
func (r *Recovery) Backups(ctx context.Context) ([]backups.Candidate, error) {
	return r.backups.Candidates(ctx)
}

// Restore puts a backup in place at the next start.
func (r *Recovery) Restore(ctx context.Context, id string) error {
	return r.backups.RecoverFrom(ctx, id, r.Failure.Paths.Database)
}

// StartFresh sets the database aside; the next start creates an empty one.
func (r *Recovery) StartFresh(ctx context.Context) error {
	return r.backups.SetAside(ctx, r.Failure.Paths.Database)
}

// OpenBackupsFolder shows the backups folder.
func (r *Recovery) OpenBackupsFolder() error { return system.OpenFolder(r.Failure.Paths.Backups) }

// OpenLogFolder shows the technical log folder.
func (r *Recovery) OpenLogFolder() error { return system.OpenFolder(r.Failure.Paths.Logs) }

// Restart starts a new process that waits for this one to exit.
func (r *Recovery) Restart() error { return system.Restart() }
