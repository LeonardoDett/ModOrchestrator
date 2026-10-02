package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deployment"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/relpath"
)

// ManifestRepository implements ports.Manifests: a header row plus one row
// per entry (migration 0005), so saving after a small deploy writes only the
// entries that changed.
type ManifestRepository struct{ db querier }

var _ ports.Manifests = (*ManifestRepository)(nil)

// NewManifestRepository returns a repository over an opened database.
func NewManifestRepository(db *sql.DB) *ManifestRepository { return &ManifestRepository{db: db} }

type evidenceRecord struct {
	FileID     string    `json:"fileId,omitempty"`
	LinkTarget string    `json:"linkTarget,omitempty"`
	Size       int64     `json:"size,omitempty"`
	ModTime    time.Time `json:"modTime,omitempty"`
	Hash       string    `json:"hash,omitempty"`
}

// entryRecord is the JSON form of an entry inside journal actions.
type entryRecord struct {
	Target       string         `json:"target"`
	Path         string         `json:"path"`
	Kind         string         `json:"kind"`
	Mod          string         `json:"mod,omitempty"`
	Installation string         `json:"installation,omitempty"`
	Source       string         `json:"source,omitempty"`
	Method       string         `json:"method,omitempty"`
	BackupPath   string         `json:"backupPath,omitempty"`
	Evidence     evidenceRecord `json:"evidence"`
}

func toEvidenceRecord(e deployment.Evidence) evidenceRecord {
	return evidenceRecord{FileID: e.FileID, LinkTarget: e.LinkTarget, Size: e.Size, ModTime: e.ModTime.UTC(), Hash: e.Hash}
}

func (r evidenceRecord) evidence() deployment.Evidence {
	return deployment.Evidence{FileID: r.FileID, LinkTarget: r.LinkTarget, Size: r.Size, ModTime: r.ModTime, Hash: r.Hash}
}

func toEntryRecord(e deployment.Entry) entryRecord {
	r := entryRecord{
		Target: string(e.Location.Target), Path: e.Location.Path.String(), Kind: string(e.Kind), Mod: string(e.Mod),
		Installation: string(e.Installation), Method: string(e.Method), Evidence: toEvidenceRecord(e.Evidence),
	}
	if !e.Source.IsZero() {
		r.Source = e.Source.String()
	}
	if !e.BackupPath.IsZero() {
		r.BackupPath = e.BackupPath.String()
	}
	return r
}

func optionalPath(s string) (relpath.Path, error) {
	if s == "" {
		return relpath.Path{}, nil
	}
	return relpath.Parse(s)
}

func (r entryRecord) entry() (deployment.Entry, error) {
	p, err := relpath.Parse(r.Path)
	if err != nil {
		return deployment.Entry{}, fmt.Errorf("sqlite: entry path %q: %w", r.Path, err)
	}
	src, err := optionalPath(r.Source)
	if err != nil {
		return deployment.Entry{}, err
	}
	bp, err := optionalPath(r.BackupPath)
	if err != nil {
		return deployment.Entry{}, err
	}
	return deployment.Entry{
		Location: game.Location{Target: game.TargetID(r.Target), Path: p}, Kind: deployment.EntryKind(r.Kind),
		Mod: mod.ID(r.Mod), Installation: mod.InstallationID(r.Installation), Source: src,
		Method: game.DeploymentMethod(r.Method), Evidence: r.Evidence.evidence(), BackupPath: bp,
	}, nil
}

func entryKey(e deployment.Entry) string { return string(e.Kind) + "|" + e.Location.Key() }

func (r *ManifestRepository) Header(ctx context.Context, instance game.InstanceID) (deployment.Header, error) {
	var (
		h                        deployment.Header
		prof, fp, op, appliedRaw string
	)
	err := r.db.QueryRowContext(ctx, `
		SELECT profile_id, fingerprint, operation_id, applied_at, entry_count
		FROM deployment_manifests WHERE instance_id = ?`, string(instance)).Scan(&prof, &fp, &op, &appliedRaw, &h.Entries)
	if errors.Is(err, sql.ErrNoRows) {
		return deployment.Header{}, ports.ErrNotFound
	}
	if err != nil {
		return deployment.Header{}, err
	}
	at, err := parseTime(appliedRaw)
	if err != nil {
		return deployment.Header{}, err
	}
	h.Instance, h.Profile, h.Fingerprint, h.Operation, h.AppliedAt = instance, deployment.ProfileID(prof), deployment.Fingerprint(fp), operation.ID(op), at
	return h, nil
}

