// Package backups is the application service of the database backups of
// core/14 §3–4: automatic (every hour of use with changes and at normal
// exit), pre-migration, manual and last successful startup, each with its
// retention; restoring a backup or an external file on the next start.
// Backups live in <dataDir>/backups as state-<timestamp>-<kind>.db; the
// folder is the source of truth of the list (nothing about them is in the
// database they copy). What is persisted in app_state is delivery state:
// the last failure (backup_failed) and the restore waiting for a restart.
package backups

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Kind is why a backup was made (core/14 §3).
type Kind string

const (
	KindAuto         Kind = "auto"
	KindManual       Kind = "manual"
	KindPreMigration Kind = "pre_migration"
	KindStartup      Kind = "startup"
	// KindPreRestore is the copy of the current state made before a
	// restore ("antes, faz backup do estado atual", core/14 §4).
	KindPreRestore Kind = "pre_restore"
)

var kinds = []Kind{KindAuto, KindManual, KindPreMigration, KindStartup, KindPreRestore}

// Error codes (core/00 §6).
const (
	CodeNotFound   = "backup_not_found"
	CodeInvalid    = "backup_invalid"
	CodeFailed     = "backup_failed"
	CodeNoRestore  = "restore_not_pending"
	timestampShape = "20060102T150405.000Z"
)

// Error is a failure with a stable code and parameters (D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("backups: %s: %v", e.code, e.cause)
	}
	return "backups: " + e.code
}
func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// Backup is one file of the backups folder.
type Backup struct {
	ID   string // file name
	Kind Kind
	At   time.Time
	Size int64
}

// Failure is the last failed backup (backup_failed, core/10).
type Failure struct {
	Kind   Kind      `json:"kind"`
	At     time.Time `json:"at"`
	Reason string    `json:"reason"`
}

// Status is what Settings › Workarounds shows.
type Status struct {
	LastAuto, LastManual, LastStartup time.Time
	Failure                           *Failure
	// RestorePending names the backup applied at the next start ("" when
	// none); RestoredAt is when the last restore was applied.
	RestorePending string
	RestoredAt     time.Time
}

// app_state keys.
const (
	stateFailure   = "backups.lastFailure"
	statePending   = "backups.restorePending"
	stateRestored  = "backups.restoredAt"
	retainAuto     = 24
	retainAutoDays = 7
)

var retainCount = map[Kind]int{KindPreMigration: 3, KindStartup: 1, KindPreRestore: 3}

// Deps are the ports of the service.
type Deps struct {
	Store ports.DatabaseBackups
	FS    ports.FileSystem
	State ports.AppState
	Clock interface{ Now() time.Time }
	// Dir is <dataDir>/backups; Pending is the validated copy a restore
	// puts in place at the next start.
	Dir, Pending string
	// OnFailure is called after a failed backup (diagnostics refresh).
	OnFailure func()
}

// Service implements the backup use cases.
type Service struct {
	Deps
	mu      sync.Mutex
	changes int64
	stop    chan struct{}
	done    chan struct{}
}

// NewService wires the service.
func NewService(d Deps) *Service { return &Service{Deps: d} }

// Create makes a backup of the current database. A failure is recorded for
// the backup_failed diagnostic; a success clears it.
func (s *Service) Create(ctx context.Context, kind Kind) (Backup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.create(ctx, kind)
}

func (s *Service) create(ctx context.Context, kind Kind) (Backup, error) {
	now := s.Clock.Now().UTC()
	b := Backup{ID: fileName(now, kind), Kind: kind, At: now}
	err := s.FS.MkdirAll(ctx, s.Dir)
	if err == nil {
		err = s.Store.Create(ctx, game.JoinPath(s.Dir, b.ID))
	}
	if err != nil {
		s.recordFailure(ctx, kind, err)
		return Backup{}, fail(CodeFailed, err, "kind", string(kind))
	}
	_ = s.State.Delete(ctx, stateFailure)
	if info, err := s.FS.Stat(ctx, game.JoinPath(s.Dir, b.ID)); err == nil {
		b.Size = info.Size
	}
	if n, err := s.Store.Changes(ctx); err == nil {
		s.changes = n
	}
	s.prune(ctx)
	return b, nil
}

