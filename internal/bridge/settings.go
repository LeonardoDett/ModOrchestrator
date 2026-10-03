package bridge

import (
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/core/application/backups"
	"modorchestrator/internal/core/domain/game"
)

// Settings, Workarounds and Extensions (core/13, core/14 §3–4,
// ui/telas/settings-extensions.md): transport only.

type BackupDTO struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	At   string `json:"at"`
	Size int64  `json:"size"`
}

type BackupFailureDTO struct {
	Kind   string `json:"kind"`
	At     string `json:"at"`
	Reason string `json:"reason"`
}

type BackupStatusDTO struct {
	LastAuto       string            `json:"lastAuto,omitempty"`
	LastManual     string            `json:"lastManual,omitempty"`
	LastStartup    string            `json:"lastStartup,omitempty"`
	Failure        *BackupFailureDTO `json:"failure,omitempty"`
	RestorePending string            `json:"restorePending,omitempty"`
	RestoredAt     string            `json:"restoredAt,omitempty"`
	Backups        []BackupDTO       `json:"backups"`
}

// RestartStateDTO lists what waits for a restart ("Reiniciar agora").
type RestartStateDTO struct {
	Settings []string `json:"settings"`
	Restore  bool     `json:"restore"`
}

type WorkaroundsDTO struct {
	// LongPaths is the OS long path support (informative,
	// workarounds.longPathSupport): "enabled", "disabled" or "unknown".
	LongPaths string `json:"longPaths"`
}

type TempCleanupDTO struct {
	Removed int `json:"removed"`
	Skipped int `json:"skipped"`
}

