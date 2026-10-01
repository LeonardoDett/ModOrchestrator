package sqlite

import (
	"context"
	"reflect"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
)

// Overrides, exclusions and reviews keep their locations (target and
// normalised path) across a save and a read (D026: instance intent).
func TestOverrideSetRoundTrip(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := NewGameInstanceRepository(db).Save(ctx, sampleInstance("i1", "Main")); err != nil {
		t.Fatal(err)
	}
	repo := NewOverrideRepository(db)
	empty, err := repo.Get(ctx, "i1")
	if err != nil || len(empty.Overrides()) != 0 {
		t.Fatalf("empty set = %+v, %v", empty, err)
	}
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	loc := game.Location{Target: "data", Path: relpath.MustParse("Textures/Sky.dds")}
	set, _ := override.New("i1")
	_ = set.SetOverride(loc, "m1", now)
	_ = set.Exclude("m2", loc, now)
	_ = set.MarkReviewed("m2", "m1", "sha256:x", now)
	if err := repo.Save(ctx, set); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get(ctx, "i1")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Data(), set.Data()) {
		t.Fatalf("round trip:\n got %+v\nwant %+v", got.Data(), set.Data())
	}
	if o, ok := got.Override(game.Location{Target: "data", Path: relpath.MustParse("textures/sky.dds")}); !ok || o.Winner != "m1" {
		t.Fatalf("lookup ignores case: %+v", o)
	}
}
