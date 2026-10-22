package gamearchive

import (
	"reflect"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

func paths(raw ...string) []relpath.Path {
	out := make([]relpath.Path, len(raw))
	for i, r := range raw {
		out[i] = relpath.MustParse(r)
	}
	return out
}

func TestLooseBeatsArchivesAndLaterArchiveBeatsEarlier(t *testing.T) {
	loose := map[string]mod.ID{"meshes/a.nif": "c", "textures/own.dds": "a"}
	in := Input{
		Target: "data",
		Archives: []Archive{
			{Name: "A.bsa", Mod: "a", Files: paths(`meshes\a.nif`, `textures\b.dds`, `textures\own.dds`, `textures\only.dds`)},
			{Name: "B.bsa", Mod: "b", Files: paths(`Meshes\A.nif`, `textures\b.dds`)},
			{Name: "X.bsa", Mod: "x", Unread: true},
		},
		Loose: func(l game.Location) (mod.ID, bool) {
			if l.Target != "data" {
				t.Fatalf("location of another target: %v", l)
			}
			m, ok := loose[l.Path.Key()]
			return m, ok
		},
	}
	res := Calculate(in)
	if len(res.Files) != 3 {
		t.Fatalf("files %+v", res.Files)
	}
	a := res.Files[0] // meshes/a.nif
	if a.Winner != (Source{Mod: "c"}) || len(a.Losers) != 2 || a.Losers[0].Archive != "A.bsa" || a.Losers[1].Archive != "B.bsa" {
		t.Fatalf("loose wins over both archives: %+v", a)
	}
	b := res.Files[1] // textures/b.dds
	if b.Winner != (Source{Mod: "b", Archive: "B.bsa"}) || b.Losers[0] != (Source{Mod: "a", Archive: "A.bsa"}) {
		t.Fatalf("the later archive wins: %+v", b)
	}
	if own := res.Files[2]; own.Winner != (Source{Mod: "a"}) || own.Losers[0].Mod != "a" {
		t.Fatalf("a mod's loose file over its own archive: %+v", own)
	}
	want := []Pair{
		{Winner: Source{Mod: "b", Archive: "B.bsa"}, Loser: Source{Mod: "a", Archive: "A.bsa"}, Reason: ReasonLoadOrder, Files: 1},
		{Winner: Source{Mod: "c"}, Loser: Source{Mod: "a", Archive: "A.bsa"}, Reason: ReasonLoose, Files: 1},
		{Winner: Source{Mod: "c"}, Loser: Source{Mod: "b", Archive: "B.bsa"}, Reason: ReasonLoose, Files: 1},
	}
	if !reflect.DeepEqual(res.Pairs, want) {
		t.Fatalf("pairs\n got %+v\nwant %+v", res.Pairs, want)
	}
	if len(res.Unread) != 1 || res.Unread[0].Name != "X.bsa" {
		t.Fatalf("unread %+v", res.Unread)
	}
	if again := Calculate(in); !reflect.DeepEqual(again, res) {
		t.Fatal("same input, same output")
	}
}

func TestNothingToDispute(t *testing.T) {
	res := Calculate(Input{Archives: []Archive{{Name: "A.bsa", Mod: "a", Files: paths("a/b.nif", "a/b.nif")}}})
	if len(res.Files) != 0 || len(res.Pairs) != 0 {
		t.Fatalf("one archive, no loose file: %+v", res)
	}
}
