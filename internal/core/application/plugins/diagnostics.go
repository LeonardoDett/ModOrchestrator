package plugins

import (
	"context"
	"errors"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/plugin"
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
	f := health.PluginFacts{Disabled: st.disabled, Losing: st.losing, Cycle: a.cycle, LockConflict: a.lockConflict}
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
		f.Plugins = append(f.Plugins, health.PluginFact{
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
	return health.PluginChecks(f)
}
