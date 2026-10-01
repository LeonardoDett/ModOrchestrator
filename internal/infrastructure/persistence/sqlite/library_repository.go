package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/core/domain/rules"
)

// ModRepository implements ports.Mods. A mod is one JSON document.
type ModRepository struct{ db querier }

var _ ports.Mods = (*ModRepository)(nil)

// NewModRepository returns a repository over an opened database.
func NewModRepository(db *sql.DB) *ModRepository { return &ModRepository{db: db} }

func (r *ModRepository) Get(ctx context.Context, id mod.ID) (*mod.Mod, error) {
	var data string
	err := r.db.QueryRowContext(ctx, `SELECT data_json FROM mods WHERE id = ?`, string(id)).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeMod(data)
}

func (r *ModRepository) ListByInstance(ctx context.Context, instance game.InstanceID) ([]*mod.Mod, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT data_json FROM mods WHERE instance_id = ? ORDER BY id`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*mod.Mod
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		m, err := decodeMod(data)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *ModRepository) Save(ctx context.Context, m *mod.Mod) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO mods (id, instance_id, state, data_json, updated_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET state = excluded.state, data_json = excluded.data_json, updated_at = excluded.updated_at`,
		string(m.ID), string(m.Instance), string(m.State), string(b), formatTime(m.UpdatedAt))
	if err != nil {
		return fmt.Errorf("sqlite: save mod %s: %w", m.ID, err)
	}
	return nil
}

func decodeMod(data string) (*mod.Mod, error) {
	var m mod.Mod
	if err := json.Unmarshal([]byte(data), &m); err != nil {
		return nil, fmt.Errorf("sqlite: decode mod: %w", err)
	}
	if m.ID == "" || m.Instance == "" {
		return nil, fmt.Errorf("sqlite: decode mod: missing identity")
	}
	return &m, nil
}

// ArchiveRepository implements ports.Archives.
type ArchiveRepository struct{ db querier }

var _ ports.Archives = (*ArchiveRepository)(nil)

// NewArchiveRepository returns a repository over an opened database.
func NewArchiveRepository(db *sql.DB) *ArchiveRepository { return &ArchiveRepository{db: db} }

const archiveColumns = `id, instance_id, original_name, kind, size, hash, stored, imported_at`

func scanArchive(row interface{ Scan(...any) error }) (*mod.Archive, error) {
	var id, instance, name, kind, hash, stored, imported string
	var size int64
	if err := row.Scan(&id, &instance, &name, &kind, &size, &hash, &stored, &imported); err != nil {
		return nil, err
	}
	var st relpath.Path
	if stored != "" {
		p, err := relpath.Parse(stored)
		if err != nil {
			return nil, fmt.Errorf("sqlite: archive %s stored path: %w", id, err)
		}
		st = p
	}
	at, err := parseTime(imported)
	if err != nil {
		return nil, err
	}
	return mod.NewArchive(mod.ArchiveID(id), game.InstanceID(instance), name, mod.ArchiveKind(kind), size, hash, st, at)
}

func (r *ArchiveRepository) Get(ctx context.Context, id mod.ArchiveID) (*mod.Archive, error) {
	a, err := scanArchive(r.db.QueryRowContext(ctx, `SELECT `+archiveColumns+` FROM archives WHERE id = ?`, string(id)))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	return a, err
}

func (r *ArchiveRepository) ByHash(ctx context.Context, instance game.InstanceID, hash string) ([]*mod.Archive, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+archiveColumns+` FROM archives WHERE instance_id = ? AND hash = ? ORDER BY imported_at, id`,
		string(instance), hash)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*mod.Archive
	for rows.Next() {
		a, err := scanArchive(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *ArchiveRepository) Save(ctx context.Context, a *mod.Archive) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO archives (`+archiveColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET original_name = excluded.original_name, stored = excluded.stored`,
		string(a.ID), string(a.Instance), a.OriginalName, string(a.Kind), a.Size, a.Hash, a.Stored.String(), formatTime(a.ImportedAt))
	if err != nil {
		return fmt.Errorf("sqlite: save archive %s: %w", a.ID, err)
	}
	return nil
}

