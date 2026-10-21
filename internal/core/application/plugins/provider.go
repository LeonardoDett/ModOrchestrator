package plugins

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/pluginhealth"
)

// Provider is a contribution point (D133): a source of ordering data and
// messages other than the user, such as the LOOT data (D041, D140, D141).
// The module lists providers and never names one. What a provider gives is
// calculated on every read: soft rules, groups and assignments that the
// user's data overrides, and diagnostics about plugins.
type Provider interface {
	// Provide returns the provider's data for the plugins of an instance;
	// ok is false when it has nothing for it (turned off, game unknown).
	// An error is logged by the caller as "no data": a provider never
	// stops the plugins module.
	Provide(ctx context.Context, in ProviderInput) (out ProviderOutput, ok bool, err error)
}

// ProviderPlugin is one plugin of the inventory as a provider sees it.
type ProviderPlugin struct {
	Name     plugin.Name
	Enabled  bool
	Implicit bool
	// Path is the file on disk (in the staging for plugins of mods).
	Path   string
	Header plugin.Header
}

// ProviderInput is the instance a provider answers for.
type ProviderInput struct {
	Instance game.Instance
	Adapter  ports.GameAdapter
	// DataDir is the plugin target folder of the game on disk.
	DataDir string
	Plugins []ProviderPlugin
}

// ProviderOutput is what a provider gives.
type ProviderOutput struct {
	Data        plugin.Provided
	Diagnostics []diagnostic.Diagnostic
}

// provide asks every provider and builds the effective rules of the state.
func (s *Service) provide(ctx context.Context, st *state) {
	st.effective = st.rules
	if len(s.Providers) == 0 {
		return
	}
	adapter, _ := s.Registry.ByName(st.inst.Adapter)
	in := ProviderInput{Instance: st.inst, Adapter: adapter, DataDir: st.dataDir}
	for _, p := range st.inv {
		in.Plugins = append(in.Plugins, ProviderPlugin{Name: p.Name, Enabled: st.enabled(p), Implicit: p.Implicit, Path: st.paths[p.Name.Key()], Header: p.Header})
	}
	for _, pr := range s.Providers {
		out, ok, err := pr.Provide(ctx, in)
		if err != nil || !ok {
			continue
		}
		st.providedData = append(st.providedData, out.Data)
		st.provided = append(st.provided, out.Diagnostics...)
	}
	st.refreshEffective()
}

// refreshEffective rebuilds the effective rules after the user's rules
// changed in a command.
func (st *state) refreshEffective() {
	st.effective = st.rules
	if len(st.providedData) == 0 {
		return
	}
	chk := st.check()
	key := effectiveKey(st.rules, chk, st.providedData)
	if eff, ok := st.memo.get(st.inst.ID, key); ok {
		st.effective = eff
		return
	}
	st.effective = st.rules.WithProvided(chk, st.providedData...)
	st.memo.put(st.inst.ID, key, st.effective)
}

// effectiveMemo keeps the last effective set of each instance: merging the
// provided data and leaving out its cycles costs more than a query, and the
// inputs rarely change between two reads. The set is only read.
type effectiveMemo struct {
	mu sync.Mutex
	by map[game.InstanceID]memoEntry
}

type memoEntry struct {
	key string
	eff *plugin.Rules
}

func (m *effectiveMemo) get(id game.InstanceID, key string) (*plugin.Rules, bool) {
	if m == nil {
		return nil, false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.by[id]
	return e.eff, ok && e.key == key
}

func (m *effectiveMemo) put(id game.InstanceID, key string, eff *plugin.Rules) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.by == nil {
		m.by = map[game.InstanceID]memoEntry{}
	}
	m.by[id] = memoEntry{key: key, eff: eff}
}

// effectiveKey identifies the inputs of WithProvided.
func effectiveKey(r *plugin.Rules, chk plugin.Check, ps []plugin.Provided) string {
	h := sha256.New()
	d := r.Data()
	for _, x := range d.Rules {
		fmt.Fprintf(h, "r%q%q%q%v|", x.ID, x.Plugin.Key(), x.After.Key(), x.Disabled)
	}
	for _, g := range d.Groups {
		fmt.Fprintf(h, "g%q%q|", g.Name, g.After)
	}
	fmt.Fprintf(h, "a%v|o%v|", sortedAssignments(d.Assignments), d.ProviderOff)
	for _, n := range chk.Known {
		fmt.Fprintf(h, "k%q", n.Key())
	}
	for _, e := range chk.Hard {
		fmt.Fprintf(h, "h%q%q%q", e.Before, e.After, e.Ref)
	}
	for _, p := range ps {
		fmt.Fprintf(h, "|p%q", p.Source)
		for _, x := range p.Rules {
			fmt.Fprintf(h, "r%q", x.ID)
		}
		for _, g := range p.Groups {
			fmt.Fprintf(h, "g%q%q", g.Name, g.After)
		}
		fmt.Fprintf(h, "a%v", sortedAssignments(p.Assignments))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func sortedAssignments(m map[plugin.Name]string) []string {
	out := make([]string, 0, len(m))
	for n, g := range m {
		out = append(out, n.Key()+"="+g)
	}
	slices.Sort(out)
	return out
}

// providerDiagnostics are the diagnostics of the providers plus one about
// the provided rules left out because they closed a cycle with the user's
// data or the masters (D141). A provided group left out is not reported:
// groups give way by design, as in LOOT.
func (st *state) providerDiagnostics() []diagnostic.Diagnostic {
	out := append([]diagnostic.Diagnostic{}, st.provided...)
	var sk []plugin.Skipped
	for _, x := range st.effective.Skipped() {
		if x.Kind == "rule" {
			sk = append(sk, x)
		}
	}
	if len(sk) == 0 {
		return out
	}
	var items []string
	ev := make([]diagnostic.Evidence, 0, len(sk))
	for _, x := range sk {
		items = append(items, string(x.Plugin)+" → "+x.After)
		ev = append(ev, diagnostic.Evidence{Kind: "provider_" + x.Kind, Params: diagnostic.Params{"plugin": string(x.Plugin), "after": x.After, "group": x.Group}})
	}
	d, err := diagnostic.New(diagnostic.Spec{
		Code: diagnostic.CodePluginProviderSkipped, Severity: diagnostic.SeverityInfo,
		Params:   diagnostic.Params{"count": strconv.Itoa(len(sk)), "items": strings.Join(items, "; ")},
		Evidence: ev,
		Actions:  []diagnostic.Action{{ID: "plugins.open_rules", NavigateTo: pluginhealth.NavigatePluginRules}},
		Related:  []event.EntityRef{{Kind: "instance", ID: string(st.inst.ID)}},
	})
	if err == nil {
		out = append(out, d)
	}
	return out
}