func (r *ManifestRepository) Current(ctx context.Context, instance game.InstanceID) (*deployment.Manifest, error) {
	h, err := r.Header(ctx, instance)
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT kind, target, path, mod_id, installation_id, source, method, backup_path, evidence_json
		FROM deployment_entries WHERE instance_id = ?`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []deployment.Entry
	for rows.Next() {
		var rec entryRecord
		var ev string
		if err := rows.Scan(&rec.Kind, &rec.Target, &rec.Path, &rec.Mod, &rec.Installation, &rec.Source, &rec.Method, &rec.BackupPath, &ev); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(ev), &rec.Evidence); err != nil {
			return nil, fmt.Errorf("sqlite: decode evidence: %w", err)
		}
		e, err := rec.entry()
		if err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if h.Purged() && len(entries) == 0 {
		return deployment.NewPurged(instance, h.Operation, h.AppliedAt)
	}
	return deployment.NewManifest(instance, h.Profile, h.Fingerprint, h.Operation, h.AppliedAt, entries)
}

func (r *ManifestRepository) Save(ctx context.Context, m, prev *deployment.Manifest) error {
	if prev != nil && prev.Instance != m.Instance {
		return fmt.Errorf("sqlite: previous manifest belongs to %s, not %s", prev.Instance, m.Instance)
	}
	entries := m.Entries()
	if _, err := r.db.ExecContext(ctx, `
		INSERT INTO deployment_manifests (instance_id, profile_id, fingerprint, operation_id, applied_at, entry_count)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(instance_id) DO UPDATE SET profile_id = excluded.profile_id, fingerprint = excluded.fingerprint,
			operation_id = excluded.operation_id, applied_at = excluded.applied_at, entry_count = excluded.entry_count`,
		string(m.Instance), string(m.Profile), string(m.Fingerprint), string(m.Operation), formatTime(m.AppliedAt), len(entries)); err != nil {
		return fmt.Errorf("sqlite: save manifest: %w", err)
	}
	old := map[string]deployment.Entry{}
	if prev != nil {
		for _, e := range prev.Entries() {
			old[entryKey(e)] = e
		}
	} else if _, err := r.db.ExecContext(ctx, `DELETE FROM deployment_entries WHERE instance_id = ?`, string(m.Instance)); err != nil {
		return err
	}
	for _, e := range entries {
		k := entryKey(e)
		if before, ok := old[k]; ok {
			delete(old, k)
			if sameEntry(before, e) {
				continue
			}
		}
		rec := toEntryRecord(e)
		ev, err := json.Marshal(rec.Evidence)
		if err != nil {
			return err
		}
		if _, err := r.db.ExecContext(ctx, `
			INSERT INTO deployment_entries (instance_id, kind, location_key, target, path, mod_id, installation_id, source, method, backup_path, evidence_json)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(instance_id, kind, location_key) DO UPDATE SET target = excluded.target, path = excluded.path,
				mod_id = excluded.mod_id, installation_id = excluded.installation_id, source = excluded.source,
				method = excluded.method, backup_path = excluded.backup_path, evidence_json = excluded.evidence_json`,
			string(m.Instance), rec.Kind, e.Location.Key(), rec.Target, rec.Path, rec.Mod, rec.Installation, rec.Source, rec.Method, rec.BackupPath, string(ev)); err != nil {
			return fmt.Errorf("sqlite: save entry %s: %w", e.Location, err)
		}
	}
	for _, e := range old {
		if _, err := r.db.ExecContext(ctx, `DELETE FROM deployment_entries WHERE instance_id = ? AND kind = ? AND location_key = ?`,
			string(m.Instance), string(e.Kind), e.Location.Key()); err != nil {
			return err
		}
	}
	return nil
}

func sameEntry(a, b deployment.Entry) bool {
	ra, rb := toEntryRecord(a), toEntryRecord(b)
	return ra.Target == rb.Target && ra.Path == rb.Path && ra.Mod == rb.Mod && ra.Installation == rb.Installation &&
		ra.Source == rb.Source && ra.Method == rb.Method && ra.BackupPath == rb.BackupPath &&
		ra.Evidence.FileID == rb.Evidence.FileID && ra.Evidence.LinkTarget == rb.Evidence.LinkTarget &&
		ra.Evidence.Size == rb.Evidence.Size && ra.Evidence.ModTime.Equal(rb.Evidence.ModTime) && ra.Evidence.Hash == rb.Evidence.Hash
}

type loadOrderRecord struct {
	Profile     string    `json:"profile"`
	Order       []string  `json:"order"`
	Enabled     []string  `json:"enabled"`
	FileHash    string    `json:"fileHash"`
	PendingHash string    `json:"pendingHash,omitempty"`
	PrevOrder   []string  `json:"prevOrder,omitempty"`
	PrevEnabled []string  `json:"prevEnabled,omitempty"`
	Original    string    `json:"original,omitempty"`
	Operation   string    `json:"operation"`
	AppliedAt   time.Time `json:"appliedAt"`
}

func (r *ManifestRepository) CurrentLoadOrder(ctx context.Context, instance game.InstanceID) (*deployment.AppliedLoadOrder, error) {
	var body string
	err := r.db.QueryRowContext(ctx, `SELECT body_json FROM applied_load_orders WHERE instance_id = ?`, string(instance)).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var rec loadOrderRecord
	if err := json.Unmarshal([]byte(body), &rec); err != nil {
		return nil, fmt.Errorf("sqlite: decode load order: %w", err)
	}
	lo := &deployment.AppliedLoadOrder{Instance: instance, Profile: deployment.ProfileID(rec.Profile), FileHash: rec.FileHash, PendingHash: rec.PendingHash, Original: rec.Original, Operation: operation.ID(rec.Operation), AppliedAt: rec.AppliedAt}
	lo.Order, lo.Enabled = pluginNames(rec.Order), pluginNames(rec.Enabled)
	lo.PrevOrder, lo.PrevEnabled = pluginNames(rec.PrevOrder), pluginNames(rec.PrevEnabled)
	return lo, nil
}

func (r *ManifestRepository) SaveLoadOrder(ctx context.Context, lo *deployment.AppliedLoadOrder) error {
	rec := loadOrderRecord{Profile: string(lo.Profile), FileHash: lo.FileHash, PendingHash: lo.PendingHash, Original: lo.Original, Operation: string(lo.Operation), AppliedAt: lo.AppliedAt.UTC()}
	rec.Order, rec.Enabled = nameStrings(lo.Order), nameStrings(lo.Enabled)
	rec.PrevOrder, rec.PrevEnabled = nameStrings(lo.PrevOrder), nameStrings(lo.PrevEnabled)
	body, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO applied_load_orders (instance_id, body_json) VALUES (?, ?)
		ON CONFLICT(instance_id) DO UPDATE SET body_json = excluded.body_json`, string(lo.Instance), string(body))
	return err
}

