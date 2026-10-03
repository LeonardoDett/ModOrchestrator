package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"

	"modernc.org/sqlite"
)

// ErrNotDatabase is returned when a file is not a database this build can
// restore: unreadable, corrupt, without the schema table or newer than the
// build (core/14 §4 "validado (schema conhecido)").
var ErrNotDatabase = errors.New("sqlite: not a restorable database")

// Backups copies the database with the SQLite online backup API, which is
// consistent while the app keeps using it (core/14 §3).
type Backups struct{ db *sql.DB }

// NewBackups wires the backup adapter over the open database.
func NewBackups(db *sql.DB) *Backups { return &Backups{db: db} }

type backupConn interface {
	NewBackup(dstURI string) (*sqlite.Backup, error)
}

// Create writes a consistent copy of the open database to dst. The copy is
// written next to dst and renamed at the end, so dst is never a partial
// file.
func (b *Backups) Create(ctx context.Context, dst string) error {
	conn, err := b.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	return copyTo(conn, dst)
}

// Changes is the number of rows changed through the connection since it
// opened (total_changes()); the automatic backup runs only when it moved.
func (b *Backups) Changes(ctx context.Context) (int64, error) {
	var n int64
	err := b.db.QueryRowContext(ctx, `SELECT total_changes()`).Scan(&n)
	return n, err
}

// Inspect validates a database file without changing it: it must open
// read-only, pass integrity_check and have a schema version between 1 and
// this build's. It returns that version.
func (b *Backups) Inspect(ctx context.Context, path string) (int, error) {
	db, err := openReadOnly(path)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrNotDatabase, err)
	}
	defer db.Close()
	var check string
	if err := db.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&check); err != nil || check != "ok" {
		return 0, fmt.Errorf("%w: integrity check: %s %v", ErrNotDatabase, check, err)
	}
	v, err := SchemaVersion(ctx, db)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrNotDatabase, err)
	}
	if v < 1 || v > LatestSchemaVersion() {
		return v, fmt.Errorf("%w: schema v%d (this build: v%d)", ErrNotDatabase, v, LatestSchemaVersion())
	}
	return v, nil
}

// CopyFile copies a database file (validated first) to dst with the backup
// API, so a database with a WAL is copied whole.
func (b *Backups) CopyFile(ctx context.Context, src, dst string) error {
	if _, err := b.Inspect(ctx, src); err != nil {
		return err
	}
	db, err := openReadOnly(src)
	if err != nil {
		return err
	}
	defer db.Close()
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	return copyTo(conn, dst)
}

func copyTo(conn *sql.Conn, dst string) error {
	tmp := dst + ".partial"
	_ = os.Remove(tmp)
	err := conn.Raw(func(dc any) error {
		bc, ok := dc.(backupConn)
		if !ok {
			return errors.New("sqlite: driver connection has no backup API")
		}
		bk, err := bc.NewBackup(uriName(tmp))
		if err != nil {
			return err
		}
		if _, err := bk.Step(-1); err != nil {
			_ = bk.Finish()
			return err
		}
		return bk.Finish()
	})
	if err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("sqlite: backup to %s: %w", dst, err)
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func openReadOnly(path string) (*sql.DB, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	pragmas := url.Values{}
	pragmas.Add("mode", "ro")
	db, err := sql.Open("sqlite", "file:"+uriName(path)+"?"+pragmas.Encode())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// uriName escapes the characters that would cut a file name in a URI.
func uriName(path string) string {
	return strings.NewReplacer("%", "%25", "?", "%3F", "#", "%23").Replace(path)
}

// ApplyPendingRestore finishes a restore asked for in the previous run
// (core/14 §4): the validated copy at pending replaces the database at
// path, with its WAL and shared-memory files. It runs before the database
// is opened. Interrupted, it completes on the next start: the pending file
// stays until the rename. It reports whether a restore was applied.
func ApplyPendingRestore(path, pending string) (bool, error) {
	if _, err := os.Stat(pending); errors.Is(err, os.ErrNotExist) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	for _, f := range []string{path + "-wal", path + "-shm", path} {
		if err := os.Remove(f); err != nil && !errors.Is(err, os.ErrNotExist) {
			return false, fmt.Errorf("sqlite: restore: remove %s: %w", f, err)
		}
	}
	if err := os.Rename(pending, path); err != nil {
		return false, fmt.Errorf("sqlite: restore: %w", err)
	}
	return true, nil
}
