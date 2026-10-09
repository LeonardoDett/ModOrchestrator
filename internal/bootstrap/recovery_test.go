package bootstrap

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/backups"
	"modorchestrator/internal/infrastructure/appdata"
	"modorchestrator/internal/infrastructure/persistence/sqlite"

	_ "modernc.org/sqlite"
)

// F14, core/14 §2 and §5: a damaged or newer database never crashes the
// startup; it opens the recovery screen, which restores a backup or starts
// from scratch without touching anything outside the data folder.

func startIn(t *testing.T, dir string) (*Container, error) {
	t.Helper()
	t.Setenv(appdata.EnvDataDir, dir)
	return New(context.Background())
}

// healthy starts once, makes a manual backup, closes normally.
func healthy(t *testing.T) (dir string, backup string) {
	t.Helper()
	dir = t.TempDir()
	c, err := startIn(t, dir)
	if err != nil {
		t.Fatal(err)
	}
	b, err := c.Backups.Create(context.Background(), backups.KindManual)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "state.session")); !os.IsNotExist(err) {
		t.Fatal("a normal close removes the session marker")
	}
	return dir, b.ID
}

func failure(t *testing.T, err error, reason string) *StartupFailure {
	t.Helper()
	var f *StartupFailure
	if !errors.As(err, &f) || f.Reason != reason {
		t.Fatalf("startup error = %v, want reason %s", err, reason)
	}
	return f
}

// smash overwrites n bytes at offset with garbage.
func smash(t *testing.T, path string, offset int64, n int) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteAt([]byte(strings.Repeat("\xde\xad\xbe\xef", n/4)), offset); err != nil {
		t.Fatal(err)
	}
}

func TestHeaderCorruptionOpensRecoveryAndRestores(t *testing.T) {
	dir, backup := healthy(t)
	smash(t, filepath.Join(dir, "state.db"), 0, 64)
	_, err := startIn(t, dir)
	f := failure(t, err, ReasonCorrupt)

	r := NewRecovery(f)
	list, err := r.Backups(context.Background())
	if err != nil || len(list) == 0 || list[0].ID != backup || !list[0].Valid {
		t.Fatalf("backups = %+v %v", list, err)
	}
	if err := r.Restore(context.Background(), backup); err != nil {
		t.Fatal(err)
	}
	c, err := startIn(t, dir)
	if err != nil {
		t.Fatalf("start after the restore: %v", err)
	}
	defer c.Close()
	if !c.Restored {
		t.Fatal("the backup was put in place")
	}
	damaged := 0
	entries, _ := os.ReadDir(filepath.Join(dir, "backups"))
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "-damaged.db") {
			damaged++
		}
	}
	if damaged != 1 {
		t.Fatalf("the damaged database is kept in the backups folder: %v", entries)
	}
}

func TestPageCorruptionAfterAbnormalCloseIsDetected(t *testing.T) {
	dir, _ := healthy(t)
	db := filepath.Join(dir, "state.db")
	// The b-tree header of an index the startup does not read: the file
	// opens and every query works; only the integrity check sees it.
	conn, err := sql.Open("sqlite", db)
	if err != nil {
		t.Fatal(err)
	}
	var root, size int64
	if err := conn.QueryRow(`SELECT rootpage FROM sqlite_master WHERE name = 'notifications_ref_idx'`).Scan(&root); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`PRAGMA page_size`).Scan(&size); err != nil {
		t.Fatal(err)
	}
	conn.Close()
	smash(t, db, (root-1)*size, 8)
	// After a normal close nothing checks the whole file.
	c, err := startIn(t, dir)
	if err != nil {
		t.Fatalf("normal start: %v", err)
	}
	c.Close()
	// After an abnormal one, the integrity check runs and fails.
	if err := os.WriteFile(filepath.Join(dir, "state.session"), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = startIn(t, dir)
	failure(t, err, ReasonCorrupt)
}

func TestNewerSchemaOpensRecovery(t *testing.T) {
	dir, _ := healthy(t)
	db, err := sql.Open("sqlite", filepath.Join(dir, "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO schema_migrations(version, name) VALUES (999, '0999_future.sql')`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	_, err = startIn(t, dir)
	f := failure(t, err, ReasonNewerSchema)
	// Nothing changed: the newer database is left for the newer app.
	before, _ := os.Stat(filepath.Join(dir, "state.db"))
	if before == nil {
		t.Fatal("the database stays where it is")
	}
	_ = f
}

func TestStartFreshKeepsTheDamagedDatabase(t *testing.T) {
	dir, _ := healthy(t)
	smash(t, filepath.Join(dir, "state.db"), 0, 64)
	_, err := startIn(t, dir)
	r := NewRecovery(failure(t, err, ReasonCorrupt))
	if err := r.StartFresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	c, err := startIn(t, dir)
	if err != nil {
		t.Fatalf("start from scratch: %v", err)
	}
	defer c.Close()
	if v, err := sqlite.SchemaVersion(context.Background(), c.db); err != nil || v != sqlite.LatestSchemaVersion() {
		t.Fatalf("fresh database at v%d: %v", v, err)
	}
	list, _ := NewRecovery(&StartupFailure{Paths: c.Paths, Err: errors.New("x")}).Backups(context.Background())
	found := false
	for _, b := range list {
		if b.Kind == backups.KindDamaged {
			found = !b.Valid
		}
	}
	if !found {
		t.Fatalf("damaged copy listed and refused: %+v", list)
	}
}
