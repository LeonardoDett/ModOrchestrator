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
	"modorchestrator/internal/core/domain/profile"
)

// ProfileRepository implements ports.Profiles. A profile is stored as the
// JSON of profile.Data; the aggregate is restored through profile.Restore so
// its invariants hold for whatever was read.
type ProfileRepository struct{ db *sql.DB }

var _ ports.Profiles = (*ProfileRepository)(nil)

// NewProfileRepository returns a repository over an opened database.
func NewProfileRepository(db *sql.DB) *ProfileRepository { return &ProfileRepository{db: db} }

func restoreProfile(data string) (*profile.Profile, error) {
	var d profile.Data
	if err := json.Unmarshal([]byte(data), &d); err != nil {
		return nil, fmt.Errorf("sqlite: decode profile: %w", err)
	}
	return profile.Restore(d)
}

func (r *ProfileRepository) Get(ctx context.Context, id profile.ID) (*profile.Profile, error) {
	var data string
	err := r.db.QueryRowContext(ctx, `SELECT data_json FROM profiles WHERE id = ?`, string(id)).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return restoreProfile(data)
}

func (r *ProfileRepository) ListByInstance(ctx context.Context, instance game.InstanceID) ([]*profile.Profile, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT data_json FROM profiles WHERE instance_id = ? ORDER BY name COLLATE NOCASE, id`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*profile.Profile
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		p, err := restoreProfile(data)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Save upserts the profile. The instance must exist (foreign key).
func (r *ProfileRepository) Save(ctx context.Context, p *profile.Profile) error {
	d := p.Data()
	b, err := json.Marshal(d)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO profiles (id, instance_id, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = excluded.name, data_json = excluded.data_json, updated_at = excluded.updated_at`,
		string(d.ID), string(d.Instance), d.Name, string(b), d.UpdatedAt.UTC().Format(timeLayout))
	if err != nil {
		return fmt.Errorf("sqlite: save profile %s: %w", d.ID, err)
	}
	return nil
}

func (r *ProfileRepository) Delete(ctx context.Context, id profile.ID) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM profiles WHERE id = ?`, string(id))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ports.ErrNotFound
	}
	return nil
}

func (r *ProfileRepository) Active(ctx context.Context, instance game.InstanceID) (profile.ID, error) {
	var id string
	err := r.db.QueryRowContext(ctx, `SELECT profile_id FROM active_profiles WHERE instance_id = ?`, string(instance)).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ports.ErrNotFound
	}
	return profile.ID(id), err
}

// SetActive requires the profile to belong to the instance.
func (r *ProfileRepository) SetActive(ctx context.Context, instance game.InstanceID, id profile.ID) error {
	var owner string
	err := r.db.QueryRowContext(ctx, `SELECT instance_id FROM profiles WHERE id = ?`, string(id)).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return ports.ErrNotFound
	}
	if err != nil {
		return err
	}
	if owner != string(instance) {
		return fmt.Errorf("sqlite: profile %s belongs to another instance", id)
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO active_profiles (instance_id, profile_id) VALUES (?, ?)
		ON CONFLICT(instance_id) DO UPDATE SET profile_id = excluded.profile_id`, string(instance), string(id))
	return err
}

func (r *ProfileRepository) SaveSnapshot(ctx context.Context, s profile.Snapshot) error {
	b, err := json.Marshal(s.State)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO profile_snapshots (id, profile_id, reason, created_at, data_json) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET reason = excluded.reason, data_json = excluded.data_json`,
		string(s.ID), string(s.Profile), string(s.Reason), s.CreatedAt.UTC().Format(timeLayout), string(b))
	return err
}

func (r *ProfileRepository) Snapshots(ctx context.Context, id profile.ID) ([]profile.Snapshot, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, reason, created_at, data_json FROM profile_snapshots WHERE profile_id = ? ORDER BY created_at DESC, id`, string(id))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []profile.Snapshot
	for rows.Next() {
		s := profile.Snapshot{Profile: id}
		var sid, reason, created, data string
		if err := rows.Scan(&sid, &reason, &created, &data); err != nil {
			return nil, err
		}
		s.ID, s.Reason = profile.SnapshotID(sid), profile.SnapshotReason(reason)
		if s.CreatedAt, err = time.Parse(timeLayout, created); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(data), &s.State); err != nil {
			return nil, fmt.Errorf("sqlite: decode snapshot %s: %w", sid, err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *ProfileRepository) DeleteSnapshot(ctx context.Context, id profile.SnapshotID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM profile_snapshots WHERE id = ?`, string(id))
	return err
}
