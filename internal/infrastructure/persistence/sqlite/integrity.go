package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"modernc.org/sqlite"
)

// ErrCorrupt marks a database SQLite cannot trust: not a database, a
// failed integrity check or a corrupt page met by a query (core/14 §5).
var ErrCorrupt = errors.New("sqlite: database is corrupt")

// ErrNewerSchema marks a database written by a newer build (core/14 §2).
var ErrNewerSchema = errors.New("sqlite: database schema is newer than this build")

// ErrMigration marks a migration that failed: its transaction rolled back
// and the database stays at the previous version.
var ErrMigration = errors.New("sqlite: migration failed")

// SQLite primary result codes (the low byte of an extended code).
const (
	codeCorrupt = 11
	codeNotADB  = 26
)

// IsCorrupt reports whether err says the database file is damaged.
func IsCorrupt(err error) bool {
	if errors.Is(err, ErrCorrupt) {
		return true
	}
	var e *sqlite.Error
	if errors.As(err, &e) {
		switch e.Code() & 0xff {
		case codeCorrupt, codeNotADB:
			return true
		}
	}
	return false
}

// CheckIntegrity runs PRAGMA integrity_check (core/14 §2: at startup after
// an abnormal close). A damaged database returns ErrCorrupt with the first
// problems SQLite reports.
func CheckIntegrity(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, `PRAGMA integrity_check(20)`)
	if err != nil {
		if IsCorrupt(err) {
			return fmt.Errorf("%w: %v", ErrCorrupt, err)
		}
		return err
	}
	defer rows.Close()
	var lines []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return fmt.Errorf("%w: %v", ErrCorrupt, err)
		}
		lines = append(lines, s)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("%w: %v", ErrCorrupt, err)
	}
	if len(lines) == 1 && lines[0] == "ok" {
		return nil
	}
	return fmt.Errorf("%w: %s", ErrCorrupt, strings.Join(lines, "; "))
}
