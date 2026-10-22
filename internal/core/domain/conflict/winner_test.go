package conflict

import (
	"testing"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/override"
	"modorchestrator/internal/core/domain/relpath"
)

// WinnerOf (D147) agrees with Calculate on every location: override,
// exclusion, disabled mod and priority.
func TestWinnerOfAgreesWithCalculate(t *testing.T) {
	file := func(p string) mod.File {
		return mod.File{Source: relpath.MustParse(p), Dest: game.Location{Target: "data", Path: relpath.MustParse(p)}}
	}
	inst := func(m mod.ID, paths ...string) *mod.Installation {
		in := &mod.Installation{ID: mod.InstallationID("i-" + m), Mod: m}
		for _, p := range paths {
			in.Files = append(in.Files, file(p))
		}
		return in
	}
	installs := map[mod.ID]*mod.Installation{
		"a": inst("a", "x.nif", "y.nif", "z.nif", "w.nif"),
		"b": inst("b", "x.nif", "y.nif", "z.nif"),
		"c": inst("c", "x.nif", "w.nif"),
	}
	intent, _ := override.New("i")
	if err := intent.SetOverride(file("y.nif").Dest, "a", time.Time{}); err != nil {
		t.Fatal(err)
	}
	if err := intent.Exclude("b", file("z.nif").Dest, time.Time{}); err != nil {
		t.Fatal(err)
	}
	x := NewIndex()
	for _, in := range installs {
		x.Put(in)
	}
	order := []Slot{{Mod: "a", Enabled: true}, {Mod: "b", Enabled: true}, {Mod: "c", Enabled: false}}
	full := Calculate(Input{Enabled: []mod.ID{"a", "b"}, Installations: map[mod.ID]*mod.Installation{"a": installs["a"], "b": installs["b"]}, Intent: intent})
	want := map[string]mod.ID{}
	for _, w := range full.Winners {
		want[w.Location.Key()] = w.Mod
	}
	lookup := x.WinnerOf(EvalInput{Order: order, Intent: intent})
	for _, p := range []string{"x.nif", "y.nif", "z.nif", "w.nif", "none.nif"} {
		loc := file(p).Dest
		got, ok := lookup(loc)
		if w, has := want[loc.Key()]; ok != has || got != w {
			t.Errorf("%s: got %q (%v), want %q (%v)", p, got, ok, w, has)
		}
	}
}
