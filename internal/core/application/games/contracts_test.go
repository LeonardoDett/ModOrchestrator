package games

import (
	"context"
	"strings"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// bare is an adapter with one game and no optional contract.
type bare struct{ caps []game.Capability }

func (bare) Name() string    { return "bare" }
func (bare) Version() string { return "1" }

func (b bare) Definitions() []game.Definition {
	return []game.Definition{{
		ID: "bare", Name: "Bare", Capabilities: game.NewCapabilities(b.caps...),
		Targets:  []game.TargetID{"main"},
		ModTypes: []game.ModType{{ID: game.DefaultModType, Name: "Default", Target: "main"}},
	}}
}

func (b bare) InstanceDefinition(game.ID, []game.Target) (game.Definition, error) {
	return b.Definitions()[0], nil
}
func (bare) ValidateRoot(context.Context, ports.FileReader, game.ID, string) error { return nil }
func (bare) Targets(game.ID, string, []game.TargetSpec) ([]game.Target, error)     { return nil, nil }
func (bare) RootHints(game.ID) ports.RootHints                                     { return ports.RootHints{} }
func (bare) ContentFlags(game.ID, []game.Location) []mod.ContentFlag               { return nil }

// withProcesses also implements ports.ProcessDeclarer.
type withProcesses struct{ bare }

func (withProcesses) Processes(game.ID) []string { return []string{"game.exe"} }

// D112: a capability and its optional interface are one thing. The registry
// refuses an adapter that declares without implementing, or implements
// without declaring.
func TestRegistryChecksCapabilityContracts(t *testing.T) {
	if _, err := NewRegistry(bare{}); err != nil {
		t.Fatalf("a game with no optional process is valid: %v", err)
	}
	for _, c := range Contracts() {
		_, err := NewRegistry(bare{caps: []game.Capability{c.Capability}})
		if err == nil || !strings.Contains(err.Error(), c.Interface) {
			t.Errorf("%s declared without %s must be refused, got %v", c.Capability, c.Interface, err)
		}
	}
	if _, err := NewRegistry(withProcesses{}); err == nil {
		t.Error("an interface no game declares must be refused")
	}
	ok := withProcesses{bare{caps: []game.Capability{game.CapRunningDetection}}}
	if _, err := NewRegistry(ok); err != nil {
		t.Errorf("declared and implemented: %v", err)
	}
}

// Every capability of a contract is in the catalog, each once.
func TestContractsCoverTheCatalog(t *testing.T) {
	catalog := map[game.Capability]bool{}
	for _, c := range game.Catalog() {
		catalog[c] = true
	}
	seen := map[game.Capability]bool{}
	for _, c := range Contracts() {
		if !catalog[c.Capability] {
			t.Errorf("%s has a contract but is not in game.Catalog", c.Capability)
		}
		if seen[c.Capability] {
			t.Errorf("%s has two contracts", c.Capability)
		}
		seen[c.Capability] = true
	}
}

// The support matrix comes from the registry: a capability the game lacks
// is "not applicable", never missing and never an error.
func TestSupportIsDerivedFromTheRegistry(t *testing.T) {
	r, err := NewRegistry(bare{}, withProcessesNamed{})
	if err != nil {
		t.Fatal(err)
	}
	status := map[game.ID]map[game.Capability]FeatureStatus{}
	for _, s := range r.Support() {
		status[s.Game] = map[game.Capability]FeatureStatus{}
		for _, f := range s.Features {
			status[s.Game][f.ID] = f.Status
		}
		if len(s.Features) != len(game.Catalog()) {
			t.Errorf("%s lists %d features, catalog has %d", s.Game, len(s.Features), len(game.Catalog()))
		}
	}
	if status["bare"][game.CapRunningDetection] != FeatureNotApplicable || status["bare"][game.CapPlugins] != FeatureNotApplicable {
		t.Errorf("bare: %v", status["bare"])
	}
	if status["other"][game.CapRunningDetection] != FeatureAvailable {
		t.Errorf("other: %v", status["other"])
	}
}

// withProcessesNamed is a second adapter, with its own game id.
type withProcessesNamed struct{ withProcesses }

func (withProcessesNamed) Name() string { return "other" }
func (withProcessesNamed) Definitions() []game.Definition {
	d := bare{caps: []game.Capability{game.CapRunningDetection}}.Definitions()[0]
	d.ID, d.Name = "other", "Other"
	return []game.Definition{d}
}

// host is an adapter whose games arrive while the app runs (D117).
type host struct {
	withProcesses
	entries []game.Manifest
}

func (*host) Name() string { return "host" }
func (h *host) Definitions() []game.Definition {
	out := []game.Definition{}
	for _, m := range h.entries {
		d, _ := m.Definition(game.SupportCustom)
		out = append(out, d)
	}
	return out
}
func (h *host) SetEntries(list []game.Manifest) error { h.entries = list; return nil }

func entryManifest(id game.ID, processes ...string) game.Manifest {
	return game.Manifest{
		Schema: game.ManifestSchema, ID: id, Name: "Entry",
		Discovery: game.ManifestDiscovery{Processes: processes},
		Layout:    game.ManifestLayout{Targets: []game.ManifestTarget{{ID: "mods", Path: "Mods"}}},
	}
}

// D117: user entries live in their own namespace, only the entry host may
// define games there, and the host may implement a contract before any of
// its games declares it.
func TestRegistryServesUserEntries(t *testing.T) {
	h := &host{}
	r, err := NewRegistry(bare{}, h)
	if err != nil {
		t.Fatalf("a host with no game yet is valid: %v", err)
	}
	if err := r.SetEntries([]game.Manifest{entryManifest("user.one", "one.exe")}); err != nil {
		t.Fatal(err)
	}
	def, ok := r.Definition("user.one")
	if a, _ := r.Adapter("user.one"); !ok || a != ports.GameAdapter(h) || !def.Capabilities.Has(game.CapRunningDetection) {
		t.Fatalf("definition = %+v, %v", def, ok)
	}
	if err := r.SetEntries([]game.Manifest{entryManifest("bare")}); err == nil {
		t.Fatal("an entry outside the user namespace must be refused")
	}
	if _, ok := r.Definition("user.one"); !ok {
		t.Fatal("a refused change keeps what was served")
	}
	if err := r.SetEntries(nil); err != nil {
		t.Fatal(err)
	}
	if _, ok := r.Definition("user.one"); ok || len(r.Definitions()) != 1 {
		t.Fatalf("entries removed: %+v", r.Definitions())
	}

	plain, _ := NewRegistry(bare{})
	if err := plain.SetEntries([]game.Manifest{entryManifest("user.one")}); err == nil {
		t.Fatal("with no host an entry cannot be served")
	}
	if err := plain.SetEntries(nil); err != nil {
		t.Fatalf("no entries and no host is fine: %v", err)
	}
	if _, err := NewRegistry(squatter{}); err == nil {
		t.Fatal("a shipped adapter cannot define a game in the user namespace")
	}
}

type squatter struct{ bare }

func (squatter) Definitions() []game.Definition {
	d := bare{}.Definitions()[0]
	d.ID = "user.squat"
	return []game.Definition{d}
}