func (s *Service) recordFailure(ctx context.Context, kind Kind, cause error) {
	data, _ := json.Marshal(Failure{Kind: kind, At: s.Clock.Now().UTC(), Reason: cause.Error()})
	_ = s.State.Set(ctx, stateFailure, string(data))
	if s.OnFailure != nil {
		go s.OnFailure()
	}
}

func fileName(at time.Time, kind Kind) string {
	return "state-" + at.Format(timestampShape) + "-" + string(kind) + ".db"
}

// parseName reads a backup file name back; other files are not backups.
func parseName(name string) (Backup, bool) {
	rest, ok := strings.CutPrefix(name, "state-")
	if !ok {
		return Backup{}, false
	}
	rest, ok = strings.CutSuffix(rest, ".db")
	if !ok || len(rest) < len(timestampShape)+2 {
		return Backup{}, false
	}
	at, err := time.Parse(timestampShape, rest[:len(timestampShape)])
	if err != nil || rest[len(timestampShape)] != '-' {
		return Backup{}, false
	}
	kind := Kind(rest[len(timestampShape)+1:])
	if !slices.Contains(kinds, kind) {
		return Backup{}, false
	}
	return Backup{ID: name, Kind: kind, At: at}, true
}

// List returns the backups, newest first.
func (s *Service) List(ctx context.Context) ([]Backup, error) {
	entries, err := s.FS.ReadDir(ctx, s.Dir)
	if err != nil {
		if info, serr := s.FS.Stat(ctx, s.Dir); serr == nil && !info.Exists {
			return nil, nil
		}
		return nil, err
	}
	var out []Backup
	for _, e := range entries {
		if e.IsDir {
			continue
		}
		b, ok := parseName(e.Name)
		if !ok {
			continue
		}
		if info, err := s.FS.Stat(ctx, game.JoinPath(s.Dir, e.Name)); err == nil {
			b.Size = info.Size
		}
		out = append(out, b)
	}
	slices.SortFunc(out, func(a, b Backup) int { return b.At.Compare(a.At) })
	return out, nil
}

// Expired returns the backups the retention of core/14 §3 removes: auto
// keeps the newest 24 plus the newest of each of the last 7 days;
// pre-migration and pre-restore keep 3; startup keeps 1; manual keeps all.
// list must be newest first.
func Expired(list []Backup, now time.Time) []Backup {
	var out []Backup
	seen := map[Kind]int{}
	days := map[string]bool{}
	cutoff := now.AddDate(0, 0, -retainAutoDays)
	for _, b := range list {
		seen[b.Kind]++
		switch b.Kind {
		case KindManual:
			continue
		case KindAuto:
			day := b.At.Local().Format("2006-01-02")
			keepDaily := b.At.After(cutoff) && !days[day]
			days[day] = true
			if seen[b.Kind] <= retainAuto || keepDaily {
				continue
			}
		default:
			if seen[b.Kind] <= retainCount[b.Kind] {
				continue
			}
		}
		out = append(out, b)
	}
	return out
}

func (s *Service) prune(ctx context.Context) {
	list, err := s.List(ctx)
	if err != nil {
		return
	}
	for _, b := range Expired(list, s.Clock.Now()) {
		_ = s.FS.Remove(ctx, game.JoinPath(s.Dir, b.ID))
	}
}

// Status returns the facts of Settings › Workarounds.
func (s *Service) Status(ctx context.Context) (Status, error) {
	list, err := s.List(ctx)
	if err != nil {
		return Status{}, err
	}
	var st Status
	for _, b := range list {
		switch {
		case b.Kind == KindAuto && st.LastAuto.IsZero():
			st.LastAuto = b.At
		case b.Kind == KindManual && st.LastManual.IsZero():
			st.LastManual = b.At
		case b.Kind == KindStartup && st.LastStartup.IsZero():
			st.LastStartup = b.At
		}
	}
	st.Failure = s.LastFailure(ctx)
	if v, err := s.State.Get(ctx, statePending); err == nil {
		st.RestorePending = v
	}
	if v, err := s.State.Get(ctx, stateRestored); err == nil {
		st.RestoredAt, _ = time.Parse(time.RFC3339Nano, v)
	}
	return st, nil
}

