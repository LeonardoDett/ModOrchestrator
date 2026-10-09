package backups

import (
	"context"
	"strings"

	"modorchestrator/internal/core/domain/game"
)

// The use cases below serve the recovery screen (core/14 §5): the
// database could not be opened, so they never touch it, nor app_state.

// Candidate is a backup the recovery screen offers, validated.
type Candidate struct {
	Backup
	// Schema is the schema version of the file; Valid is false when it
	// failed validation (corrupt, unknown or newer schema).
	Schema int
	Valid  bool
}

// Candidates lists the backups, newest first, each validated.
func (s *Service) Candidates(ctx context.Context) ([]Candidate, error) {
	list, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Candidate, len(list))
	for i, b := range list {
		v, err := s.Store.Inspect(ctx, game.JoinPath(s.Dir, b.ID))
		out[i] = Candidate{Backup: b, Schema: v, Valid: err == nil}
	}
	return out, nil
}

// RecoverFrom puts a backup in place of a database that cannot be opened:
// the backup is validated and copied to the pending file, then the
// database is set aside; the next start applies the copy as a restore
// (instances "not verified" until a scan, core/14 §4).
func (s *Service) RecoverFrom(ctx context.Context, id, database string) error {
	b, ok := parseName(id)
	if !ok || strings.ContainsAny(id, `/\`) {
		return fail(CodeNotFound, nil, "backup", id)
	}
	src := game.JoinPath(s.Dir, b.ID)
	if _, err := s.Store.Inspect(ctx, src); err != nil {
		return fail(CodeInvalid, err, "backup", id)
	}
	if err := s.Store.CopyFile(ctx, src, s.Pending); err != nil {
		return fail(CodeInvalid, err, "backup", id)
	}
	return s.SetAside(ctx, database)
}

// SetAside moves a database that cannot be opened (with its WAL and
// shared-memory files) into the backups folder as kind "damaged"; the next
// start creates an empty database ("começar do zero"). Nothing of the
// instances' folders is touched: staging, archives and the game stay where
// they are (D099).
func (s *Service) SetAside(ctx context.Context, database string) error {
	if err := s.FS.MkdirAll(ctx, s.Dir); err != nil {
		return fail(CodeFailed, err, "kind", string(KindDamaged))
	}
	name := game.JoinPath(s.Dir, fileName(s.Clock.Now().UTC(), KindDamaged))
	// The WAL first: a WAL left next to a new database must never be
	// replayed into it.
	for _, suffix := range []string{"-wal", "-shm", ""} {
		info, err := s.FS.Stat(ctx, database+suffix)
		if err != nil || !info.Exists {
			continue
		}
		if err := s.FS.Rename(ctx, database+suffix, name+suffix); err != nil {
			return fail(CodeFailed, err, "kind", string(KindDamaged))
		}
	}
	return nil
}