func (r *ArchiveRepository) Delete(ctx context.Context, id mod.ArchiveID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM archives WHERE id = ?`, string(id))
	return err
}

// InstallationRepository implements ports.Installations.
type InstallationRepository struct{ db querier }

var _ ports.Installations = (*InstallationRepository)(nil)

// NewInstallationRepository returns a repository over an opened database.
func NewInstallationRepository(db *sql.DB) *InstallationRepository {
	return &InstallationRepository{db: db}
}

type fileRecord struct {
	Source string `json:"s"`
	Target string `json:"t"`
	Path   string `json:"p"`
	Size   int64  `json:"n"`
	Hash   string `json:"h,omitempty"`
}

func (r *InstallationRepository) Get(ctx context.Context, id mod.InstallationID) (*mod.Installation, error) {
	var modID, instance, installer, opts, files, created string
	err := r.db.QueryRowContext(ctx,
		`SELECT mod_id, instance_id, installer, options_json, files_json, created_at FROM installations WHERE id = ?`, string(id)).
		Scan(&modID, &instance, &installer, &opts, &files, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ports.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var options map[string]string
	if err := json.Unmarshal([]byte(opts), &options); err != nil {
		return nil, fmt.Errorf("sqlite: installation %s options: %w", id, err)
	}
	var recs []fileRecord
	if err := json.Unmarshal([]byte(files), &recs); err != nil {
		return nil, fmt.Errorf("sqlite: installation %s files: %w", id, err)
	}
	out := make([]mod.File, len(recs))
	for i, f := range recs {
		src, err := relpath.Parse(f.Source)
		if err != nil {
			return nil, err
		}
		dst, err := relpath.Parse(f.Path)
		if err != nil {
			return nil, err
		}
		out[i] = mod.File{Source: src, Dest: game.Location{Target: game.TargetID(f.Target), Path: dst}, Size: f.Size, Hash: f.Hash}
	}
	at, err := parseTime(created)
	if err != nil {
		return nil, err
	}
	return mod.NewInstallation(id, mod.ID(modID), game.InstanceID(instance), installer, options, out, at)
}

func (r *InstallationRepository) Save(ctx context.Context, inst *mod.Installation) error {
	var total int64
	recs := make([]fileRecord, len(inst.Files))
	for i, f := range inst.Files {
		total += f.Size
		recs[i] = fileRecord{Source: f.Source.String(), Target: string(f.Dest.Target), Path: f.Dest.Path.String(), Size: f.Size, Hash: f.Hash}
	}
	files, err := json.Marshal(recs)
	if err != nil {
		return err
	}
	opts := inst.Options
	if opts == nil {
		opts = map[string]string{}
	}
	optsJSON, err := json.Marshal(opts)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO installations (id, mod_id, instance_id, installer, options_json, files_json, file_count, total_size, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		string(inst.ID), string(inst.Mod), string(inst.Instance), inst.Installer, string(optsJSON), string(files),
		len(inst.Files), total, formatTime(inst.CreatedAt))
	if err != nil {
		return fmt.Errorf("sqlite: save installation %s: %w", inst.ID, err)
	}
	return nil
}

func (r *InstallationRepository) Delete(ctx context.Context, id mod.InstallationID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM installations WHERE id = ?`, string(id))
	return err
}

// CategoryRepository implements ports.Categories.
type CategoryRepository struct{ db querier }

var _ ports.Categories = (*CategoryRepository)(nil)

// NewCategoryRepository returns a repository over an opened database.
func NewCategoryRepository(db *sql.DB) *CategoryRepository { return &CategoryRepository{db: db} }

