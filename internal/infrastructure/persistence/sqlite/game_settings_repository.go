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
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
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

func (r *GameSettingsRepository) Keys(ctx context.Context, instance game.InstanceID) ([]*gamesettings.KeyRecord, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT owner FROM applied_game_settings WHERE instance_id = ? ORDER BY owner`, string(instance))
	if err != nil {
		return nil, err
	}
	var owners []string
	for rows.Next() {
		var o string
		if err := rows.Scan(&o); err != nil {
			rows.Close()
			return nil, err
		}
		owners = append(owners, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]*gamesettings.KeyRecord, 0, len(owners))
	for _, o := range owners {
		k, err := r.Key(ctx, instance, o)
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, nil
}

func (r *GameSettingsRepository) DeleteKey(ctx context.Context, instance game.InstanceID, owner string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM applied_game_settings WHERE instance_id = ? AND owner = ?`, string(instance), owner)
	return err
}

type settingsFileRecord struct {
	Folder         string    `json:"folder"`
	Path           string    `json:"path"`
	Profile        string    `json:"profile,omitempty"`
	Shared         []byte    `json:"shared,omitempty"`
	SharedPresent  bool      `json:"sharedPresent,omitempty"`
	WrittenHash    string    `json:"writtenHash,omitempty"`
	PendingHash    string    `json:"pendingHash,omitempty"`
	PendingProfile string    `json:"pendingProfile,omitempty"`
	OriginalBackup string    `json:"originalBackup,omitempty"`
	Operation      string    `json:"operation,omitempty"`
	AppliedAt      time.Time `json:"appliedAt"`
}

func (r *GameSettingsRepository) File(ctx context.Context, instance game.InstanceID, path string) (*gamesettings.FileRecord, error) {
	var body string
	err := r.db.QueryRowContext(ctx, `SELECT body_json FROM applied_game_setting_files WHERE instance_id = ? AND path = ?`, string(instance), path).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var rec settingsFileRecord
	if err := json.Unmarshal([]byte(body), &rec); err != nil {
		return nil, fmt.Errorf("sqlite: decode game settings file record: %w", err)
	}
	return &gamesettings.FileRecord{
		Instance: instance, Folder: rec.Folder, Path: rec.Path, Profile: rec.Profile,
		Shared: rec.Shared, SharedPresent: rec.SharedPresent, WrittenHash: rec.WrittenHash, PendingHash: rec.PendingHash, PendingProfile: rec.PendingProfile,
		OriginalBackup: rec.OriginalBackup, Operation: operation.ID(rec.Operation), AppliedAt: rec.AppliedAt,
	}, nil
}

func (r *GameSettingsRepository) SaveFile(ctx context.Context, f *gamesettings.FileRecord) error {
	body, err := json.Marshal(settingsFileRecord{
		Folder: f.Folder, Path: f.Path, Profile: f.Profile, Shared: f.Shared, SharedPresent: f.SharedPresent,
		WrittenHash: f.WrittenHash, PendingHash: f.PendingHash, PendingProfile: f.PendingProfile, OriginalBackup: f.OriginalBackup,
		Operation: string(f.Operation), AppliedAt: f.AppliedAt.UTC(),
	})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO applied_game_setting_files (instance_id, path, body_json) VALUES (?, ?, ?)
		ON CONFLICT(instance_id, path) DO UPDATE SET body_json = excluded.body_json`, string(f.Instance), f.Path, string(body))
	return err
}

func (r *GameSettingsRepository) Copies(ctx context.Context, p profile.ID) ([]gamesettings.Copy, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT path, present, content, updated_at FROM profile_game_settings WHERE profile_id = ? ORDER BY path`, string(p))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []gamesettings.Copy
	for rows.Next() {
		var (
			c       gamesettings.Copy
			present int
			updated string
		)
		if err := rows.Scan(&c.Path, &present, &c.Content, &updated); err != nil {
			return nil, err
		}
		c.Profile, c.Present = string(p), present != 0
		c.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updated)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *GameSettingsRepository) SaveCopy(ctx context.Context, c gamesettings.Copy) error {
	present := 0
	if c.Present {
		present = 1
	}
	content := c.Content
	if content == nil {
		content = []byte{}
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO profile_game_settings (profile_id, path, present, content, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(profile_id, path) DO UPDATE SET present = excluded.present, content = excluded.content, updated_at = excluded.updated_at`,
		c.Profile, c.Path, present, content, c.UpdatedAt.UTC().Format(time.RFC3339Nano))
	return err
}

func (r *GameSettingsRepository) Tweaks(ctx context.Context, instance game.InstanceID) (map[mod.ID][]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT mod_id, path FROM ini_tweak_choices WHERE instance_id = ? ORDER BY mod_id, path`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[mod.ID][]string{}
	for rows.Next() {
		var m, p string
		if err := rows.Scan(&m, &p); err != nil {
			return nil, err
		}
		out[mod.ID(m)] = append(out[mod.ID(m)], p)
	}
	return out, rows.Err()
}

func (r *GameSettingsRepository) SetTweak(ctx context.Context, instance game.InstanceID, m mod.ID, path string, on bool) error {
	var err error
	if on {
		_, err = r.db.ExecContext(ctx, `INSERT OR IGNORE INTO ini_tweak_choices (instance_id, mod_id, path) VALUES (?, ?, ?)`, string(instance), string(m), path)
	} else {
		_, err = r.db.ExecContext(ctx, `DELETE FROM ini_tweak_choices WHERE instance_id = ? AND mod_id = ? AND path = ?`, string(instance), string(m), path)
	}
	return err
}
