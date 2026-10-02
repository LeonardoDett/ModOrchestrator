package sqlite

import (
	"context"
	"database/sql"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/externalchange"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// ExternalDecisionRepository implements ports.ExternalDecisions.
type ExternalDecisionRepository struct{ db querier }

var _ ports.ExternalDecisions = (*ExternalDecisionRepository)(nil)

// NewExternalDecisionRepository returns the repository over an opened
// database.
func NewExternalDecisionRepository(db *sql.DB) *ExternalDecisionRepository {
	return &ExternalDecisionRepository{db: db}
}

func (r *ExternalDecisionRepository) Unmanaged(ctx context.Context, instance game.InstanceID) ([]externalchange.Unmanaged, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT target, path, decided_at FROM external_unmanaged WHERE instance_id = ? ORDER BY location_key`, string(instance))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []externalchange.Unmanaged
	for rows.Next() {
		var target, path, at string
		if err := rows.Scan(&target, &path, &at); err != nil {
			return nil, err
		}
		p, err := relpath.Parse(path)
		if err != nil {
			return nil, err
		}
		t, err := parseTime(at)
		if err != nil {
			return nil, err
		}
		out = append(out, externalchange.Unmanaged{Instance: instance, Location: game.Location{Target: game.TargetID(target), Path: p}, DecidedAt: t})
	}
	return out, rows.Err()
}

func (r *ExternalDecisionRepository) SaveUnmanaged(ctx context.Context, ds ...externalchange.Unmanaged) error {
	for _, d := range ds {
		if _, err := r.db.ExecContext(ctx, `
			INSERT INTO external_unmanaged (instance_id, location_key, target, path, decided_at) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(instance_id, location_key) DO UPDATE SET decided_at = excluded.decided_at`,
			string(d.Instance), d.Location.Key(), string(d.Location.Target), d.Location.Path.String(), formatTime(d.DecidedAt)); err != nil {
			return err
		}
	}
	return nil
}
