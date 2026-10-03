package sqlite

import (
	"context"
	"database/sql"
)

// Facts answers the first-steps checklist of the Dashboard (ui/02 F-01)
// from what the database already records; nothing is stored for it.
type Facts struct{ q querier }

// NewFacts wires the queries.
func NewFacts(db *sql.DB) *Facts { return &Facts{q: db} }

// Launched reports whether a game was ever launched from the app.
func (f *Facts) Launched(ctx context.Context) (bool, error) {
	return f.exists(ctx, `SELECT EXISTS(SELECT 1 FROM events WHERE type = 'game.launched')`)
}

// Deployed reports whether any instance was deployed: a manifest exists,
// or a deploy was recorded (a purge keeps the step done).
func (f *Facts) Deployed(ctx context.Context) (bool, error) {
	return f.exists(ctx, `SELECT EXISTS(SELECT 1 FROM deployment_manifests) OR EXISTS(SELECT 1 FROM events WHERE type = 'deployment.applied')`)
}

func (f *Facts) exists(ctx context.Context, q string) (bool, error) {
	var n int
	err := f.q.QueryRowContext(ctx, q).Scan(&n)
	return n != 0, err
}
