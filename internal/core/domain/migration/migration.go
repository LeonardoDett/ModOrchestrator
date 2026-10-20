// Package migration models what another mod manager (Vortex, Mod Organizer
// 2) knows about a game, as read from its own files, and what of it an
// import brings in (D128). It holds no fact of a manager: file names and
// formats belong to the reader in the infrastructure; here a snapshot is
// plain data keyed by the manager's own identifiers.
package migration

import (
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
)

// Source is one place a manager keeps the state of a game: an MO2
// instance or the Vortex data folder with one of its games.
type Source struct {
	Manager game.ForeignKind
	// Path is the folder read: the MO2 instance or the Vortex data folder.
	Path string
	// Name labels the source for the user (MO2 instance name, "Vortex").
	Name string
	// GameRef is the manager's own id of the game.
	GameRef string
	// GamePath is the game folder the manager points at.
	GamePath string
}

// Snapshot is what a manager knows about one game.
type Snapshot struct {
	Source Source
	// Mods in the manager's global order, lowest priority first.
	Mods       []Mod
	Profiles   []Profile
	Rules      []Rule
	Categories []Category
}

// Mod is one installed mod of the manager.
type Mod struct {
	// Key is the manager's id of the mod (MO2 folder name, Vortex mod id).
	Key     string
	Name    string
	Version string
	Author  string
	Notes   string
	// Folder holds the installed files, already relative to the target.
	Folder string
	// Category is a Category.Key ("" = none).
	Category string
	// ForeignType is the manager's own mod type ("" = its default).
	ForeignType string
	// Skip lists files at the top of Folder that are the manager's own
	// metadata, never game files (MO2 meta.ini).
	Skip []string
}

// Entry is one position of a profile's order: a mod key or a separator.
type Entry struct {
	Mod       string
	Separator string // label
}

// Profile is one profile of the manager.
type Profile struct {
	Name   string
	Active bool
	// Order is lowest priority first. Mods of the snapshot it does not
	// list come after it, in the snapshot order.
	Order   []Entry
	Enabled map[string]bool
	// Folder is where the manager keeps the profile's copy of the game's
	// own files (the plugin list); the core reads it through the adapter.
	Folder string
	// Plugins and LoadOrder come from that file; nil when there is none.
	Plugins   []PluginState
	LoadOrder []string
	// Locks pins plugins at an index of the load order.
	Locks map[string]int
}

// PluginState is a plugin the profile lists and whether it is active.
type PluginState struct {
	Name    string
	Enabled bool
}

// RuleKind is what a rule between two mods says.
type RuleKind string

const (
	// RuleAfter: Mod loads after Other, so Mod wins its conflicts.
	RuleAfter      RuleKind = "after"
	RuleRequires   RuleKind = "requires"
	RuleRecommends RuleKind = "recommends"
	RuleConflicts  RuleKind = "conflicts"
)

// Rule relates two mods of the snapshot by key.
type Rule struct {
	Kind  RuleKind
	Mod   string
	Other string
}

// Category is a category of the manager; Parent is a Category.Key.
type Category struct {
	Key    string
	Name   string
	Parent string
}

// Part is something an import can bring in.
type Part string

const (
	PartMods       Part = "mods"
	PartOrder      Part = "order"
	PartRules      Part = "rules"
	PartPlugins    Part = "plugins"
	PartLoadOrder  Part = "load_order"
	PartCategories Part = "categories"
)

// Parts lists what the snapshot holds that an instance with def can
// receive. Plugins and the load order only exist with the capabilities in
// effect (D128: a generic game never lists them).
func (s Snapshot) Parts(def game.Definition) []Part {
	out := []Part{PartMods}
	if slices.ContainsFunc(s.Profiles, func(p Profile) bool { return len(p.Order) > 0 }) {
		out = append(out, PartOrder)
	}
	if len(s.Rules) > 0 {
		out = append(out, PartRules)
	}
	if def.Capabilities.Has(game.CapPlugins) && slices.ContainsFunc(s.Profiles, func(p Profile) bool { return p.Plugins != nil }) {
		out = append(out, PartPlugins)
	}
	if def.Capabilities.Has(game.CapLoadOrder) && slices.ContainsFunc(s.Profiles, func(p Profile) bool { return p.LoadOrder != nil }) {
		out = append(out, PartLoadOrder)
	}
	if len(s.Categories) > 0 {
		out = append(out, PartCategories)
	}
	return out
}

// DefaultParts is what "Importar tudo" brings: everything available but the
// categories, which stay an option turned off (D128).
func DefaultParts(available []Part) []Part {
	return slices.DeleteFunc(slices.Clone(available), func(p Part) bool { return p == PartCategories })
}

// Profile returns the profile named name (case insensitive).
func (s Snapshot) Profile(name string) (Profile, bool) {
	i := slices.IndexFunc(s.Profiles, func(p Profile) bool { return strings.EqualFold(p.Name, name) })
	if i < 0 {
		return Profile{}, false
	}
	return s.Profiles[i], true
}

// ActiveProfile is the manager's active profile, or the first one.
func (s Snapshot) ActiveProfile() (Profile, bool) {
	if i := slices.IndexFunc(s.Profiles, func(p Profile) bool { return p.Active }); i >= 0 {
		return s.Profiles[i], true
	}
	if len(s.Profiles) > 0 {
		return s.Profiles[0], true
	}
	return Profile{}, false
}

// Entries is the full order of p over the mods in keep: its own order
// (separators included when withSeparators), then the mods it does not
// list in the snapshot order. Separators with no mod after them before the
// next separator are dropped.
func (s Snapshot) Entries(p Profile, keep map[string]bool, withSeparators bool) []Entry {
	var out []Entry
	seen := map[string]bool{}
	for _, e := range p.Order {
		switch {
		case e.Separator != "":
			if withSeparators {
				out = append(out, e)
			}
		case keep[e.Mod] && !seen[e.Mod]:
			seen[e.Mod] = true
			out = append(out, e)
		}
	}
	for _, m := range s.Mods {
		if keep[m.Key] && !seen[m.Key] {
			seen[m.Key] = true
			out = append(out, Entry{Mod: m.Key})
		}
	}
	// A separator whose block is empty brings nothing but noise.
	var kept []Entry
	for i, e := range out {
		if e.Separator != "" && (i+1 >= len(out) || out[i+1].Separator != "") {
			continue
		}
		kept = append(kept, e)
	}
	return kept
}

// Separators counts the separators of p that hold a mod in keep.
func (s Snapshot) Separators(p Profile, keep map[string]bool) int {
	n := 0
	for _, e := range s.Entries(p, keep, true) {
		if e.Separator != "" {
			n++
		}
	}
	return n
}

// RulesAmong keeps the rules whose two mods are in keep and drops exact
// duplicates.
func (s Snapshot) RulesAmong(keep map[string]bool) []Rule {
	var out []Rule
	for _, r := range s.Rules {
		if r.Mod == r.Other || !keep[r.Mod] || !keep[r.Other] || slices.Contains(out, r) {
			continue
		}
		out = append(out, r)
	}
	return out
}
