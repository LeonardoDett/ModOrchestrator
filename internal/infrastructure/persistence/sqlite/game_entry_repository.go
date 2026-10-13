package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// GameEntryRepository implements ports.GameEntries.
type GameEntryRepository struct {
	db  *sql.DB
	now func() time.Time
}

var _ ports.GameEntries = (*GameEntryRepository)(nil)

// NewGameEntryRepository returns a repository over an opened database.
func NewGameEntryRepository(db *sql.DB) *GameEntryRepository {
	return &GameEntryRepository{db: db, now: func() time.Time { return time.Now().UTC() }}
}

// List returns the readable entries by id and the ids of the ones this
// build cannot read (written by a newer version, or damaged). Those rows
// are left untouched.
func (r *GameEntryRepository) List(ctx context.Context) ([]game.Manifest, []game.ID, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, manifest_json FROM game_entries ORDER BY id`)
	if err != nil {
		return nil, nil, fmt.Errorf("sqlite: list game entries: %w", err)
	}
	defer rows.Close()
	var out []game.Manifest
	var unreadable []game.ID
	for rows.Next() {
		var id, data string
		if err := rows.Scan(&id, &data); err != nil {
			return nil, nil, err
		}
		m, err := game.ParseManifest([]byte(data))
		if err != nil || string(m.ID) != id {
			unreadable = append(unreadable, game.ID(id))
			continue
		}
		out = append(out, m)
	}
	return out, unreadable, rows.Err()
}

// Save inserts or replaces the entry; the manifest is validated first.
func (r *GameEntryRepository) Save(ctx context.Context, m game.Manifest) error {
	data, err := m.Marshal()
	if err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, `
		INSERT INTO game_entries (id, manifest_json, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET manifest_json = excluded.manifest_json, updated_at = excluded.updated_at`,
		string(m.ID), string(data), r.now().Format(timeLayout)); err != nil {
		return fmt.Errorf("sqlite: save game entry %s: %w", m.ID, err)
	}
	return nil
}

// Delete returns ports.ErrNotFound for an unknown entry.
func (r *GameEntryRepository) Delete(ctx context.Context, id game.ID) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM game_entries WHERE id = ?`, string(id))
	if err != nil {
		return fmt.Errorf("sqlite: delete game entry %s: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ports.ErrNotFound
	}
	return nil
}
