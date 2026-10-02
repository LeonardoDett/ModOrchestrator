package integration_test

import (
	"errors"
	"slices"
	"testing"

	diagsvc "modorchestrator/internal/core/application/diagnostics"
	historysvc "modorchestrator/internal/core/application/history"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/notification"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/rules"
)

func (e *env) problems() diagsvc.View {
	e.t.Helper()
	v, err := e.diag.Problems(ctx, e.inst.ID)
	if err != nil {
		e.t.Fatal(err)
	}
	return v
}

func (e *env) problem(code diagnostic.Code) (diagsvc.Item, bool) {
	e.t.Helper()
	for _, it := range e.problems().Items {
		if it.Code == code {
			return it, true
		}
	}
	return diagsvc.Item{}, false
}

func coded(err error) string {
	var c interface{ Code() string }
	if errors.As(err, &c) {
		return c.Code()
	}
	return ""
}

// F9 demonstration: a mod whose requirement is disabled gets a diagnostic
// with "Enable"; executing it solves the problem and the diagnostic is
// gone on the next read (core/06 §7).
func TestRequirementDisabledIsSolvedByItsAction(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Patch", "Base")
	if _, err := e.prof.AddDependency(ctx, e.inst.ID, ids[0], ids[1], rules.Requires); err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[1]}, false); err != nil {
		t.Fatal(err)
	}
	it, ok := e.problem(diagnostic.CodeModRequirementMissing)
	if !ok {
		t.Fatalf("missing diagnostic: %+v", e.problems().Items)
	}
	if it.Params["mod"] != "Patch" || it.Params["target"] != "Base" || it.Params["status"] != "disabled" || it.Module != diagnostic.ModuleRules {
		t.Fatalf("params = %+v", it.Params)
	}
	a := it.Actions[0]
	if a.ID != health.ActionEnableMod || a.Target.ID != string(ids[1]) {
		t.Fatalf("first action = %+v", a)
	}
	// Enabling is never blocked by a requirement (core/06 §4).
	if _, err := e.diag.Execute(ctx, e.inst.ID, it.Key, a.ID, 0); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.problem(diagnostic.CodeModRequirementMissing); ok {
		t.Fatal("the diagnostic disappears once its cause is gone")
	}
	if _, err := e.diag.Execute(ctx, e.inst.ID, it.Key, a.ID, 0); coded(err) != diagsvc.CodeNotFound {
		t.Fatalf("a solved diagnostic refuses its action: %v", err)
	}
}

// Incompatible mods enabled together block the deploy with both names, in
// the diagnostic, in the status and in the operation error (core/06 §7).
func TestIncompatibleModsBlockDeploy(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Alpha", "Beta")
	if _, err := e.prof.AddIncompatibility(ctx, e.inst.ID, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	it, ok := e.problem(diagnostic.CodeModsIncompatible)
	if !ok || !it.BlocksOperation("deploy") || it.Params["a"] != "Alpha" || it.Params["b"] != "Beta" {
		t.Fatalf("incompatible diagnostic = %+v %v", it, ok)
	}
	if v := e.status(); v.Status.Kind != deploystate.Blocked || v.Status.Reason != deploystate.ReasonModsIncompatible {
		t.Fatalf("status = %+v", v.Status)
	}
	op := e.deploy(operation.Kind("deploy"))
	if op.Status != operation.StatusFailed || op.Error == nil || op.Error.Code != "mods_incompatible" ||
		op.Error.Params["a"] != "Alpha" || op.Error.Params["b"] != "Beta" {
		t.Fatalf("deploy = %s %+v", op.Status, op.Error)
	}
	if err := e.diag.Suppress(ctx, e.inst.ID, it.Key, false); coded(err) != diagsvc.CodeNotSuppressible {
		t.Fatalf("blocking diagnostics cannot be suppressed: %v", err)
	}
	// "Disable B" (second action) resolves it and the deploy runs.
	if it.Actions[1].ID != health.ActionDisableMod || it.Actions[1].Target.ID != string(ids[1]) {
		t.Fatalf("actions = %+v", it.Actions)
	}
	if _, err := e.diag.Execute(ctx, e.inst.ID, it.Key, it.Actions[1].ID, 1); err != nil {
		t.Fatal(err)
	}
	if op := e.deploy(operation.Kind("deploy")); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy after resolving = %s %+v", op.Status, op.Error)
	}
}

