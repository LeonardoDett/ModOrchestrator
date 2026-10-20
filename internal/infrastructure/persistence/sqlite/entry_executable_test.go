package sqlite

import (
	"context"
	"testing"
)

// D136: migration 0012 drops the copy of the executable kept by instances
// of user entries; an instance of the template game keeps its own.
func TestEntryInstancesLoseTheExecutableCopy(t *testing.T) {
	ctx := context.Background()
	db, err := OpenUnmigrated(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrateTo(ctx, db, 11); err != nil {
		t.Fatal(err)
	}
	repo := NewGameInstanceRepository(db)
	entry := sampleInstance("e1", "Stardew")
	entry.Game, entry.Adapter, entry.Executable = "user.stardew", "generic", "Stardew.exe"
	legacy := sampleInstance("g1", "Old")
	legacy.Game, legacy.Adapter, legacy.Executable = "generic", "generic", "Old.exe"
	if err := repo.Save(ctx, entry); err != nil {
		t.Fatal(err)
	}
	if err := repo.Save(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get(ctx, "e1")
	if err != nil || got.Executable != "" {
		t.Fatalf("entry instance = %+v, %v", got, err)
	}
	if got, err := repo.Get(ctx, "g1"); err != nil || got.Executable != "Old.exe" {
		t.Fatalf("template instance = %+v, %v", got, err)
	}
}
