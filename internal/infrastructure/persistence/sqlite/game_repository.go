package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// GameInstanceRepository implements ports.GameInstances.
type GameInstanceRepository struct {
	db  *sql.DB
	now func() time.Time
}

var _ ports.GameInstances = (*GameInstanceRepository)(nil)

// NewGameInstanceRepository returns a repository over an opened database.
func NewGameInstanceRepository(db *sql.DB) *GameInstanceRepository {
	return &GameInstanceRepository{db: db, now: func() time.Time { return time.Now().UTC() }}
}

const instanceColumns = `id, game, adapter, adapter_version, display_name, root, staging, archive_store,
	backup_store, preferred_method, store, executable, hidden`

func scanInstance(row interface{ Scan(...any) error }) (game.Instance, error) {
	var i game.Instance
	var id, g, method string
	var hidden int
	if err := row.Scan(&id, &g, &i.Adapter, &i.AdapterVersion, &i.DisplayName, &i.Root, &i.Staging,
		&i.ArchiveStore, &i.BackupStore, &method, &i.Store, &i.Executable, &hidden); err != nil {
		return game.Instance{}, err
	}
	i.ID, i.Game, i.PreferredMethod, i.Hidden = game.InstanceID(id), game.ID(g), game.DeploymentMethod(method), hidden != 0
	return i, nil
}

func (r *GameInstanceRepository) targets(ctx context.Context, id game.InstanceID) ([]game.Target, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT target_id, path FROM instance_targets WHERE instance_id = ? ORDER BY position`, string(id))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []game.Target
	for rows.Next() {
		var t game.Target
		var tid string
		if err := rows.Scan(&tid, &t.Path); err != nil {
			return nil, err
		}
		t.ID = game.TargetID(tid)
		out = append(out, t)
	}
	return out, rows.Err()
}

// Get returns ports.ErrNotFound for an unknown instance.
func (r *GameInstanceRepository) Get(ctx context.Context, id game.InstanceID) (game.Instance, error) {
	i, err := scanInstance(r.db.QueryRowContext(ctx, `SELECT `+instanceColumns+` FROM game_instances WHERE id = ?`, string(id)))
	if errors.Is(err, sql.ErrNoRows) {
		return game.Instance{}, ports.ErrNotFound
	}
	if err != nil {
		return game.Instance{}, fmt.Errorf("sqlite: get instance %s: %w", id, err)
	}
	if i.Targets, err = r.targets(ctx, id); err != nil {
		return game.Instance{}, fmt.Errorf("sqlite: instance targets %s: %w", id, err)
	}
	return i, nil
}

// List returns every instance ordered by name.
func (r *GameInstanceRepository) List(ctx context.Context) ([]game.Instance, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+instanceColumns+` FROM game_instances ORDER BY display_name COLLATE NOCASE, id`)
	if err != nil {
		return nil, fmt.Errorf("sqlite: list instances: %w", err)
	}
	var out []game.Instance
	for rows.Next() {
		i, err := scanInstance(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, i)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close() // the single connection must be free before the next queries
	for n := range out {
		if out[n].Targets, err = r.targets(ctx, out[n].ID); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Save inserts or updates an instance and replaces its targets in one
// transaction. The instance is validated first.
func (r *GameInstanceRepository) Save(ctx context.Context, i game.Instance) error {
	if err := i.Validate(); err != nil {
		return err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	hidden := 0
	if i.Hidden {
		hidden = 1
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO game_instances (`+instanceColumns+`, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			game = excluded.game, adapter = excluded.adapter, adapter_version = excluded.adapter_version,
			display_name = excluded.display_name, root = excluded.root, staging = excluded.staging,
			archive_store = excluded.archive_store, backup_store = excluded.backup_store,
			preferred_method = excluded.preferred_method, store = excluded.store,
			executable = excluded.executable, hidden = excluded.hidden, updated_at = excluded.updated_at`,
		string(i.ID), string(i.Game), i.Adapter, i.AdapterVersion, i.DisplayName, i.Root, i.Staging,
		i.ArchiveStore, i.BackupStore, string(i.PreferredMethod), i.Store, i.Executable, hidden,
		r.now().Format(timeLayout)); err != nil {
		return fmt.Errorf("sqlite: save instance %s: %w", i.ID, err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM instance_targets WHERE instance_id = ?`, string(i.ID)); err != nil {
		return err
	}
	for pos, t := range i.Targets {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO instance_targets (instance_id, position, target_id, path) VALUES (?, ?, ?, ?)`,
			string(i.ID), pos, string(t.ID), t.Path); err != nil {
			return fmt.Errorf("sqlite: save target %s: %w", t.ID, err)
		}
	}
	return tx.Commit()
}

// Delete removes the instance; its targets, profiles, snapshots and applied
// state go with it (foreign keys cascade).
func (r *GameInstanceRepository) Delete(ctx context.Context, id game.InstanceID) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM game_instances WHERE id = ?`, string(id))
	if err != nil {
		return fmt.Errorf("sqlite: delete instance %s: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ports.ErrNotFound
	}
	return nil
}

// DeploymentState implements ports.DeploymentState over the manifests table.
type DeploymentState struct{ db *sql.DB }

var _ ports.DeploymentState = DeploymentState{}

// NewDeploymentState returns the reader.
func NewDeploymentState(db *sql.DB) DeploymentState { return DeploymentState{db: db} }

// Deployed reports whether the manager has anything in the game: a manifest
// with entries. A complete purge leaves none.
func (d DeploymentState) Deployed(ctx context.Context, id game.InstanceID) (bool, error) {
	var n int
	err := d.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM deployment_manifests WHERE instance_id = ? AND entry_count > 0`, string(id)).Scan(&n)
	return n > 0, err
}

// AppState implements ports.AppState.
type AppState struct {
	db  *sql.DB
	now func() time.Time
}

var _ ports.AppState = AppState{}

// NewAppState returns the repository.
func NewAppState(db *sql.DB) AppState {
	return AppState{db: db, now: func() time.Time { return time.Now().UTC() }}
}

func (a AppState) Get(ctx context.Context, key string) (string, error) {
	var v string
	err := a.db.QueryRowContext(ctx, `SELECT value FROM app_state WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ports.ErrNotFound
	}
	return v, err
}

func (a AppState) Set(ctx context.Context, key, value string) error {
	_, err := a.db.ExecContext(ctx, `
		INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, a.now().Format(timeLayout))
	return err
}

func (a AppState) Delete(ctx context.Context, key string) error {
	_, err := a.db.ExecContext(ctx, `DELETE FROM app_state WHERE key = ?`, key)
	return err
}
