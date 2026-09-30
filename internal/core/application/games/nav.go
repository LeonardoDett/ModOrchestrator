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

// InstanceRef identifies an instance in the game switcher.
type InstanceRef struct {
	ID       game.InstanceID
	Name     string
	GameName string
}

// Workspace is the navigation state of the shell: which instance is active,
// the instances the user can switch to and the screens of the active one.
type Workspace struct {
	Active    *InstanceRef
	Instances []InstanceRef
	Items     []WorkspaceItem
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
		}
		w.Instances = append(w.Instances, ref)
		if inst.ID == active {
			r := ref
			w.Active = &r
			if ok {
				w.Items = WorkspaceItems(def.Capabilities)
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
