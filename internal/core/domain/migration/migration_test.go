package migration

import (
	"slices"
	"testing"

	"modorchestrator/internal/core/domain/game"
)

func TestEntriesDropsEmptySeparatorsAndAppendsUnlisted(t *testing.T) {
	s := Snapshot{Mods: []Mod{{Key: "a"}, {Key: "b"}, {Key: "c"}}}
	p := Profile{Order: []Entry{{Separator: "Empty"}, {Separator: "Main"}, {Mod: "b"}, {Mod: "gone"}, {Separator: "Tail"}}}
	keep := map[string]bool{"a": true, "b": true, "c": true}
	got := s.Entries(p, keep, true)
	want := []Entry{{Separator: "Main"}, {Mod: "b"}, {Separator: "Tail"}, {Mod: "a"}, {Mod: "c"}}
	if !slices.Equal(got, want) {
		t.Fatalf("entries %v, want %v", got, want)
	}
	if n := s.Separators(p, keep); n != 2 {
		t.Fatalf("separators %d", n)
	}
	if got := s.Entries(p, keep, false); len(got) != 3 || got[0].Mod != "b" {
		t.Fatalf("without separators: %v", got)
	}
}

// Without the capabilities the plugin parts are never offered (D128).
func TestPartsFollowCapabilities(t *testing.T) {
	s := Snapshot{Profiles: []Profile{{Order: []Entry{{Mod: "a"}}, Plugins: []PluginState{}, LoadOrder: []string{}}}, Categories: []Category{{Key: "1", Name: "x"}}}
	generic := game.Definition{Capabilities: game.NewCapabilities()}
	if got := s.Parts(generic); !slices.Equal(got, []Part{PartMods, PartOrder, PartCategories}) {
		t.Fatalf("generic parts %v", got)
	}
	full := game.Definition{Capabilities: game.NewCapabilities(game.CapPlugins, game.CapLoadOrder)}
	parts := s.Parts(full)
	if !slices.Contains(parts, PartPlugins) || !slices.Contains(parts, PartLoadOrder) {
		t.Fatalf("full parts %v", parts)
	}
	if slices.Contains(DefaultParts(parts), PartCategories) {
		t.Fatalf("categories are off by default")
	}
}
