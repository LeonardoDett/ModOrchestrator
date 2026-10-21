package plugins

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/pluginhealth"
)

// Diagnostics derives the plugin checks of an instance (core/08 §8). A
// game without the plugins capability has none.
func (s *Service) Diagnostics(ctx context.Context, instance game.InstanceID) ([]diagnostic.Diagnostic, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		var e *Error
		if errors.As(err, &e) && e.code == CodeNoPlugins {
			return nil, nil
		}
		return nil, err
	}
	return s.diagnostics(ctx, st, st.arrange(st.settings.autoSort))
}

func (s *Service) diagnostics(ctx context.Context, st *state, a arrangement) ([]diagnostic.Diagnostic, error) {
	f := pluginhealth.PluginFacts{Disabled: st.disabled, Losing: st.losing, Cycle: a.cycle, LockConflict: a.lockConflict}
	var active []plugin.Plugin
	for _, n := range a.order {
		p, ok := st.plugin(n)
		if !ok {
			continue
		}
		on := st.enabled(p)
		if on {
			active = append(active, p)
		}
		f.Plugins = append(f.Plugins, pluginhealth.PluginFact{
			Name: p.Name, Enabled: on, Implicit: p.Implicit, Masters: p.Header.Masters,
			HeaderError: p.HeaderError, Mod: p.Mod, ModName: st.modNames[p.Mod],
		})
	}
	_, f.Limits = st.ps.Indexes(st.inst.Game, active)
	f.OrphanRules = st.rules.Orphans(st.known())
	if pa, ok := st.ps.(ports.PluginArchives); ok {
		seen := map[string]bool{}
		var files []string
		for _, n := range st.rootFiles {
			if !seen[strings.ToLower(n)] {
				seen[strings.ToLower(n)] = true
				files = append(files, n)
			}
		}
		names := make([]plugin.Name, len(active))
		for i, p := range active {
			names[i] = p.Name
		}
		f.Archives = pa.OrphanArchives(st.inst.Game, files, names)
	}
	adapterDiags, err := s.archiveChecks(ctx, st, active)
	if err != nil {
		return nil, err
	}
	if st.lo != nil {
		fs, err := s.fileState(ctx, st, a.order)
		if err != nil {
			return nil, err
		}
		if fs.external {
			f.External = true
			var order []plugin.Name
			for _, e := range fs.obs.entries {
				if p, ok := st.plugin(e.Name); ok && e.Enabled {
					order = append(order, p.Name)
				}
			}
			// The implicit plugins load first whatever the file says.
			full := append(append([]plugin.Name{}, st.implicit...), order...)
			seen := map[string]bool{}
			var uniq []plugin.Name
			for _, n := range full {
				if !seen[n.Key()] {
					seen[n.Key()] = true
					uniq = append(uniq, n)
				}
			}
			f.ExternalViolations = plugin.Violations(uniq, st.hard)
		}
	}
	out, err := pluginhealth.PluginChecks(f)
	if err != nil {
		return nil, err
	}
	out = append(out, adapterDiags...)
	return append(out, st.providerDiagnostics()...), nil
}

// archiveChecks asks the adapter to check the archives the active plugins
// load (D141). Each file is the one that wins its Location among the
// enabled mods; files the manager does not deploy are not the adapter's
// to judge here.
func (s *Service) archiveChecks(ctx context.Context, st *state, active []plugin.Plugin) ([]diagnostic.Diagnostic, error) {
	ac, ok := st.ps.(ports.ArchiveChecker)
	if !ok || len(st.roots.Enabled) == 0 {
		return nil, nil
	}
	res := conflict.Calculate(st.roots)
	files := make([]ports.TargetFile, 0, len(res.Winners))
	for _, w := range res.Winners {
		files = append(files, ports.TargetFile{
			Name: w.Location.Path.String(), Mod: w.Mod, ModName: st.modNames[w.Mod],
			Source: game.JoinPath(game.JoinPath(st.inst.Staging, string(w.Mod)), w.File.Source.String()),
		})
	}
	names := make([]plugin.Name, len(active))
	for i, p := range active {
		names[i] = p.Name
	}
	specs, err := ac.ArchiveChecks(ctx, s.FS, st.inst, files, names)
	if err != nil {
		return nil, err
	}
	out := make([]diagnostic.Diagnostic, 0, len(specs))
	for _, sp := range specs {
		// A code outside the catalog would have no module and no text (D131).
		if !s.Registry.Diagnostics().Has(sp.Code) {
			return nil, fmt.Errorf("plugins: adapter %s emitted undeclared code %q", st.inst.Adapter, sp.Code)
		}
		d, err := diagnostic.New(sp)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}