// A suppressed warning leaves the list (and the counts, and the
// notifications) and comes back with "Reativar" (core/10 §5).
func TestSuppressionHidesAndRestores(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Old", "New")
	if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, ids[1], ids[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := e.lib.RemoveMods(ctx, e.inst.ID, []mod.ID{ids[0]}, false); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	it, ok := e.problem(diagnostic.CodeRuleOrphan)
	if !ok || it.Params["missing"] != "Old" {
		t.Fatalf("orphan = %+v %v", it, ok)
	}
	warnings := e.problems().Counts.Warnings
	if err := e.diag.Suppress(ctx, e.inst.ID, it.Key, false); err != nil {
		t.Fatal(err)
	}
	v := e.problems()
	if slices.ContainsFunc(v.Items, func(x diagsvc.Item) bool { return x.Key == it.Key }) || v.Counts.Warnings != warnings-1 {
		t.Fatalf("suppressed diagnostic still visible: %+v", v.Counts)
	}
	if len(v.Suppressed) != 1 || v.Suppressed[0].Key != it.Key {
		t.Fatalf("suppressed list = %+v", v.Suppressed)
	}
	if changed, err := e.diag.Refresh(ctx, e.inst.ID); err != nil || !changed {
		t.Fatalf("refresh = %v %v", changed, err)
	}
	ns, _ := e.diag.Notifications(ctx, 0)
	if slices.ContainsFunc(ns, func(n *notificationT) bool { return n.Code == string(diagnostic.CodeRuleOrphan) }) {
		t.Fatal("a suppressed warning does not notify")
	}
	if err := e.diag.Unsuppress(ctx, it.Key, ""); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.problem(diagnostic.CodeRuleOrphan); !ok {
		t.Fatal("reactivated diagnostic is visible again")
	}
}

// A warning notifies once when it appears, not on every evaluation, and
// several of the same code aggregate (core/10 §2).
func TestWarningNotifiesOnceAndAggregates(t *testing.T) {
	e := newEnv(t)
	if _, err := e.diag.Refresh(ctx, e.inst.ID); err != nil {
		t.Fatal(err)
	}
	ids := e.installMods("A", "B", "C")
	for _, w := range []int{1, 2} {
		if _, err := e.prof.CreateOrderRule(ctx, e.inst.ID, ids[w], ids[0]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := e.lib.RemoveMods(ctx, e.inst.ID, []mod.ID{ids[0]}, false); err != nil {
		t.Fatal(err)
	}
	e.lib.Wait()
	for range 3 {
		if _, err := e.diag.Refresh(ctx, e.inst.ID); err != nil {
			t.Fatal(err)
		}
	}
	ns, err := e.diag.Notifications(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	var orphan []*notificationT
	for _, n := range ns {
		if n.Code == string(diagnostic.CodeRuleOrphan) {
			orphan = append(orphan, n)
		}
	}
	if len(orphan) != 1 || orphan[0].Count != 2 || orphan[0].Instance != string(e.inst.ID) {
		t.Fatalf("orphan notifications = %+v", orphan)
	}
	if err := e.diag.MarkRead(ctx, nil); err != nil {
		t.Fatal(err)
	}
	ns, _ = e.diag.Notifications(ctx, 0)
	for _, n := range ns {
		if n.State != "read" {
			t.Fatalf("mark all read left %+v", n)
		}
	}
}

// Reverting "enable X" from the history disables X with a new entry; the
// history of a mod shows its whole life (core/10 §5, diagnostics.md §4).
func TestHistoryRevertsAndFiltersByMod(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Target", "Other")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[0]}, false); err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[0]}, true); err != nil {
		t.Fatal(err)
	}
	life, err := e.hist.List(ctx, historysvc.Filter{Instance: e.inst.ID, Mod: string(ids[0])})
	if err != nil {
		t.Fatal(err)
	}
	var types []string
	for _, en := range life {
		types = append(types, en.Type)
	}
	for _, want := range []string{"mod.imported", "mod.installed", "mod.disabled", "mod.enabled"} {
		if !slices.Contains(types, want) {
			t.Fatalf("history of the mod lacks %s: %v", want, types)
		}
	}
	if slices.ContainsFunc(life, func(en historysvc.Entry) bool { return en.Subject.ID == string(ids[1]) }) {
		t.Fatal("filter by mod leaks other mods")
	}
	enable := life[0]
	if enable.Type != "mod.enabled" || !enable.Reversible || enable.Origin != ports.OriginUser {
		t.Fatalf("newest entry = %+v", enable)
	}
	if err := e.hist.Revert(ctx, enable.ID); err != nil {
		t.Fatal(err)
	}
	if e.active().IsEnabled(ids[0]) {
		t.Fatal("reverting enable disables the mod")
	}
	after, _ := e.hist.List(ctx, historysvc.Filter{Instance: e.inst.ID, Mod: string(ids[0]), Limit: 2})
	if after[0].Type != "mod.disabled" || after[0].RevertOf != enable.ID || after[1].RevertedBy != after[0].ID || after[1].Reversible {
		t.Fatalf("revert entry = %+v / %+v", after[0], after[1])
	}
	if err := e.hist.Revert(ctx, enable.ID); coded(err) != historysvc.CodeAlreadyReverted {
		t.Fatalf("second revert = %v", err)
	}
}

// Rule creation and removal revert into each other, and a stale entry is
// refused instead of guessed.
func TestHistoryRevertsRules(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("Lower", "Upper")
	if _, err := e.prof.AddIncompatibility(ctx, e.inst.ID, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	list, _ := e.hist.List(ctx, historysvc.Filter{Instance: e.inst.ID, Types: []string{"rule."}})
	if len(list) != 1 || list[0].Type != "rule.created" {
		t.Fatalf("rule entries = %+v", list)
	}
	if err := e.hist.Revert(ctx, list[0].ID); err != nil {
		t.Fatal(err)
	}
	set, _ := e.rules.Get(ctx, e.inst.ID)
	if len(set.IncompatibilityRules()) != 0 {
		t.Fatal("reverting the creation removes the rule")
	}
	list, _ = e.hist.List(ctx, historysvc.Filter{Instance: e.inst.ID, Types: []string{"rule.removed"}})
	if err := e.hist.Revert(ctx, list[0].ID); err != nil {
		t.Fatal(err)
	}
	set, _ = e.rules.Get(ctx, e.inst.ID)
	if r := set.IncompatibilityRules(); len(r) != 1 || r[0].A != ids[0] || r[0].B != ids[1] {
		t.Fatalf("restored rules = %+v", r)
	}
	// Disable then re-enable outside the history: the disable entry is stale.
	rid := set.IncompatibilityRules()[0].ID
	e.prof.SetRuleDisabled(ctx, e.inst.ID, rid, true)
	e.prof.SetRuleDisabled(ctx, e.inst.ID, rid, false)
	list, _ = e.hist.List(ctx, historysvc.Filter{Instance: e.inst.ID, Types: []string{"rule.disabled"}})
	if err := e.hist.Revert(ctx, list[0].ID); coded(err) != historysvc.CodeStale {
		t.Fatalf("stale revert = %v", err)
	}
}

// INV-OPS-06: every blocking or error diagnostic offers at least one action
// that the backend executes or that opens a place the UI knows.
func TestEveryErrorLeadsToResolution(t *testing.T) {
	e := newEnv(t)
	ids := e.installMods("A", "B", "C", "D")
	e.prof.AddIncompatibility(ctx, e.inst.ID, ids[0], ids[1])
	e.prof.AddDependency(ctx, e.inst.ID, ids[2], ids[3], rules.Requires)
	e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[3]}, false)
	ds, _, err := e.diag.Evaluate(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	commands, places := diagsvc.Commands(), diagsvc.Places()
	errorsSeen := 0
	for _, d := range ds {
		for _, a := range d.Actions {
			if a.IsCommand() && !slices.Contains(commands, a.ID) || !a.IsCommand() && !slices.Contains(places, a.NavigateTo) {
				t.Errorf("%s: action %+v neither runs nor navigates to a known place", d.Code, a)
			}
		}
		if d.Severity == diagnostic.SeverityError {
			errorsSeen++
			if len(d.Actions) == 0 {
				t.Errorf("%s has no action", d.Code)
			}
		}
	}
	if errorsSeen < 2 {
		t.Fatalf("scenario should produce errors: %v", ds)
	}
}

type notificationT = notification.Notification
