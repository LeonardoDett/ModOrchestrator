package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/settings"
)

// SettingsRepository implements ports.Settings.
type SettingsRepository struct {
	db *sql.DB
}

var _ ports.Settings = (*SettingsRepository)(nil)

// NewSettingsRepository returns a repository over an opened database.
func NewSettingsRepository(db *sql.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// Get returns ports.ErrNotFound when the value was never set.
func (r *SettingsRepository) Get(ctx context.Context, scope settings.Scope, scopeID, key string) (settings.Value, error) {
	v := settings.Value{Scope: scope, ScopeID: scopeID, Key: key}
	err := r.db.QueryRowContext(ctx,
		`SELECT value FROM settings WHERE scope = ? AND scope_id = ? AND key = ?`,
		string(scope), scopeID, key).Scan(&v.Value)
	if errors.Is(err, sql.ErrNoRows) {
		return settings.Value{}, ports.ErrNotFound
	}
	if err != nil {
		return settings.Value{}, fmt.Errorf("sqlite: get setting %s: %w", key, err)
	}
	return v, nil
}

// List returns every explicit value of a scope, ordered by key.
func (r *SettingsRepository) List(ctx context.Context, scope settings.Scope, scopeID string) ([]settings.Value, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT key, value FROM settings WHERE scope = ? AND scope_id = ? ORDER BY key`,
		string(scope), scopeID)
	if err != nil {
		return nil, fmt.Errorf("sqlite: list settings: %w", err)
	}
	defer rows.Close()
	var out []settings.Value
	for rows.Next() {
		v := settings.Value{Scope: scope, ScopeID: scopeID}
		if err := rows.Scan(&v.Key, &v.Value); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Save upserts a value that the domain already validated.
func (r *SettingsRepository) Save(ctx context.Context, v settings.Value) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO settings (scope, scope_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT (scope, scope_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		string(v.Scope), v.ScopeID, v.Key, v.Value, time.Now().UTC().Format(timeLayout))
	if err != nil {
		return fmt.Errorf("sqlite: save setting %s: %w", v.Key, err)
	}
	return nil
}

// Reset removes an explicit value, restoring the catalog default.
func (r *SettingsRepository) Reset(ctx context.Context, scope settings.Scope, scopeID, key string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM settings WHERE scope = ? AND scope_id = ? AND key = ?`, string(scope), scopeID, key)
	if err != nil {
		return fmt.Errorf("sqlite: reset setting %s: %w", key, err)
	}
	return nil
}
