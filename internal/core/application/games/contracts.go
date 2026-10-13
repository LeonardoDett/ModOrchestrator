package games

import (
	"fmt"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Contract ties a capability to the optional adapter interface that serves
// it (D112): one capability, one interface. Capabilities without a contract
// are answered by the definition itself (targets, mod types, tool outputs)
// or are reserved for a later release.
type Contract struct {
	Capability game.Capability
	// Interface is the name of the port, for error messages and documents.
	Interface   string
	implemented func(ports.GameAdapter) bool
}

func implements[T any](a ports.GameAdapter) bool {
	_, ok := a.(T)
	return ok
}

var contracts = []Contract{
	{game.CapPlugins, "ports.PluginSupport", implements[ports.PluginSupport]},
	{game.CapLoadOrder, "ports.LoadOrderSupport", implements[ports.LoadOrderSupport]},
	{game.CapLaunch, "ports.LaunchSupport", implements[ports.LaunchSupport]},
	{game.CapAdapterInstallers, "ports.InstallerProvider", implements[ports.InstallerProvider]},
	{game.CapHealthChecks, "ports.HealthCheckProvider", implements[ports.HealthCheckProvider]},
	{game.CapDefaultCategories, "ports.CategoryProvider", implements[ports.CategoryProvider]},
	{game.CapRunningDetection, "ports.ProcessDeclarer", implements[ports.ProcessDeclarer]},
}

// Contracts lists the capabilities served by an optional adapter interface.
func Contracts() []Contract { return append([]Contract(nil), contracts...) }

// checkContracts refuses an adapter whose definitions and code disagree: a
// capability declared without its interface would show a feature that
// cannot work, and an interface no definition declares would never be
// offered. What the adapter offers is checked here once; what is in effect
// for one instance comes from InstanceDefinition.
func checkContracts(a ports.GameAdapter) error {
	defs := a.Definitions()
	for _, c := range contracts {
		declared := false
		for _, d := range defs {
			if !d.Capabilities.Has(c.Capability) {
				continue
			}
			declared = true
			if !c.implemented(a) {
				return fmt.Errorf("games: adapter %s: game %q declares %q without implementing %s", a.Name(), d.ID, c.Capability, c.Interface)
			}
		}
		if !declared && c.implemented(a) {
			return fmt.Errorf("games: adapter %s implements %s but no game declares %q", a.Name(), c.Interface, c.Capability)
		}
	}
	return nil
}

// FeatureStatus says whether a game offers a feature.
type FeatureStatus string

const (
	// FeatureAvailable: the adapter offers it.
	FeatureAvailable FeatureStatus = "available"
	// FeatureNotApplicable: the game has no such process. It is the normal
	// case for most games, never an error.
	FeatureNotApplicable FeatureStatus = "not_applicable"
)

// Feature is one capability of the catalog for one game.
type Feature struct {
	ID     game.Capability
	Status FeatureStatus
}

// GameSupport is what the app offers for one game (D112). It is derived
// from the registered adapters, never kept by hand.
type GameSupport struct {
	Game           game.ID
	Name           string
	Adapter        string
	AdapterVersion string
	// Custom: the user declares the targets of each instance.
	Custom   bool
	Features []Feature
}

// Support lists every game of the registry with the status of each
// capability: the catalog first, then the ones only the definition names.
func (r *Registry) Support() []GameSupport {
	out := make([]GameSupport, 0, len(r.defs))
	for _, d := range r.defs {
		a := r.byGame[d.ID]
		s := GameSupport{Game: d.ID, Name: d.Name, Adapter: a.Name(), AdapterVersion: a.Version(), Custom: d.CustomTargets}
		known := map[game.Capability]bool{}
		for _, c := range game.Catalog() {
			known[c] = true
			st := FeatureNotApplicable
			if d.Capabilities.Has(c) {
				st = FeatureAvailable
			}
			s.Features = append(s.Features, Feature{ID: c, Status: st})
		}
		for _, c := range d.Capabilities.List() {
			if !known[c] {
				s.Features = append(s.Features, Feature{ID: c, Status: FeatureAvailable})
			}
		}
		out = append(out, s)
	}
	return out
}
