package sqlite

import (
	"context"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/externalchange"
)

func TestUnmanagedDecisionsRoundTrip(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	seedInstance(t, db, "i1")
	repo := NewExternalDecisionRepository(db)
	at := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	a, _ := externalchange.NewUnmanaged("i1", depLoc("Nemesis.log"), at)
	b, _ := externalchange.NewUnmanaged("i1", depLoc("nemesis.LOG"), at.Add(time.Hour)) // same location
	if err := repo.SaveUnmanaged(ctx, a, b); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Unmanaged(ctx, "i1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Location.Key() != a.Location.Key() || !got[0].DecidedAt.Equal(b.DecidedAt) {
		t.Fatalf("one decision per location: %+v", got)
	}
	if other, _ := repo.Unmanaged(ctx, "i2"); len(other) != 0 {
		t.Fatal("decisions belong to their instance")
	}
}
