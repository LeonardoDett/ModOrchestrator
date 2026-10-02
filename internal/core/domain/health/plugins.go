package health

import (
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
)

// Action ids and places of the plugin checks (core/08 §8, core/10 §1.1).
const (
	ActionEnablePlugin     = "plugins.enable"
	ActionDisablePlugin    = "plugins.disable"
	ActionRemovePluginRule = "plugins.remove_rule"
	NavigatePlugins        = "plugins"
	NavigatePluginRules    = "plugins.rules"
	NavigateLoadOrder      = "load_order"
	NavigateLoadOrderCheck = "load_order.review"
	NavigateConflicts      = "conflicts"
	// OperationSortPlugins is what a cycle of plugin rules blocks.
	OperationSortPlugins = operation.Kind("sort_plugins")
	// OperationApplyLoadOrder writes the game's load order file.
	OperationApplyLoadOrder = operation.Kind("apply_load_order")
	subjectPlugin           = "plugin"
	subjectPluginRule       = "plugin_rule"
)

// PluginFact is one plugin of the inventory, in load order.
type PluginFact struct {
	Name        plugin.Name
	Enabled     bool
	Implicit    bool
	Masters     []plugin.Name
	HeaderError string
	Mod         mod.ID
	ModName     string
}

// Provider is an installed mod whose plugin is not in the inventory (the
// mod is disabled or loses the file): enabling it may solve a missing
// master.
type Provider struct {
	Mod     mod.ID
	ModName string
}

// LosingPlugin is a plugin file two or more enabled mods provide: Winner
// deploys it (plugin_from_losing_file).
type LosingPlugin struct {
	Name       plugin.Name
	Winner     mod.ID
	WinnerName string
	Losers     []string
}

// PluginFacts is what the plugin checks need about one instance.
type PluginFacts struct {
	Plugins []PluginFact
	Limits  []plugin.LimitUsage
	// Disabled maps plugin keys outside the inventory to an installed mod
	// that provides them.
	Disabled    map[string]Provider
	OrphanRules []plugin.Rule
	// Cycle is set when rules, groups and hard constraints contradict
	// each other: the sort is blocked and the order stays (core/08 §5).
	Cycle *ordering.Cycle
	// LockConflict is set when an IndexLock contradicts the constraints:
	// the locks were left out of the last arrangement.
	LockConflict []plugin.Name
	Losing       []LosingPlugin
	// External is set when the game's load order file changed outside the
	// app (D040). ExternalViolations are the hard constraints the external
	// order breaks (plugin_master_order).
	External           bool
	ExternalViolations []ordering.Edge
	// Archives are archives no active plugin loads (adapter,
	// bsa_without_plugin).
	Archives []string
}

func pluginRef(n plugin.Name) event.EntityRef {
	return event.EntityRef{Kind: subjectPlugin, ID: n.Key()}
}