// LastFailure returns the last failed backup, nil after a success.
func (s *Service) LastFailure(ctx context.Context) *Failure {
	v, err := s.State.Get(ctx, stateFailure)
	if err != nil {
		return nil
	}
	var f Failure
	if json.Unmarshal([]byte(v), &f) != nil {
		return nil
	}
	return &f
}

// Restore prepares the restore of a backup of the list: the current state
// is backed up first, then the backup is validated and copied to the
// pending file that the next start puts in place (core/14 §4). Nothing
// changes in the running database.
func (s *Service) Restore(ctx context.Context, id string) error {
	b, ok := parseName(id)
	if !ok || strings.ContainsAny(id, `/\`) {
		return fail(CodeNotFound, nil, "backup", id)
	}
	src := game.JoinPath(s.Dir, b.ID)
	if info, err := s.FS.Stat(ctx, src); err != nil || !info.Exists {
		return fail(CodeNotFound, err, "backup", id)
	}
	return s.stage(ctx, src, id)
}

// RestoreFromFile prepares the restore of an external database file
// ("Restaurar de arquivo (perigoso)"), validated before anything changes.
func (s *Service) RestoreFromFile(ctx context.Context, path string) error {
	if _, err := s.Store.Inspect(ctx, path); err != nil {
		return fail(CodeInvalid, err, "path", path)
	}
	return s.stage(ctx, path, path)
}

func (s *Service) stage(ctx context.Context, src, label string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.Store.Inspect(ctx, src); err != nil {
		return fail(CodeInvalid, err, "backup", label)
	}
	if _, err := s.create(ctx, KindPreRestore); err != nil {
		return err
	}
	if err := s.Store.CopyFile(ctx, src, s.Pending); err != nil {
		return fail(CodeInvalid, err, "backup", label)
	}
	return s.State.Set(ctx, statePending, label)
}

// CancelRestore discards a restore waiting for the restart.
func (s *Service) CancelRestore(ctx context.Context) error {
	if _, err := s.State.Get(ctx, statePending); errors.Is(err, ports.ErrNotFound) {
		return fail(CodeNoRestore, nil)
	}
	if err := s.FS.Remove(ctx, s.Pending); err != nil {
		if info, serr := s.FS.Stat(ctx, s.Pending); serr != nil || info.Exists {
			return err
		}
	}
	return s.State.Delete(ctx, statePending)
}

// Restored records that a restore was applied at this start (the restored
// database does not know it was pending).
func (s *Service) Restored(ctx context.Context) error {
	_ = s.State.Delete(ctx, statePending)
	return s.State.Set(ctx, stateRestored, s.Clock.Now().UTC().Format(time.RFC3339Nano))
}

// Start runs the automatic backup every interval while the app is open; it
// copies only when something changed since the last backup.
func (s *Service) Start(interval time.Duration) {
	if n, err := s.Store.Changes(context.Background()); err == nil {
		s.changes = n
	}
	s.stop, s.done = make(chan struct{}), make(chan struct{})
	go func() {
		defer close(s.done)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-s.stop:
				return
			case <-t.C:
				_, _ = s.AutoIfChanged(context.Background())
			}
		}
	}()
}

// AutoIfChanged makes an automatic backup when the database changed since
// the last one. It reports whether a backup was made.
func (s *Service) AutoIfChanged(ctx context.Context) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, err := s.Store.Changes(ctx)
	if err != nil {
		return false, err
	}
	if n == s.changes {
		return false, nil
	}
	if _, err := s.create(ctx, KindAuto); err != nil {
		return false, err
	}
	return true, nil
}

// Close stops the timer and makes the exit backup (core/14 §3 "na saída
// normal") when something changed.
func (s *Service) Close() {
	if s.stop != nil {
		close(s.stop)
		<-s.done
		s.stop = nil
	}
	_, _ = s.AutoIfChanged(context.Background())
}
