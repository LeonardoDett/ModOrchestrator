package plugins

import (
	"context"
	"strings"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/overview"
	"modorchestrator/internal/core/application/profiles"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/pluginhealth"
	"modorchestrator/internal/core/domain/profile"
)

// The plugins module enters the core through contribution points (D133):
// the core services list modules and never name this one. Each point is a
// small interface the service declares; the methods below answer them.
//
//   - deployment.PostDeploy: AfterDeploy (file.go) writes the load order.
//   - diagnostics.Module: Diagnostics, Commands, Places, Execute, Report.
//   - overview.FigureSource: Figure.
//   - profiles.Section: SectionID, Count, Compare.
//   - library.FileStates: Inactive.

// Commands lists the diagnostic actions the module runs.
func (s *Service) Commands() []string {
	return []string{pluginhealth.ActionEnablePlugin, pluginhealth.ActionDisablePlugin, pluginhealth.ActionRemovePluginRule}
}

// Places lists the navigation targets of its diagnostic actions.
func (s *Service) Places() []string {
	return []string{pluginhealth.NavigatePlugins, pluginhealth.NavigatePluginRules, pluginhealth.NavigateLoadOrder, pluginhealth.NavigateLoadOrderCheck}
}

// Execute runs one of its diagnostic actions.
func (s *Service) Execute(ctx context.Context, instance game.InstanceID, a diagnostic.Action) error {
	switch a.ID {
	case pluginhealth.ActionEnablePlugin, pluginhealth.ActionDisablePlugin:
		var names []plugin.Name
		for _, n := range strings.Split(a.Params["plugin"], ", ") {
			if n != "" {
				names = append(names, plugin.Name(n))
			}
		}
		return s.SetPluginsEnabled(ctx, instance, names, a.ID == pluginhealth.ActionEnablePlugin)
	case pluginhealth.ActionRemovePluginRule:
		var id plugin.RuleID
		if a.Target != nil {
			id = plugin.RuleID(a.Target.ID)
		}
		return s.RemovePluginRule(ctx, instance, id)
	}
	// Diagnostics only routes the actions of Commands here; the code is
	// diagnostics.CodeActionInvalid.
	return fail("diagnostic_action_invalid", nil, "action", a.ID)
}

// Report is the load order in the game's format for the support bundle; a
// game without plugins has none.
func (s *Service) Report(ctx context.Context, instance game.InstanceID) (string, []string, bool) {
	text, err := s.Export(ctx, instance)
	if err != nil {
		return "", nil, false
	}
	return "loadOrder", strings.Split(strings.TrimSpace(text), "\n"), true
}

// Figure is the number of active plugins of the Overview, with the limits.
func (s *Service) Figure(ctx context.Context, instance game.InstanceID) (overview.Figure, bool) {
	if !s.Supported(ctx, instance) {
		return overview.Figure{}, false
	}
	pl, err := s.List(ctx, instance)
	if err != nil {
		return overview.Figure{}, false
	}
	f := overview.Figure{Section: games.SectionOverviewPlugins, Count: pl.Active}
	for _, l := range pl.Limits {
		f.Limits = append(f.Limits, overview.LimitView{Kind: l.Kind, Used: l.Used, Max: l.Max})
	}
	return f, true
}

// SectionID is the id of the plugins section of a profile.
func (s *Service) SectionID() string { return plugin.SectionID }

// Count is the number of plugins a profile keeps enabled.
func (s *Service) Count(p *profile.Profile) int {
	st, err := plugin.StateOf(p)
	if err != nil {
		return 0
	}
	return len(st.Active())
}

// Compare is what differs in the plugins section of two profiles.
func (s *Service) Compare(a, b *profile.Profile) profiles.SectionDiff {
	sa, errA := plugin.StateOf(a)
	sb, errB := plugin.StateOf(b)
	if errA != nil || errB != nil {
		return profiles.SectionDiff{}
	}
	d := plugin.Compare(sa, sb)
	out := profiles.SectionDiff{OnlyA: nameStrings(d.OnlyA), OnlyB: nameStrings(d.OnlyB)}
	for _, m := range d.Moved {
		out.Moved = append(out.Moved, profiles.PositionDiff{Item: string(m.Plugin), A: m.A, B: m.B})
	}
	return out
}

// Inactive reports whether a present file is a plugin the profile keeps
// disabled (FOMOD conditions, D086).
func (s *Service) Inactive(p *profile.Profile, file string) bool {
	st, err := plugin.StateOf(p)
	if err != nil {
		return false
	}
	enabled, known := st.Enabled(plugin.Name(file))
	return known && !enabled
}

func nameStrings(ns []plugin.Name) []string {
	out := make([]string, len(ns))
	for i, n := range ns {
		out[i] = string(n)
	}
	return out
}