// PluginChecks derives the plugin diagnostics of core/08 §8.
func PluginChecks(f PluginFacts) ([]diagnostic.Diagnostic, error) {
	var out []diagnostic.Diagnostic
	add := func(s diagnostic.Spec) error {
		d, err := diagnostic.New(s)
		if err == nil {
			out = append(out, d)
		}
		return err
	}
	byKey := map[string]PluginFact{}
	for _, p := range f.Plugins {
		byKey[p.Name.Key()] = p
	}
	for _, p := range f.Plugins {
		if p.HeaderError != "" {
			if err := add(diagnostic.Spec{
				Code: diagnostic.CodePluginHeaderUnreadable, Severity: diagnostic.SeverityWarning,
				Params:   diagnostic.Params{"plugin": string(p.Name), "reason": p.HeaderError},
				Evidence: []diagnostic.Evidence{{Kind: "plugin", Params: diagnostic.Params{"plugin": string(p.Name)}}},
				Actions:  []diagnostic.Action{{ID: "plugins.show", NavigateTo: NavigatePlugins, Params: diagnostic.Params{"plugin": string(p.Name)}}},
				Related:  []event.EntityRef{pluginRef(p.Name)},
			}); err != nil {
				return nil, err
			}
		}
		if !p.Enabled {
			continue
		}
		var missing, inactive []plugin.Name
		for _, m := range p.Masters {
			mf, ok := byKey[m.Key()]
			switch {
			case !ok:
				missing = append(missing, m)
			case !mf.Enabled:
				inactive = append(inactive, mf.Name)
			}
		}
		if len(missing) > 0 {
			if err := add(missingMasterSpec(p, missing, f.Disabled)); err != nil {
				return nil, err
			}
		}
		if len(inactive) > 0 {
			ev := make([]diagnostic.Evidence, 0, len(inactive))
			for _, m := range inactive {
				ev = append(ev, diagnostic.Evidence{Kind: "plugin_master", Params: diagnostic.Params{"master": string(m), "state": "inactive"}})
			}
			if err := add(diagnostic.Spec{
				Code: diagnostic.CodePluginDisabledMaster, Severity: diagnostic.SeverityWarning,
				Params:   diagnostic.Params{"plugin": string(p.Name), "master": string(inactive[0]), "count": strconv.Itoa(len(inactive)), "masters": joinNames(inactive)},
				Evidence: ev,
				Actions: []diagnostic.Action{
					{ID: ActionEnablePlugin, Target: ptrRef(pluginRef(inactive[0])), Params: diagnostic.Params{"plugin": joinNames(inactive)}},
				},
				Related: []event.EntityRef{pluginRef(p.Name)},
			}); err != nil {
				return nil, err
			}
		}
	}
	for _, u := range f.Limits {
		if !u.Exceeded() {
			continue
		}
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodePluginLimitExceeded, Severity: diagnostic.SeverityError,
			Params:   diagnostic.Params{"kind": u.Kind, "count": strconv.Itoa(u.Used), "max": strconv.Itoa(u.Max)},
			Evidence: []diagnostic.Evidence{{Kind: "plugin_limit", Params: diagnostic.Params{"kind": u.Kind, "count": strconv.Itoa(u.Used), "max": strconv.Itoa(u.Max)}}},
			Actions:  []diagnostic.Action{{ID: "plugins.open", NavigateTo: NavigatePlugins}},
			Related:  []event.EntityRef{{Kind: "plugin_limit", ID: u.Kind}},
		}); err != nil {
			return nil, err
		}
	}
	for _, r := range f.OrphanRules {
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodePluginRuleOrphan, Severity: diagnostic.SeverityWarning,
			Params:   diagnostic.Params{"plugin": string(r.Plugin), "after": string(r.After)},
			Evidence: []diagnostic.Evidence{{Kind: "plugin_rule", Params: diagnostic.Params{"plugin": string(r.Plugin), "after": string(r.After)}}},
			Actions: []diagnostic.Action{
				{ID: ActionRemovePluginRule, Target: &event.EntityRef{Kind: subjectPluginRule, ID: string(r.ID)}},
				{ID: "plugins.open_rules", NavigateTo: NavigatePluginRules},
			},
			Related: []event.EntityRef{{Kind: subjectPluginRule, ID: string(r.ID)}},
		}); err != nil {
			return nil, err
		}
	}
	if f.Cycle != nil {
		var names []string
		ev := make([]diagnostic.Evidence, 0, len(f.Cycle.Items))
		for i, it := range f.Cycle.Items {
			name := string(it)
			if p, ok := byKey[name]; ok {
				name = string(p.Name)
			}
			names = append(names, name)
			ev = append(ev, diagnostic.Evidence{Kind: "plugin_cycle_member", Params: diagnostic.Params{"plugin": name, "ref": f.Cycle.Edges[i].Ref}})
		}
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodePluginRuleCycle, Severity: diagnostic.SeverityError,
			Params:   diagnostic.Params{"plugins": strings.Join(names, " → "), "count": strconv.Itoa(len(names))},
			Evidence: ev,
			Actions:  []diagnostic.Action{{ID: "plugins.open_rules", NavigateTo: NavigatePluginRules}},
			Blocks:   []operation.Kind{OperationSortPlugins},
			Related:  []event.EntityRef{{Kind: "plugin_cycle", ID: "rules"}},
		}); err != nil {
			return nil, err
		}
	}
	if len(f.LockConflict) > 0 {
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodePluginLockConflict, Severity: diagnostic.SeverityWarning,
			Params:   diagnostic.Params{"plugin": string(f.LockConflict[0]), "count": strconv.Itoa(len(f.LockConflict)), "plugins": joinNames(f.LockConflict)},
			Evidence: []diagnostic.Evidence{{Kind: "index_lock", Params: diagnostic.Params{"plugins": joinNames(f.LockConflict)}}},
			Actions:  []diagnostic.Action{{ID: "load_order.open", NavigateTo: NavigateLoadOrder}},
			Related:  []event.EntityRef{{Kind: "plugin_lock", ID: "locks"}},
		}); err != nil {
			return nil, err
		}
	}
	for _, l := range f.Losing {
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodePluginFromLosingFile, Severity: diagnostic.SeverityInfo,
			Params:   diagnostic.Params{"plugin": string(l.Name), "mod": l.WinnerName, "count": strconv.Itoa(len(l.Losers)), "losers": strings.Join(l.Losers, ", ")},
			Evidence: []diagnostic.Evidence{{Kind: "plugin_provider", Ref: &event.EntityRef{Kind: "mod", ID: string(l.Winner)}, Params: diagnostic.Params{"mod": l.WinnerName}}},
			Actions:  []diagnostic.Action{{ID: "conflicts.open", NavigateTo: NavigateConflicts}},
			Related:  []event.EntityRef{pluginRef(l.Name)},
		}); err != nil {
			return nil, err
		}
	}
	for _, a := range f.Archives {
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodeBSAWithoutPlugin, Severity: diagnostic.SeverityInfo,
			Params:   diagnostic.Params{"archive": a},
			Evidence: []diagnostic.Evidence{{Kind: "archive_file", Params: diagnostic.Params{"archive": a}}},
			Actions:  []diagnostic.Action{{ID: "plugins.open", NavigateTo: NavigatePlugins}},
			Related:  []event.EntityRef{{Kind: "archive", ID: strings.ToLower(a)}},
		}); err != nil {
			return nil, err
		}
	}
	if f.External {
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodeLoadOrderExternalChange, Severity: diagnostic.SeverityWarning,
			Params:   diagnostic.Params{},
			Evidence: []diagnostic.Evidence{{Kind: "load_order_file", Params: diagnostic.Params{"state": "changed"}}},
			Actions:  []diagnostic.Action{{ID: "load_order.review", NavigateTo: NavigateLoadOrderCheck}},
			Related:  []event.EntityRef{{Kind: "load_order", ID: "file"}},
		}); err != nil {
			return nil, err
		}
		if len(f.ExternalViolations) > 0 {
			e := f.ExternalViolations[0]
			if err := add(diagnostic.Spec{
				Code: diagnostic.CodePluginMasterOrder, Severity: diagnostic.SeverityError,
				Params:   diagnostic.Params{"plugin": nameOf(byKey, e.After), "master": nameOf(byKey, e.Before), "count": strconv.Itoa(len(f.ExternalViolations))},
				Evidence: []diagnostic.Evidence{{Kind: "plugin_master", Params: diagnostic.Params{"plugin": nameOf(byKey, e.After), "master": nameOf(byKey, e.Before)}}},
				Actions:  []diagnostic.Action{{ID: "load_order.review", NavigateTo: NavigateLoadOrderCheck}},
				Related:  []event.EntityRef{{Kind: "load_order", ID: "master_order"}},
			}); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// missingMasterSpec: the plugin cannot load. The actions enable a mod that
// provides the master when one is installed, and always offer to
// deactivate the plugin (core/10 §1.1: "Mostrar fornecedor / Desativar").
func missingMasterSpec(p PluginFact, missing []plugin.Name, providers map[string]Provider) diagnostic.Spec {
	ev := make([]diagnostic.Evidence, 0, len(missing))
	var actions []diagnostic.Action
	seen := map[mod.ID]bool{}
	for _, m := range missing {
		ev = append(ev, diagnostic.Evidence{Kind: "plugin_master", Params: diagnostic.Params{"master": string(m), "state": "missing"}})
		if prov, ok := providers[m.Key()]; ok && !seen[prov.Mod] {
			seen[prov.Mod] = true
			actions = append(actions, diagnostic.Action{ID: ActionEnableMod, Target: &event.EntityRef{Kind: subjectMod, ID: string(prov.Mod)}, Params: diagnostic.Params{"mod": prov.ModName}})
		}
	}
	if len(actions) == 0 {
		actions = append(actions, diagnostic.Action{ID: ActionImport, NavigateTo: NavigateImport, Params: diagnostic.Params{"mod": string(missing[0])}})
	}
	actions = append(actions, diagnostic.Action{ID: ActionDisablePlugin, Target: ptrRef(pluginRef(p.Name)), Params: diagnostic.Params{"plugin": string(p.Name)}})
	params := diagnostic.Params{"plugin": string(p.Name), "master": string(missing[0]), "count": strconv.Itoa(len(missing)), "masters": joinNames(missing)}
	if p.ModName != "" {
		params["mod"] = p.ModName
	}
	return diagnostic.Spec{
		Code: diagnostic.CodePluginMissingMaster, Severity: diagnostic.SeverityError,
		Params: params, Evidence: ev, Actions: actions,
		Related: []event.EntityRef{pluginRef(p.Name)},
	}
}

func nameOf(byKey map[string]PluginFact, it ordering.Item) string {
	if p, ok := byKey[string(it)]; ok {
		return string(p.Name)
	}
	return string(it)
}

func joinNames(ns []plugin.Name) string {
	s := make([]string, len(ns))
	for i, n := range ns {
		s[i] = string(n)
	}
	return strings.Join(slices.Compact(s), ", ")
}

func ptrRef(r event.EntityRef) *event.EntityRef { return &r }
