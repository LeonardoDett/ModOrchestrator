package games

import (
	"context"
	"slices"

	"modorchestrator/internal/core/domain/diagnostic"
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
	// ItemInstanceSettings is "Ajustes da instância" (D127, board
	// JogoAjustesRecursos): the features of the instance, for every game.
	ItemInstanceSettings WorkspaceItem = "instance_settings"
)

// featureScreens are the screens features bring to the game menu, in menu
// order; a feature without one (launch, installers…) changes behavior only.
var featureScreens = []struct {
	Feature game.Capability
	Screen  WorkspaceItem
}{
	{game.CapPlugins, ItemPlugins},
	{game.CapLoadOrder, ItemLoadOrder},
}

// FeatureScreen is the screen a feature brings to the game menu, empty when
// it brings none. Ajustes da instância and Adicionar jogo read it instead of
// keeping their own list (D132).
func FeatureScreen(c game.Capability) WorkspaceItem {
	for _, f := range featureScreens {
		if f.Feature == c {
			return f.Screen
		}
	}
	return ""
}

// WorkspaceItems is the navigation of a workspace, derived from the
// capabilities of the game (core/11 §5): Overview, Mods, Conflicts, Profiles,
// Diagnostics and the instance settings always; the screens of the features
// (Plugins, Load Order) only when the adapter declares them, in the order of
// the game menu. Saves arrive with the save_games capability (V1.x).
func WorkspaceItems(caps game.Capabilities) []WorkspaceItem {
	items := []WorkspaceItem{ItemOverview, ItemMods}
	for _, f := range featureScreens {
		if caps.Has(f.Feature) {
			items = append(items, f.Screen)
		}
	}
	return append(items, ItemConflicts, ItemProfiles, ItemDiagnostics, ItemInstanceSettings)
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
		ItemOverview:         GroupEntry,
		ItemMods:             GroupContent,
		ItemPlugins:          GroupContent,
		ItemLoadOrder:        GroupContent,
		ItemConflicts:        GroupContent,
		ItemProfiles:         GroupSetup,
		ItemDiagnostics:      GroupHealth,
		ItemInstanceSettings: GroupHealth,
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
	// Sections and Areas are those of the active instance (Sections,
	// DiagnosticAreas), for the screens that read the workspace (D132).
	Sections []string
	Areas    []diagnostic.Module
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
				w.Sections = Sections(def.Capabilities)
				w.Areas = DiagnosticAreas(def.Capabilities)
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
	// SectionProfilesPlugins is the plugins figure of a profile card.
	SectionProfilesPlugins = "profiles.plugins"
)

// Sections lists the capability-bound sections an instance offers, from
// its effective capabilities (D115): a feature switched off takes its
// sections with it.
func Sections(caps game.Capabilities) []string {
	out := []string{}
	if caps.Has(game.CapPlugins) {
		out = append(out, SectionSettingsPlugins, SectionPluginCache, SectionOverviewPlugins, SectionProfilesPlugins)
	}
	return out
}

// DiagnosticAreas lists the areas of Diagnostics › Problems an instance
// offers, in the order of the filter chips (D132): deploy, conflicts,
// rules, plugins only with the plugins capability, library and game. The
// app area is not an instance filter.
func DiagnosticAreas(caps game.Capabilities) []diagnostic.Module {
	out := []diagnostic.Module{diagnostic.ModuleDeploy, diagnostic.ModuleConflicts, diagnostic.ModuleRules}
	if caps.Has(game.CapPlugins) {
		out = append(out, diagnostic.ModulePlugins)
	}
	return append(out, diagnostic.ModuleLibrary, diagnostic.ModuleGame)
}
