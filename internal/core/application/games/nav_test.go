package games

import (
	"reflect"
	"testing"

	"modorchestrator/internal/core/domain/game"
)

// D120: the game menu groups only what the capabilities offer; an empty
// group is dropped, so a game without plugins has no trace of them.
func TestWorkspaceGroupsFollowCapabilities(t *testing.T) {
	ids := func(gs []WorkspaceGroup) map[string][]WorkspaceItem {
		out := map[string][]WorkspaceItem{}
		for _, g := range gs {
			out[g.ID] = g.Items
		}
		return out
	}
	full := ids(WorkspaceGroups(WorkspaceItems(game.NewCapabilities(game.CapPlugins, game.CapLoadOrder))))
	want := map[string][]WorkspaceItem{
		GroupEntry:   {ItemOverview},
		GroupContent: {ItemMods, ItemPlugins, ItemLoadOrder, ItemConflicts},
		GroupSetup:   {ItemProfiles},
		GroupHealth:  {ItemDiagnostics, ItemInstanceSettings},
	}
	if !reflect.DeepEqual(full, want) {
		t.Fatalf("plugins game groups = %v", full)
	}
	// generic and Valheim: no plugins, no load order.
	bare := ids(WorkspaceGroups(WorkspaceItems(game.NewCapabilities())))
	if !reflect.DeepEqual(bare[GroupContent], []WorkspaceItem{ItemMods, ItemConflicts}) {
		t.Fatalf("game without plugins: content = %v", bare[GroupContent])
	}
	// load_order switched off (D115): plugins stays, load order leaves.
	off := ids(WorkspaceGroups(WorkspaceItems(game.NewCapabilities(game.CapPlugins))))
	if !reflect.DeepEqual(off[GroupContent], []WorkspaceItem{ItemMods, ItemPlugins, ItemConflicts}) {
		t.Fatalf("load order off: content = %v", off[GroupContent])
	}
	if got := WorkspaceGroups(nil); len(got) != 0 {
		t.Fatalf("no items, no groups: %v", got)
	}
}

// A game without plugins (generic, Valheim, or plugins switched off) lists no
// plugin section; one with plugins lists the three.
func TestSectionsFollowCapabilities(t *testing.T) {
	if got := Sections(game.NewCapabilities()); len(got) != 0 {
		t.Fatalf("no plugins: %v", got)
	}
	want := []string{SectionSettingsPlugins, SectionPluginCache, SectionOverviewPlugins}
	if got := Sections(game.NewCapabilities(game.CapPlugins)); !reflect.DeepEqual(got, want) {
		t.Fatalf("plugins: %v", got)
	}
}