// JournalRepository implements ports.Journals.
type JournalRepository struct{ db querier }

var _ ports.Journals = (*JournalRepository)(nil)

// NewJournalRepository returns a repository over an opened database.
func NewJournalRepository(db *sql.DB) *JournalRepository { return &JournalRepository{db: db} }

type actionRecord struct {
	Kind    string       `json:"kind"`
	Target  string       `json:"target"`
	Path    string       `json:"path"`
	Desired *entryRecord `json:"desired,omitempty"`
	Current *entryRecord `json:"current,omitempty"`
	Backup  *entryRecord `json:"backup,omitempty"`
}

func optionalEntryRecord(e *deployment.Entry) *entryRecord {
	if e == nil {
		return nil
	}
	r := toEntryRecord(*e)
	return &r
}

func optionalEntry(r *entryRecord) (*deployment.Entry, error) {
	if r == nil {
		return nil, nil
	}
	e, err := r.entry()
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *JournalRepository) Save(ctx context.Context, j *deployment.Journal) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM deployment_journals WHERE instance_id = ?`, string(j.Instance)); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, `
		INSERT INTO deployment_journals (instance_id, operation_id, kind, profile_id, fingerprint, started_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		string(j.Instance), string(j.Operation), string(j.Kind), string(j.Profile), string(j.Fingerprint), formatTime(j.StartedAt)); err != nil {
		return fmt.Errorf("sqlite: save journal: %w", err)
	}
	states := j.States()
	for i, a := range j.Actions {
		body, err := json.Marshal(actionRecord{
			Kind: string(a.Kind), Target: string(a.Location.Target), Path: a.Location.Path.String(),
			Desired: optionalEntryRecord(a.Desired), Current: optionalEntryRecord(a.Current), Backup: optionalEntryRecord(a.Backup),
		})
		if err != nil {
			return err
		}
		if _, err := r.db.ExecContext(ctx, `INSERT INTO deployment_journal_actions (instance_id, idx, action_json, state) VALUES (?, ?, ?, ?)`,
			string(j.Instance), i, string(body), string(states[i])); err != nil {
			return fmt.Errorf("sqlite: save journal action: %w", err)
		}
	}
	return nil
}