func (r *CategoryRepository) List(ctx context.Context, instance game.InstanceID) ([]mod.Category, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, parent, position FROM categories WHERE instance_id = ? ORDER BY parent, position, name`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []mod.Category
	for rows.Next() {
		c := mod.Category{Instance: instance}
		var id, parent string
		if err := rows.Scan(&id, &c.Name, &parent, &c.Order); err != nil {
			return nil, err
		}
		c.ID, c.Parent = mod.CategoryID(id), mod.CategoryID(parent)
		out = append(out, c)
	}
	return out, rows.Err()
}

// Replace stores the whole tree. Within a unit of work it is atomic; on a
// plain database it runs in its own transaction.
func (r *CategoryRepository) Replace(ctx context.Context, instance game.InstanceID, tree []mod.Category) error {
	return withTx(ctx, r.db, func(q querier) error {
		if _, err := q.ExecContext(ctx, `DELETE FROM categories WHERE instance_id = ?`, string(instance)); err != nil {
			return err
		}
		for _, c := range tree {
			if _, err := q.ExecContext(ctx, `INSERT INTO categories (instance_id, id, name, parent, position) VALUES (?, ?, ?, ?, ?)`,
				string(instance), string(c.ID), c.Name, string(c.Parent), c.Order); err != nil {
				return fmt.Errorf("sqlite: save category %s: %w", c.ID, err)
			}
		}
		return nil
	})
}

// RuleRepository implements ports.Rules as one document per instance.
type RuleRepository struct{ db querier }

var _ ports.Rules = (*RuleRepository)(nil)

// NewRuleRepository returns a repository over an opened database.
func NewRuleRepository(db *sql.DB) *RuleRepository { return &RuleRepository{db: db} }

// Get returns an empty set when the instance has no rules yet.
func (r *RuleRepository) Get(ctx context.Context, instance game.InstanceID) (*rules.Set, error) {
	var data string
	err := r.db.QueryRowContext(ctx, `SELECT data_json FROM instance_rules WHERE instance_id = ?`, string(instance)).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return rules.New(instance)
	}
	if err != nil {
		return nil, err
	}
	var d rules.Data
	if err := json.Unmarshal([]byte(data), &d); err != nil {
		return nil, fmt.Errorf("sqlite: decode rules: %w", err)
	}
	return rules.Restore(d)
}

func (r *RuleRepository) Save(ctx context.Context, s *rules.Set) error {
	b, err := json.Marshal(s.Data())
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO instance_rules (instance_id, data_json) VALUES (?, ?)
		ON CONFLICT(instance_id) DO UPDATE SET data_json = excluded.data_json`, string(s.Instance()), string(b))
	return err
}

// OverrideRepository implements ports.Overrides as one document per instance.
type OverrideRepository struct{ db querier }

var _ ports.Overrides = (*OverrideRepository)(nil)

// NewOverrideRepository returns a repository over an opened database.
func NewOverrideRepository(db *sql.DB) *OverrideRepository { return &OverrideRepository{db: db} }

// Get returns an empty set when the instance has none yet.
func (r *OverrideRepository) Get(ctx context.Context, instance game.InstanceID) (*override.Set, error) {
	var data string
	err := r.db.QueryRowContext(ctx, `SELECT data_json FROM instance_overrides WHERE instance_id = ?`, string(instance)).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return override.New(instance)
	}
	if err != nil {
		return nil, err
	}
	var d override.Data
	if err := json.Unmarshal([]byte(data), &d); err != nil {
		return nil, fmt.Errorf("sqlite: decode overrides: %w", err)
	}
	return override.Restore(d)
}

func (r *OverrideRepository) Save(ctx context.Context, s *override.Set) error {
	b, err := json.Marshal(s.Data())
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO instance_overrides (instance_id, data_json) VALUES (?, ?)
		ON CONFLICT(instance_id) DO UPDATE SET data_json = excluded.data_json`, string(s.Instance()), string(b))
	return err
}

// withTx runs fn inside the current transaction, or in a new one when q is
// the database itself.
func withTx(ctx context.Context, q querier, fn func(querier) error) error {
	db, ok := q.(*sql.DB)
	if !ok {
		return fn(q)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// Summaries returns file count and size of every installation of an
// instance without decoding file lists (Mods screen).
func (r *InstallationRepository) Summaries(ctx context.Context, instance game.InstanceID) (map[mod.InstallationID]ports.InstallationSummary, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, installer, file_count, total_size FROM installations WHERE instance_id = ?`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[mod.InstallationID]ports.InstallationSummary{}
	for rows.Next() {
		var id string
		var sum ports.InstallationSummary
		if err := rows.Scan(&id, &sum.Installer, &sum.Files, &sum.Size); err != nil {
			return nil, err
		}
		out[mod.InstallationID(id)] = sum
	}
	return out, rows.Err()
}
