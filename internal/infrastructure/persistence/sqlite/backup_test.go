package sqlite

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"modorchestrator/internal/core/domain/settings"
)

func TestBackupRestoreRoundTrip(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "state.db")
	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	repo := NewSettingsRepository(db)
	v, _ := settings.NewValue(settings.ScopeApp, "", "ui.language", "pt-BR")
	if err := repo.Save(ctx, v); err != nil {
		t.Fatal(err)
	}
	b := NewBackups(db)
	before, _ := b.Changes(ctx)
	backup := filepath.Join(dir, "backup.db")
	if err := b.Create(ctx, backup); err != nil {
		t.Fatal(err)
	}
	if ver, err := b.Inspect(ctx, backup); err != nil || ver != LatestSchemaVersion() {
		t.Fatalf("inspect: %d, %v", ver, err)
	}
	// A change after the backup is what the restore discards.
	v.Value = "en"
	_ = repo.Save(ctx, v)
	if after, _ := b.Changes(ctx); after == before {
		t.Fatal("changes must move after a write")
	}
	pending := filepath.Join(dir, "restore-pending.db")
	if err := b.CopyFile(ctx, backup, pending); err != nil {
		t.Fatal(err)
	}
	db.Close()
	applied, err := ApplyPendingRestore(path, pending)
	if err != nil || !applied {
		t.Fatalf("apply: %v %v", applied, err)
	}
	if _, err := os.Stat(pending); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("pending file must be consumed")
	}
	db, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	got, err := NewSettingsRepository(db).Get(ctx, settings.ScopeApp, "", "ui.language")
	if err != nil || got.Value != "pt-BR" {
		t.Fatalf("restored value: %+v %v", got, err)
	}
	if applied, _ := ApplyPendingRestore(path, pending); applied {
		t.Fatal("nothing pending the second time")
	}
}

func TestInspectRefusesForeignFiles(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	junk := filepath.Join(dir, "junk.db")
	_ = os.WriteFile(junk, []byte("not a database"), 0o644)
	b := NewBackups(nil)
	if _, err := b.Inspect(ctx, junk); !errors.Is(err, ErrNotDatabase) {
		t.Fatalf("junk: %v", err)
	}
	empty := filepath.Join(dir, "empty.db")
	db, err := OpenUnmigrated(ctx, empty)
	if err != nil {
		t.Fatal(err)
	}
	if cur, latest, err := PendingMigrations(ctx, db); err != nil || cur != 0 || latest != LatestSchemaVersion() {
		t.Fatalf("pending: %d %d %v", cur, latest, err)
	}
	db.Close()
	if _, err := b.Inspect(ctx, empty); !errors.Is(err, ErrNotDatabase) {
		t.Fatalf("database without schema: %v", err)
	}
}
