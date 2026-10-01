// Package sqlite is the persistence adapter backed by an embedded SQLite
// database (pure Go driver, no CGO).
package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// Open opens (creating if needed) the database at path and applies all
// pending migrations. Use ":memory:" for tests.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	pragmas := url.Values{}
	pragmas.Add("_pragma", "foreign_keys(1)")
	pragmas.Add("_pragma", "busy_timeout(5000)")
	if path != ":memory:" {
		pragmas.Add("_pragma", "journal_mode(WAL)")
		// FULL: a committed manifest or journal survives a power cut (core/14 §2).
		pragmas.Add("_pragma", "synchronous(FULL)")
	}
	// The name is part of a URI: "#", "?" and "%" in a folder name would cut
	// or change it.
	name := strings.NewReplacer("%", "%25", "?", "%3F", "#", "%23").Replace(path)
	db, err := sql.Open("sqlite", "file:"+name+"?"+pragmas.Encode())
	if err != nil {
		return nil, fmt.Errorf("sqlite: open %s: %w", path, err)
	}
	// SQLite serializes writers; a single connection avoids SQLITE_BUSY between
	// our own goroutines and keeps ":memory:" databases shared.
	db.SetMaxOpenConns(1)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite: ping: %w", err)
	}
	if err := Migrate(ctx, db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
