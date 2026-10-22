package mod

import (
	"errors"
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// D144: a mod type with a folder per mod places every file under the
// mod's id; a merging type leaves the path alone.
func TestPlaceUnplaceAndRelocate(t *testing.T) {
	merge := game.ModType{ID: "loose", Target: "mods"}
	folder := game.ModType{ID: game.DefaultModType, Target: "mods", Layout: game.LayoutModFolder}
	p := relpath.MustParse("Sub/a.txt")

	loc, err := Place(merge, "m1", p)
	if err != nil || loc.Target != "mods" || loc.Path.String() != "Sub/a.txt" {
		t.Fatalf("merge: %v %v", loc, err)
	}
	loc, err = Place(folder, "m1", p)
	if err != nil || loc.Path.String() != "m1/Sub/a.txt" {
		t.Fatalf("folder: %v %v", loc, err)
	}
	if got := Unplace("m1", loc.Path); !got.Equal(p) {
		t.Fatalf("unplace = %s", got)
	}
	if got := Unplace("M1", loc.Path); !got.Equal(p) {
		t.Fatalf("unplace ignores case = %s", got)
	}
	if got := Unplace("m2", loc.Path); !got.Equal(loc.Path) {
		t.Fatalf("another mod's folder must stay: %s", got)
	}
	if got := Unplace("m1", relpath.MustParse("m1")); got.String() != "m1" {
		t.Fatalf("a file named like the folder stays: %s", got)
	}
	if _, err := Place(folder, "bad:id", p); !errors.Is(err, ErrInvalid) {
		t.Fatalf("an id that is not a path segment must fail: %v", err)
	}

	files := []File{{Source: p, Dest: game.Location{Target: "mods", Path: p}}}
	in, err := Relocate(folder, "m1", files)
	if err != nil || in[0].Dest.Path.String() != "m1/Sub/a.txt" || !in[0].Source.Equal(p) {
		t.Fatalf("relocate into folder: %+v %v", in, err)
	}
	if files[0].Dest.Path.String() != "Sub/a.txt" {
		t.Fatal("Relocate must not change its input")
	}
	out, err := Relocate(merge, "m1", in)
	if err != nil || !out[0].Dest.Path.Equal(p) {
		t.Fatalf("relocate back: %+v %v", out, err)
	}
	again, _ := Relocate(folder, "m1", in)
	if again[0].Dest.Path.String() != "m1/Sub/a.txt" {
		t.Fatalf("relocating twice must not nest the folder: %s", again[0].Dest.Path)
	}
}

func TestContentFootprintIsRelativeToTheModRoot(t *testing.T) {
	folder := game.ModType{ID: game.DefaultModType, Target: "mods", Layout: game.LayoutModFolder}
	loc, _ := Place(folder, "m1", relpath.MustParse("readme.txt"))
	inst, err := NewInstallation("i1", "m1", "inst", "basic", nil, []File{{Source: relpath.MustParse("readme.txt"), Dest: loc}}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if got := inst.Footprint()[0].Path.String(); got != "m1/readme.txt" {
		t.Fatalf("footprint = %s", got)
	}
	if got := inst.ContentFootprint()[0].Path.String(); got != "readme.txt" {
		t.Fatalf("content footprint = %s", got)
	}
}