type ArchivesPreviewDTO struct {
	From       string `json:"from"`
	To         string `json:"to"`
	Bytes      int64  `json:"bytes"`
	Free       int64  `json:"free"`
	SameVolume bool   `json:"sameVolume"`
	Problem    string `json:"problem,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// ExtensionDTO is a built-in adapter on the Extensions screen.
type ExtensionDTO struct {
	Name    string             `json:"name"`
	Version string             `json:"version"`
	Games   []ExtensionGameDTO `json:"games"`
	// Capabilities is the union of its games' capabilities.
	Capabilities []string `json:"capabilities"`
	BuiltIn      bool     `json:"builtIn"`
	Active       bool     `json:"active"`
}

type ExtensionGameDTO struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Capabilities []string `json:"capabilities"`
	Custom       bool     `json:"custom"`
}

// RestartState returns the restart-required settings changed since this
// process started and whether a database restore waits for the restart.
func (a *App) RestartState() (RestartStateDTO, error) {
	keys, err := a.c.Settings.RestartPending(a.context(), a.c.StartupSettings)
	if err != nil {
		return RestartStateDTO{}, a.fail("restart state", err, nil)
	}
	st, err := a.c.Backups.Status(a.context())
	if err != nil {
		return RestartStateDTO{}, a.fail("restart state", err, nil)
	}
	if keys == nil {
		keys = []string{}
	}
	return RestartStateDTO{Settings: keys, Restore: st.RestorePending != ""}, nil
}

// RestartApp starts a new process of the app and quits this one.
func (a *App) RestartApp() error {
	if err := a.c.Restart(); err != nil {
		return a.fail("restart", err, nil)
	}
	a.c.Logger.Info("restart requested")
	runtime.Quit(a.context())
	return nil
}

// OpenDataFolder shows the application data folder (app.dataDir).
func (a *App) OpenDataFolder() error {
	if err := a.c.OpenFolder(a.c.Paths.Root); err != nil {
		return a.fail("open data folder", err, nil)
	}
	return nil
}

// OpenBackupsFolder shows the folder of the database backups.
func (a *App) OpenBackupsFolder() error {
	if err := a.c.OpenFolder(a.c.Paths.Backups); err != nil {
		return a.fail("open backups folder", err, nil)
	}
	return nil
}

// BackupStatus returns the facts and the list of database backups.
func (a *App) BackupStatus() (BackupStatusDTO, error) {
	st, err := a.c.Backups.Status(a.context())
	if err != nil {
		return BackupStatusDTO{}, a.fail("backup status", err, nil)
	}
	list, err := a.c.Backups.List(a.context())
	if err != nil {
		return BackupStatusDTO{}, a.fail("backup status", err, nil)
	}
	dto := BackupStatusDTO{RestorePending: st.RestorePending, Backups: []BackupDTO{}}
	dto.LastAuto, dto.LastManual, dto.LastStartup = optTime(st.LastAuto), optTime(st.LastManual), optTime(st.LastStartup)
	dto.RestoredAt = optTime(st.RestoredAt)
	if f := st.Failure; f != nil {
		dto.Failure = &BackupFailureDTO{Kind: string(f.Kind), At: formatTime(f.At), Reason: f.Reason}
	}
	for _, b := range list {
		dto.Backups = append(dto.Backups, BackupDTO{ID: b.ID, Kind: string(b.Kind), At: formatTime(b.At), Size: b.Size})
	}
	return dto, nil
}

// CreateBackup makes a manual backup ("Criar backup").
func (a *App) CreateBackup() (BackupDTO, error) {
	b, err := a.c.Backups.Create(a.context(), backups.KindManual)
	if err != nil {
		return BackupDTO{}, a.fail("create backup", err, nil)
	}
	a.c.Logger.Info("backup created", "backup", b.ID)
	return BackupDTO{ID: b.ID, Kind: string(b.Kind), At: formatTime(b.At), Size: b.Size}, nil
}

// RestoreBackup prepares the restore of a listed backup (DLG-27); it is
// applied at the next start.
func (a *App) RestoreBackup(id string) error {
	if err := a.c.Backups.Restore(a.context(), id); err != nil {
		return a.fail("restore backup", err, map[string]string{"backup": id})
	}
	a.c.Logger.Info("restore prepared", "backup", id)
	return nil
}

// PickBackupFile asks for a database file to restore ("Restaurar de
// arquivo (perigoso)"); "" when the user cancels.
func (a *App) PickBackupFile(title string) (string, error) {
	path, err := runtime.OpenFileDialog(a.context(), runtime.OpenDialogOptions{
		Title: title, Filters: []runtime.FileFilter{{DisplayName: "SQLite (*.db)", Pattern: "*.db"}},
	})
	if err != nil {
		return "", a.fail("pick backup file", err, nil)
	}
	return path, nil
}

// RestoreBackupFromFile validates an external database file and prepares
// its restore.
func (a *App) RestoreBackupFromFile(path string) error {
	if err := a.c.Backups.RestoreFromFile(a.context(), path); err != nil {
		return a.fail("restore backup from file", err, map[string]string{"path": path})
	}
	a.c.Logger.Info("restore prepared from file", "path", path)
	return nil
}

// CancelRestore discards a restore waiting for the restart.
func (a *App) CancelRestore() error {
	if err := a.c.Backups.CancelRestore(a.context()); err != nil {
		return a.fail("cancel restore", err, nil)
	}
	return nil
}

// Workarounds returns the informative facts of Settings › Workarounds.
func (a *App) Workarounds() WorkaroundsDTO {
	switch {
	case !a.c.LongPathsKnown:
		return WorkaroundsDTO{LongPaths: "unknown"}
	case a.c.LongPaths:
		return WorkaroundsDTO{LongPaths: "enabled"}
	}
	return WorkaroundsDTO{LongPaths: "disabled"}
}

// CleanTempFiles removes the temporary work of operations not running.
func (a *App) CleanTempFiles() (TempCleanupDTO, error) {
	r, err := a.c.Library.CleanTemp(a.context())
	if err != nil {
		return TempCleanupDTO{}, a.fail("clean temp files", err, nil)
	}
	a.c.Logger.Info("temp files cleaned", "removed", r.Removed, "skipped", r.Skipped)
	return TempCleanupDTO{Removed: r.Removed, Skipped: r.Skipped}, nil
}

// PreviewMoveArchives validates a new ArchiveStore and estimates the move.
func (a *App) PreviewMoveArchives(instance, to string) (ArchivesPreviewDTO, error) {
	p, err := a.c.Deployment.PreviewMoveArchives(a.context(), game.InstanceID(instance), to)
	if err != nil {
		return ArchivesPreviewDTO{}, a.fail("preview move archives", err, map[string]string{"instance": instance})
	}
	return ArchivesPreviewDTO{From: p.From, To: p.To, Bytes: p.Bytes, Free: p.Free, SameVolume: p.SameVolume, Problem: p.Problem, Reason: p.Reason}, nil
}

// MoveArchiveStore starts the move of the ArchiveStore.
func (a *App) MoveArchiveStore(instance, to string) (string, error) {
	id, err := a.c.Deployment.MoveArchiveStore(a.context(), game.InstanceID(instance), to)
	if err != nil {
		return "", a.fail("move archives", err, map[string]string{"instance": instance, "folder": to})
	}
	return string(id), nil
}

// Extensions lists the built-in adapters (V1: no third-party extensions).
func (a *App) Extensions() []ExtensionDTO {
	var out []ExtensionDTO
	for _, ad := range a.c.Games.Registry.Adapters() {
		e := ExtensionDTO{Name: ad.Name(), Version: ad.Version(), Games: []ExtensionGameDTO{}, Capabilities: []string{}, BuiltIn: true, Active: true}
		seen := map[string]bool{}
		for _, d := range ad.Definitions() {
			g := ExtensionGameDTO{ID: string(d.ID), Name: d.Name, Capabilities: []string{}, Custom: d.CustomTargets}
			for _, c := range d.Capabilities.List() {
				g.Capabilities = append(g.Capabilities, string(c))
				if !seen[string(c)] {
					seen[string(c)] = true
					e.Capabilities = append(e.Capabilities, string(c))
				}
			}
			e.Games = append(e.Games, g)
		}
		out = append(out, e)
	}
	return out
}