func (r *JournalRepository) Pending(ctx context.Context, instance game.InstanceID) (*deployment.Journal, error) {
	var (
		j                           deployment.Journal
		op, kind, prof, fp, started string
	)
	err := r.db.QueryRowContext(ctx, `
		SELECT operation_id, kind, profile_id, fingerprint, started_at FROM deployment_journals WHERE instance_id = ?`,
		string(instance)).Scan(&op, &kind, &prof, &fp, &started)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	at, err := parseTime(started)
	if err != nil {
		return nil, err
	}
	j.Instance, j.Operation, j.Kind, j.Profile, j.Fingerprint, j.StartedAt = instance, operation.ID(op), deployment.JournalKind(kind), deployment.ProfileID(prof), deployment.Fingerprint(fp), at
	rows, err := r.db.QueryContext(ctx, `SELECT action_json, state FROM deployment_journal_actions WHERE instance_id = ? ORDER BY idx`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var states []deployment.ActionState
	for rows.Next() {
		var body, state string
		if err := rows.Scan(&body, &state); err != nil {
			return nil, err
		}
		var rec actionRecord
		if err := json.Unmarshal([]byte(body), &rec); err != nil {
			return nil, fmt.Errorf("sqlite: decode journal action: %w", err)
		}
		p, err := relpath.Parse(rec.Path)
		if err != nil {
			return nil, err
		}
		a := deployment.Action{Kind: deployment.ActionKind(rec.Kind), Location: game.Location{Target: game.TargetID(rec.Target), Path: p}}
		if a.Desired, err = optionalEntry(rec.Desired); err != nil {
			return nil, err
		}
		if a.Current, err = optionalEntry(rec.Current); err != nil {
			return nil, err
		}
		if a.Backup, err = optionalEntry(rec.Backup); err != nil {
			return nil, err
		}
		j.Actions = append(j.Actions, a)
		states = append(states, deployment.ActionState(state))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return deployment.RestoreJournal(j, states)
}

func (r *JournalRepository) Mark(ctx context.Context, instance game.InstanceID, states map[int]deployment.ActionState) error {
	for i, s := range states {
		if _, err := r.db.ExecContext(ctx, `UPDATE deployment_journal_actions SET state = ? WHERE instance_id = ? AND idx = ?`,
			string(s), string(instance), i); err != nil {
			return err
		}
	}
	return nil
}

func (r *JournalRepository) Delete(ctx context.Context, instance game.InstanceID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM deployment_journals WHERE instance_id = ?`, string(instance))
	return err
}

func (r *JournalRepository) Instances(ctx context.Context) ([]game.InstanceID, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT instance_id FROM deployment_journals ORDER BY instance_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []game.InstanceID
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, game.InstanceID(id))
	}
	return out, rows.Err()
}

func pluginNames(ss []string) []plugin.Name {
	var out []plugin.Name
	for _, n := range ss {
		out = append(out, plugin.Name(n))
	}
	return out
}

func nameStrings(ns []plugin.Name) []string {
	var out []string
	for _, n := range ns {
		out = append(out, string(n))
	}
	return out
}
