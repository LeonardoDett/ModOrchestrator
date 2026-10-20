package sqlite

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// bloat fills a scratch table with n rows of size bytes and deletes them,
// leaving free pages behind like the journal of a large deploy does.
func bloat(t testing.TB, db *sql.DB, n, size int) {
	t.Helper()
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS scratch (v BLOB)`); err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	blob := make([]byte, size)
	for i := 0; i < n; i++ {
		if _, err := tx.ExecContext(ctx, `INSERT INTO scratch (v) VALUES (?)`, blob); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM scratch`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		t.Fatal(err)
	}
}

func size(t testing.TB, path string) int64 {
	t.Helper()
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return fi.Size()
}

// D138: a backup leaves out the free pages of the database, and a folder
// name with URI characters still works.
func TestBackupIsCompact(t *testing.T) {
	ctx := context.Background()
	dir := filepath.Join(t.TempDir(), "dados #1 %20")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "state.db")
	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	bloat(t, db, 2000, 4096)
	backup := filepath.Join(dir, "backup.db")
	if err := NewBackups(db).Create(ctx, backup); err != nil {
		t.Fatal(err)
	}
	if got, full := size(t, backup), size(t, path); got*4 > full {
		t.Fatalf("backup %d bytes, database %d: free pages were copied", got, full)
	}
	if _, err := os.Stat(backup + ".partial"); !os.IsNotExist(err) {
		t.Fatal("the partial file must be renamed")
	}
	if v, err := NewBackups(db).Inspect(ctx, backup); err != nil || v != LatestSchemaVersion() {
		t.Fatalf("inspect: %d, %v", v, err)
	}
}

// TestBackupScale compares the backup API with VACUUM INTO on a large
// database with half of it free (MO_BENCH_BACKUP=<MB of live data>).
func TestBackupScale(t *testing.T) {
	mb, _ := strconv.Atoi(os.Getenv("MO_BENCH_BACKUP"))
	if mb == 0 {
		t.Skip("MO_BENCH_BACKUP not set")
	}
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "state.db")
	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `CREATE TABLE live (v BLOB)`); err != nil {
		t.Fatal(err)
	}
	blob := make([]byte, 4096)
	tx, _ := db.BeginTx(ctx, nil)
	for i := 0; i < mb*256; i++ {
		if _, err := tx.ExecContext(ctx, `INSERT INTO live (v) VALUES (?)`, blob); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	bloat(t, db, mb*256, 4096) // the deleted half

	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	if err := copyTo(conn, filepath.Join(dir, "api.db")); err != nil {
		t.Fatal(err)
	}
	api := time.Since(start)
	conn.Close()
	start = time.Now()
	if err := NewBackups(db).Create(ctx, filepath.Join(dir, "vacuum.db")); err != nil {
		t.Fatal(err)
	}
	vacuum := time.Since(start)
	t.Logf("database %d MB; backup API %d MB in %v; VACUUM INTO %d MB in %v",
		size(t, path)>>20, size(t, filepath.Join(dir, "api.db"))>>20, api, size(t, filepath.Join(dir, "vacuum.db"))>>20, vacuum)
}
