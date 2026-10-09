package bridge

import (
	"errors"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/bootstrap"
)

// NewRecoveryApp is the binding when the database could not be used: only
// the recovery calls work; the UI shows the recovery screen and nothing
// else (core/14 §5).
func NewRecoveryApp(r *bootstrap.Recovery) *App {
	return &App{rec: r, emit: runtime.EventsEmit}
}

// RecoveryDTO tells the UI whether to open the recovery screen and why.
type RecoveryDTO struct {
	Active bool   `json:"active"`
	Reason string `json:"reason"`
	// Detail is the technical message, for the support bundle and logs.
	Detail     string `json:"detail"`
	Language   string `json:"language"`
	DataDir    string `json:"dataDir"`
	BackupsDir string `json:"backupsDir"`
}

// RecoveryBackupDTO is one backup the recovery screen offers.
type RecoveryBackupDTO struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	At     string `json:"at"`
	Size   int64  `json:"size"`
	Schema int    `json:"schema"`
	Valid  bool   `json:"valid"`
}

// StartupRecovery is the first call of the UI: Active means the shell must
// not open.
func (a *App) StartupRecovery() RecoveryDTO {
	if a.rec == nil {
		return RecoveryDTO{}
	}
	f := a.rec.Failure
	return RecoveryDTO{Active: true, Reason: f.Reason, Detail: f.Err.Error(), Language: a.rec.Language,
		DataDir: f.Paths.Root, BackupsDir: f.Paths.Backups}
}

// RecoveryBackups lists the backups, newest first, validated.
func (a *App) RecoveryBackups() ([]RecoveryBackupDTO, error) {
	if a.rec == nil {
		return nil, uiError(errNotRecovering, nil)
	}
	list, err := a.rec.Backups(a.context())
	if err != nil {
		return nil, uiError(err, nil)
	}
	out := make([]RecoveryBackupDTO, len(list))
	for i, b := range list {
		out[i] = RecoveryBackupDTO{ID: b.ID, Kind: string(b.Kind), At: b.At.UTC().Format(time.RFC3339Nano), Size: b.Size, Schema: b.Schema, Valid: b.Valid}
	}
	return out, nil
}

// RecoveryRestore prepares a backup for the next start, then restarts.
func (a *App) RecoveryRestore(id string) error {
	if a.rec == nil {
		return uiError(errNotRecovering, nil)
	}
	if err := a.rec.Restore(a.context(), id); err != nil {
		return uiError(err, map[string]string{"backup": id})
	}
	return a.recoveryRestart()
}

// RecoveryStartFresh sets the database aside and restarts with an empty
// one; staging, archives and games stay where they are.
func (a *App) RecoveryStartFresh() error {
	if a.rec == nil {
		return uiError(errNotRecovering, nil)
	}
	if err := a.rec.StartFresh(a.context()); err != nil {
		return uiError(err, nil)
	}
	return a.recoveryRestart()
}

// RecoveryOpenFolder shows the backups ("backups") or logs ("logs") folder.
func (a *App) RecoveryOpenFolder(which string) error {
	if a.rec == nil {
		return uiError(errNotRecovering, nil)
	}
	open := a.rec.OpenBackupsFolder
	if which == "logs" {
		open = a.rec.OpenLogFolder
	}
	if err := open(); err != nil {
		return uiError(err, nil)
	}
	return nil
}

// RecoveryQuit closes the app.
func (a *App) RecoveryQuit() {
	runtime.Quit(a.context())
}

func (a *App) recoveryRestart() error {
	if err := a.rec.Restart(); err != nil {
		return uiError(err, nil)
	}
	runtime.Quit(a.context())
	return nil
}

// errNotRecovering: a recovery call reached an app that opened normally.
var errNotRecovering = errors.New("bridge: the app is not in recovery")
