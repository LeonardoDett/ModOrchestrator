package games

import (
	"context"
	"slices"

	"modorchestrator/internal/core/domain/game"
)

// WorkspaceItem names a screen of the game workspace (ui/00 §2.2).
type WorkspaceItem string

const (
	ItemOverview    WorkspaceItem = "overview"
	ItemMods        WorkspaceItem = "mods"
	ItemPlugins     WorkspaceItem = "plugins"
	ItemLoadOrder   WorkspaceItem = "load_order"
	ItemConflicts   WorkspaceItem = "conflicts"
	ItemProfiles    WorkspaceItem = "profiles"
	ItemDiagnostics WorkspaceItem = "diagnostics"
)

// WorkspaceItems is the navigation of a workspace, derived from the
// capabilities of the game (core/11 §5): Overview, Mods, Conflicts, Profiles
// and Diagnostics always; Plugins and Load Order only when the adapter
// declares them. Saves arrive with the save_games capability (V1.x).
func WorkspaceItems(caps game.Capabilities) []WorkspaceItem {
	items := []WorkspaceItem{ItemOverview, ItemMods}
	if caps.Has(game.CapPlugins) {
		items = append(items, ItemPlugins)
	}
	if caps.Has(game.CapLoadOrder) {
		items = append(items, ItemLoadOrder)
	}
	return append(items, ItemConflicts, ItemProfiles, ItemDiagnostics)
}

// WorkspaceGroup is a titled group of the game menu (D120): entry,
// content, setup and health. A group without items is not returned.
type WorkspaceGroup struct {
	ID    string
	Items []WorkspaceItem
}

// Group ids of the game menu.
const (
	GroupEntry   = "entry"
	GroupContent = "content"
	GroupSetup   = "setup"
	GroupHealth  = "health"
)

// WorkspaceGroups arranges the items of a workspace in the groups of the
// game menu (ui/00 §2.2). It only places what WorkspaceItems offered, so a
// screen without its capability never appears; a group left empty is
// dropped.
func WorkspaceGroups(items []WorkspaceItem) []WorkspaceGroup {
	place := map[WorkspaceItem]string{
		ItemOverview:    GroupEntry,
		ItemMods:        GroupContent,
		ItemPlugins:     GroupContent,
		ItemLoadOrder:   GroupContent,
		ItemConflicts:   GroupContent,
		ItemProfiles:    GroupSetup,
		ItemDiagnostics: GroupHealth,
	}
	order := []string{GroupEntry, GroupContent, GroupSetup, GroupHealth}
	var out []WorkspaceGroup
	for _, id := range order {
		g := WorkspaceGroup{ID: id}
		for _, it := range items {
			if place[it] == id {
				g.Items = append(g.Items, it)
			}
		}
		if len(g.Items) > 0 {
			out = append(out, g)
		}
	}
	return out
}

// InstanceRef identifies an instance in the game switcher.
type InstanceRef struct {
	ID       game.InstanceID
	Name     string
	GameName string
	// Accent is the game's accent (D122); empty for the app's own.
	Accent string
}

// Workspace is the navigation state of the shell: which instance is active,
// the instances the user can switch to and the screens of the active one.
type Workspace struct {
	Active    *InstanceRef
	Instances []InstanceRef
	Items     []WorkspaceItem
	// Groups are the same items arranged as the game menu (D120).
	Groups []WorkspaceGroup
}

// Workspace answers the shell navigation query. It is cheap: it does not
// inspect the filesystem.
func (s *Service) Workspace(ctx context.Context) (Workspace, error) {
	instances, err := s.Instances.List(ctx)
	if err != nil {
		return Workspace{}, err
	}
	active, err := s.Active(ctx)
	if err != nil {
		return Workspace{}, err
	}
	var w Workspace
	for _, inst := range instances {
		if inst.Hidden && inst.ID != active {
			continue
		}
		ref := InstanceRef{ID: inst.ID, Name: inst.DisplayName}
		adapter, ok := s.Registry.ByName(inst.Adapter)
		var def game.Definition
		if ok {
			def, ok = definitionOf(adapter, inst)
		}
		if ok {
			ref.GameName = def.Name
			ref.Accent = def.Accent
		}
		w.Instances = append(w.Instances, ref)
		if inst.ID == active {
			r := ref
			w.Active = &r
			if ok {
				w.Items = WorkspaceItems(def.Capabilities)
				w.Groups = WorkspaceGroups(w.Items)
			}
		}
	}
	slices.SortFunc(w.Instances, func(a, b InstanceRef) int {
		if a.Name < b.Name {
			return -1
		}
		if a.Name > b.Name {
			return 1
		}
		return 0
	})
	return w, nil
}

// Section ids name the parts of shared screens that exist only with a
// capability (ui/00 §1.4: the UI never tests a capability, it renders the
// sections the backend lists).
const (
	// SectionSettingsPlugins is the Plugins tab of Settings.
	SectionSettingsPlugins = "settings.plugins"
	// SectionPluginCache is the plugin header cache action of Workarounds.
	SectionPluginCache = "workarounds.pluginCache"
	// SectionOverviewPlugins is the plugins figure of the Overview.
	SectionOverviewPlugins = "overview.plugins"
)

// Sections lists the capability-bound sections an instance offers, from
// its effective capabilities (D115): a feature switched off takes its
// sections with it.
func Sections(caps game.Capabilities) []string {
	out := []string{}
	if caps.Has(game.CapPlugins) {
		out = append(out, SectionSettingsPlugins, SectionPluginCache, SectionOverviewPlugins)
	}
	return out
}
