package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/operation"
)

// GameSettingsRepository implements ports.GameSettings (D142).
type GameSettingsRepository struct{ db querier }

var _ ports.GameSettings = (*GameSettingsRepository)(nil)

// NewGameSettingsRepository returns a repository over an opened database.
func NewGameSettingsRepository(db *sql.DB) *GameSettingsRepository {
	return &GameSettingsRepository{db: db}
}

type valueRecord struct {
	Present bool   `json:"present"`
	Text    string `json:"text,omitempty"`
}

type keyRecord struct {
	Folder         string       `json:"folder"`
	Path           string       `json:"path"`
	Section        string       `json:"section"`
	Key            string       `json:"key"`
	Original       valueRecord  `json:"original"`
	OriginalBackup string       `json:"originalBackup,omitempty"`
	Written        valueRecord  `json:"written"`
	Pending        *valueRecord `json:"pending,omitempty"`
	Profile        string       `json:"profile,omitempty"`
	Operation      string       `json:"operation,omitempty"`
	AppliedAt      time.Time    `json:"appliedAt"`
}

func toValueRecord(v gamesettings.Value) valueRecord {
	return valueRecord{Present: v.Present, Text: v.Text}
}
func (v valueRecord) value() gamesettings.Value {
	return gamesettings.Value{Present: v.Present, Text: v.Text}
}

func (r *GameSettingsRepository) Key(ctx context.Context, instance game.InstanceID, owner string) (*gamesettings.KeyRecord, error) {
	var body string
	err := r.db.QueryRowContext(ctx, `SELECT body_json FROM applied_game_settings WHERE instance_id = ? AND owner = ?`, string(instance), owner).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var rec keyRecord
	if err := json.Unmarshal([]byte(body), &rec); err != nil {
		return nil, fmt.Errorf("sqlite: decode game settings record: %w", err)
	}
	out := &gamesettings.KeyRecord{
		Instance: instance, Owner: owner, Folder: rec.Folder, Path: rec.Path, Section: rec.Section, Key: rec.Key,
		Original: rec.Original.value(), OriginalBackup: rec.OriginalBackup, Written: rec.Written.value(),
		Profile: rec.Profile, Operation: operation.ID(rec.Operation), AppliedAt: rec.AppliedAt,
	}
	if rec.Pending != nil {
		v := rec.Pending.value()
		out.Pending = &v
	}
	return out, nil
}

func (r *GameSettingsRepository) SaveKey(ctx context.Context, k *gamesettings.KeyRecord) error {
	rec := keyRecord{
		Folder: k.Folder, Path: k.Path, Section: k.Section, Key: k.Key,
		Original: toValueRecord(k.Original), OriginalBackup: k.OriginalBackup, Written: toValueRecord(k.Written),
		Profile: k.Profile, Operation: string(k.Operation), AppliedAt: k.AppliedAt.UTC(),
	}
	if k.Pending != nil {
		v := toValueRecord(*k.Pending)
		rec.Pending = &v
	}
	body, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO applied_game_settings (instance_id, owner, body_json) VALUES (?, ?, ?)
		ON CONFLICT(instance_id, owner) DO UPDATE SET body_json = excluded.body_json`, string(k.Instance), k.Owner, string(body))
	return err
}
