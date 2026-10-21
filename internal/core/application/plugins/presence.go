package plugins

import (
	"context"
	"errors"
	"strings"

	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/plugin"

	"modorchestrator/internal/core/domain/game"
)

// Presence is the state of a plugin another module asks about (the plugins
// a save uses, D142): whether the active profile loads it, whether the game
// folder will have it, and which installed mods provide its file, enabled
// or not.
type Presence struct {
	Present bool
	Active  bool
	Mods    []mod.ID
}

// PresenceOf answers for each name, by its key; ok is false for a game
// without plugins.
func (s *Service) PresenceOf(ctx context.Context, instance game.InstanceID, names []string) (map[string]Presence, bool, error) {
	st, err := s.load(ctx, instance)
	if err != nil {
		var e *Error
		if errors.As(err, &e) && e.code == CodeNoPlugins {
			return nil, false, nil
		}
		return nil, false, err
	}
	out := make(map[string]Presence, len(names))
	for _, n := range names {
		k := plugin.Name(n).Key()
		var pr Presence
		if p, ok := st.plugin(plugin.Name(n)); ok {
			pr.Present, pr.Active = true, st.enabled(p)
		}
		out[k] = pr
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, false, err
	}
	target := st.ps.PluginTarget(st.inst.Game)
	for _, m := range list {
		if m.State != mod.StateInstalled || m.Installation == "" {
			continue
		}
		files, err := s.rootFiles(ctx, m.Installation, target)
		if err != nil {
			return nil, false, err
		}
		for _, f := range files {
			k := strings.ToLower(f.Dest.Path.String())
			if pr, ok := out[k]; ok {
				pr.Mods = append(pr.Mods, m.ID)
				out[k] = pr
			}
		}
	}
	return out, true, nil
}

// EnableNames activates plugins of the active profile by name; names the
// inventory does not have are skipped.
func (s *Service) EnableNames(ctx context.Context, instance game.InstanceID, names []string) error {
	st, err := s.load(ctx, instance)
	if err != nil {
		return err
	}
	var list []plugin.Name
	for _, n := range names {
		if p, ok := st.plugin(plugin.Name(n)); ok && !p.Implicit {
			list = append(list, p.Name)
		}
	}
	if len(list) == 0 {
		return nil
	}
	return s.SetPluginsEnabled(ctx, instance, list, true)
}
