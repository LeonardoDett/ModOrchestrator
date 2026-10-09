package sqlite

import (
	"context"
	"database/sql"
)

// querier is what a repository needs; both *sql.DB and *sql.Tx satisfy it,
// so the same repository serves plain reads and units of work (D064).
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// inTx runs fn in a transaction of its own when q is the database, or in
// the caller's transaction when q already is one.
func inTx(ctx context.Context, q querier, fn func(q querier) error) error {
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
