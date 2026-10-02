// Package health holds the pure health checks of the core (core/06,
// core/10 §1): functions from loaded facts to diagnostics. They never touch
// the disk or the database; the diagnostics service gathers the facts and
// recomputes the checks after their triggers, so the current set of
// problems is always derived, never accumulated (anti-pattern 13).
package health

import (
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/domain/dependency"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/rules"
)

// Action ids of the rule checks (core/06 §5). Commands are executed by the
// diagnostics service; navigations open the place where the problem is
// solved (INV-OPS-06).
const (
	ActionEnableMod      = "mods.enable"
	ActionDisableMod     = "mods.disable"
	ActionRemoveRule     = "rules.remove"
	ActionDisableRule    = "rules.disable"
	ActionImport         = "mods.import"
	ActionOpenCycle      = "rules.open_cycle"
	NavigateImport       = "mods.import"
	NavigateRules        = "mods.rules"
	OperationReorder     = operation.Kind("reorder")
	OperationDeploy      = operation.Kind("deploy")
	OperationPurge       = operation.Kind("purge")
	OperationLaunch      = operation.Kind("launch")
	OperationImport      = operation.Kind("import")
	subjectMod           = "mod"
	subjectRule          = "rule"
	evidenceRule         = "rule"
	evidenceRequirement  = "requirement"
	evidenceCycleMember  = "cycle_member"
	evidenceIncompatible = "incompatible_mod"
)

// ModFact is what the rule checks need to know about a mod of the library.
type ModFact struct {
	ID      mod.ID
	Name    string
	State   mod.State
	Enabled bool
}

// present reports whether the mod is still in the library (not removed).
func (f ModFact) present() bool { return f.State != "" && f.State != mod.StateRemoved }

// Mods indexes facts by id.
type Mods map[mod.ID]ModFact

func (m Mods) name(id mod.ID) string {
	if f, ok := m[id]; ok && f.Name != "" {
		return f.Name
	}
	return string(id)
}

func (m Mods) enabled(id mod.ID) bool {
	f, ok := m[id]
	return ok && f.Enabled && f.State == mod.StateInstalled
}

