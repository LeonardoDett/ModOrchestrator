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