// RuleChecks derives rule_cycle, mods_incompatible, mod_requirement_missing,
// mod_recommendation_missing and rule_orphan (core/06 §4, core/10 §1.1).
// Disabled rules are never evaluated. A requirement is evaluated only while
// the requiring mod is enabled: importing and enabling are never blocked
// (core/06 §4), and a requirement of a disabled mod is no problem yet.
func RuleChecks(set *rules.Set, mods Mods) ([]diagnostic.Diagnostic, error) {
	var out []diagnostic.Diagnostic
	add := func(s diagnostic.Spec) error {
		d, err := diagnostic.New(s)
		if err == nil {
			out = append(out, d)
		}
		return err
	}
	if c, cyclic := set.Cycle(); cyclic {
		if err := add(cycleSpec(c.Items, mods)); err != nil {
			return nil, err
		}
	}
	installed := map[mod.ID]bool{}
	for id, f := range mods {
		installed[id] = f.present()
	}
	orphans := map[rules.ID]bool{}
	for _, id := range set.Orphans(installed) {
		orphans[id] = true
	}
	for _, r := range set.IncompatibilityRules() {
		if r.Disabled || orphans[r.ID] || !mods.enabled(r.A) || !mods.enabled(r.B) {
			continue
		}
		if err := add(incompatibleSpec(r, mods)); err != nil {
			return nil, err
		}
	}
	for _, r := range set.DependencyRules() {
		if r.Disabled || orphans[r.ID] || !mods.enabled(r.Mod) {
			continue
		}
		res, err := Evaluate(r, mods)
		if err != nil {
			return nil, err
		}
		if res.Status == dependency.StatusSatisfied {
			continue
		}
		if err := add(requirementSpec(r, res, mods)); err != nil {
			return nil, err
		}
	}
	for _, id := range sortedIDs(orphans) {
		if s, ok := orphanSpec(set, id, mods); ok {
			if err := add(s); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// Evaluate gives the state of a requirement (core/06 §2): satisfied when
// the target is installed and enabled, disabled when it is installed but
// disabled, missing when it is not in the library (removed, or not
// installed yet).
func Evaluate(r rules.DependencyRule, mods Mods) (dependency.Result, error) {
	dep := dependency.Dependency{
		ID: dependency.ID(r.ID), Source: event.EntityRef{Kind: subjectMod, ID: string(r.Mod)},
		Kind: dependency.KindMod, Target: string(r.Target), Optional: r.Kind == rules.Recommends,
	}
	t, ok := mods[r.Target]
	switch {
	case ok && t.State == mod.StateInstalled && t.Enabled:
		return dependency.NewResult(dep, dependency.StatusSatisfied, nil)
	case ok && t.State == mod.StateInstalled:
		return dependency.NewResult(dep, dependency.StatusDisabled, map[string]string{"target": mods.name(r.Target)})
	default:
		state := "removed"
		if ok && t.present() {
			state = string(t.State)
		}
		return dependency.NewResult(dep, dependency.StatusMissing, map[string]string{"target": mods.name(r.Target), "state": state})
	}
}

func cycleSpec(items []ordering.Item, mods Mods) diagnostic.Spec {
	var (
		evidence []diagnostic.Evidence
		related  []event.EntityRef
		names    []string
	)
	for _, it := range items {
		ref := event.EntityRef{Kind: subjectMod, ID: string(it)}
		names = append(names, mods.name(mod.ID(it)))
		related = append(related, ref)
		evidence = append(evidence, diagnostic.Evidence{Kind: evidenceCycleMember, Ref: &ref, Params: diagnostic.Params{"mod": mods.name(mod.ID(it))}})
	}
	if len(names) > 0 {
		names = append(names, names[0])
	}
	params := diagnostic.Params{"count": strconv.Itoa(len(items)), "cycle": joinArrow(names)}
	return diagnostic.Spec{
		Code: diagnostic.CodeRuleCycle, Severity: diagnostic.SeverityError, Params: params,
		Evidence: evidence, Related: related,
		Actions: []diagnostic.Action{{ID: ActionOpenCycle, NavigateTo: NavigateRules, Params: params}},
		Blocks:  []operation.Kind{OperationReorder, OperationDeploy},
	}
}

func incompatibleSpec(r rules.IncompatibilityRule, mods Mods) diagnostic.Spec {
	a, b := event.EntityRef{Kind: subjectMod, ID: string(r.A)}, event.EntityRef{Kind: subjectMod, ID: string(r.B)}
	ruleRef := event.EntityRef{Kind: subjectRule, ID: string(r.ID)}
	params := diagnostic.Params{"a": mods.name(r.A), "b": mods.name(r.B), "rule": string(r.ID), "source": string(r.Source)}
	return diagnostic.Spec{
		Code: diagnostic.CodeModsIncompatible, Severity: diagnostic.SeverityError, Params: params,
		Evidence: []diagnostic.Evidence{
			{Kind: evidenceRule, Ref: &ruleRef, Params: diagnostic.Params{"kind": "incompatible", "a": params["a"], "b": params["b"], "source": params["source"]}},
			{Kind: evidenceIncompatible, Ref: &a, Params: diagnostic.Params{"mod": params["a"]}},
			{Kind: evidenceIncompatible, Ref: &b, Params: diagnostic.Params{"mod": params["b"]}},
		},
		Actions: []diagnostic.Action{
			{ID: ActionDisableMod, Target: &a, Params: diagnostic.Params{"mod": params["a"]}},
			{ID: ActionDisableMod, Target: &b, Params: diagnostic.Params{"mod": params["b"]}},
			{ID: ActionDisableRule, Target: &ruleRef},
		},
		Blocks:  []operation.Kind{OperationDeploy},
		Related: []event.EntityRef{a, b, ruleRef},
	}
}

func requirementSpec(r rules.DependencyRule, res dependency.Result, mods Mods) diagnostic.Spec {
	src, tgt := event.EntityRef{Kind: subjectMod, ID: string(r.Mod)}, event.EntityRef{Kind: subjectMod, ID: string(r.Target)}
	ruleRef := event.EntityRef{Kind: subjectRule, ID: string(r.ID)}
	params := diagnostic.Params{"mod": mods.name(r.Mod), "target": mods.name(r.Target), "status": string(res.Status), "source": string(r.Source)}
	ev := diagnostic.Params{"status": string(res.Status)}
	for k, v := range res.Evidence {
		ev[k] = v
	}
	code, severity := diagnostic.CodeModRequirementMissing, diagnostic.SeverityError
	if r.Kind == rules.Recommends {
		code, severity = diagnostic.CodeModRecommendation, diagnostic.SeverityInfo
	}
	var actions []diagnostic.Action
	if res.Status == dependency.StatusDisabled {
		actions = append(actions, diagnostic.Action{ID: ActionEnableMod, Target: &tgt, Params: diagnostic.Params{"mod": params["target"]}})
	} else {
		actions = append(actions, diagnostic.Action{ID: ActionImport, NavigateTo: NavigateImport, Params: diagnostic.Params{"mod": params["target"]}})
	}
	if r.Source == rules.SourceUser {
		actions = append(actions, diagnostic.Action{ID: ActionRemoveRule, Target: &ruleRef})
	} else {
		actions = append(actions, diagnostic.Action{ID: ActionDisableRule, Target: &ruleRef})
	}
	return diagnostic.Spec{
		Code: code, Severity: severity, Params: params,
		Evidence: []diagnostic.Evidence{
			{Kind: evidenceRule, Ref: &ruleRef, Params: diagnostic.Params{"kind": string(r.Kind), "mod": params["mod"], "target": params["target"], "source": params["source"]}},
			{Kind: evidenceRequirement, Ref: &tgt, Params: ev},
		},
		Actions: actions,
		Related: []event.EntityRef{src, tgt, ruleRef},
	}
}

func orphanSpec(set *rules.Set, id rules.ID, mods Mods) (diagnostic.Spec, bool) {
	ruleRef := event.EntityRef{Kind: subjectRule, ID: string(id)}
	var (
		params    diagnostic.Params
		source    rules.Source
		disabled  bool
		gone      []mod.ID
		mentioned []mod.ID
	)
	for _, r := range set.OrderRules() {
		if r.ID == id {
			params, source, disabled = diagnostic.Params{"kind": "wins", "winner": mods.name(r.After), "loser": mods.name(r.Before)}, r.Source, r.Disabled
			mentioned = []mod.ID{r.After, r.Before}
		}
	}
	for _, r := range set.DependencyRules() {
		if r.ID == id {
			params, source, disabled = diagnostic.Params{"kind": string(r.Kind), "mod": mods.name(r.Mod), "target": mods.name(r.Target)}, r.Source, r.Disabled
			mentioned = []mod.ID{r.Mod}
		}
	}
	for _, r := range set.IncompatibilityRules() {
		if r.ID == id {
			params, source, disabled = diagnostic.Params{"kind": "incompatible", "a": mods.name(r.A), "b": mods.name(r.B)}, r.Source, r.Disabled
			mentioned = []mod.ID{r.A, r.B}
		}
	}
	if params == nil || disabled {
		return diagnostic.Spec{}, false
	}
	for _, m := range mentioned {
		if f, ok := mods[m]; !ok || !f.present() {
			gone = append(gone, m)
		}
	}
	params["source"] = string(source)
	missing := make([]string, len(gone))
	for i, m := range gone {
		missing[i] = mods.name(m)
	}
	params["missing"] = joinComma(missing)
	action := diagnostic.Action{ID: ActionRemoveRule, Target: &ruleRef}
	if source != rules.SourceUser {
		action.ID = ActionDisableRule
	}
	return diagnostic.Spec{
		Code: diagnostic.CodeRuleOrphan, Severity: diagnostic.SeverityWarning, Params: params,
		Evidence: []diagnostic.Evidence{{Kind: evidenceRule, Ref: &ruleRef, Params: params}},
		Actions:  []diagnostic.Action{action},
		Related:  []event.EntityRef{ruleRef},
	}, true
}

func sortedIDs(m map[rules.ID]bool) []rules.ID {
	out := make([]rules.ID, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}

func joinArrow(parts []string) string { return strings.Join(parts, " → ") }
func joinComma(parts []string) string { return strings.Join(parts, ", ") }
