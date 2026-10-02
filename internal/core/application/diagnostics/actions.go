package diagnostics

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/core/domain/rules"
)

// Error is a failure with a stable code and parameters (D044, D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("diagnostics: %s: %v", e.code, e.cause)
	}
	return "diagnostics: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

// Error codes of the service.
const (
	// CodeNotFound: the diagnostic no longer exists (it was resolved).
	CodeNotFound = "diagnostic_not_found"
	// CodeActionInvalid: the action is not offered by the diagnostic, or
	// it is a navigation the UI performs.
	CodeActionInvalid = "diagnostic_action_invalid"
	// CodeNotSuppressible: a blocking diagnostic cannot be hidden.
	CodeNotSuppressible = "diagnostic_not_suppressible"
)

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// ActionResult tells the UI what an executed action started.
type ActionResult struct {
	// Operations started by the action (deploy, install...), followed in
	// the operations drawer.
	Operations []operation.ID
}

// Execute runs a command action of the current diagnostic key
// (ExecuteDiagnosticAction, ui/telas/diagnostics.md §3). The diagnostic is
// evaluated again first: a problem that is already solved, or an action it
// does not offer, is refused, so the user never acts on stale data. The
// diagnostic disappears by itself when its cause is gone (core/10 §5).
func (s *Service) Execute(ctx context.Context, instance game.InstanceID, key diagnostic.Key, actionID string, index int) (ActionResult, error) {
	d, err := s.find(ctx, instance, key)
	if err != nil {
		return ActionResult{}, err
	}
	if index < 0 || index >= len(d.Actions) || d.Actions[index].ID != actionID || !d.Actions[index].IsCommand() {
		return ActionResult{}, fail(CodeActionInvalid, nil, "action", actionID)
	}
	a := d.Actions[index]
	target := func() string {
		if a.Target == nil {
			return ""
		}
		return a.Target.ID
	}
	var res ActionResult
	switch a.ID {
	case health.ActionEnableMod, health.ActionDisableMod:
		err = s.Commands.SetModsEnabled(ctx, instance, []mod.ID{mod.ID(target())}, a.ID == health.ActionEnableMod)
	case health.ActionRemoveRule:
		err = s.Commands.RemoveRule(ctx, instance, rules.ID(target()))
	case health.ActionDisableRule:
		err = s.Commands.SetRuleDisabled(ctx, instance, rules.ID(target()), true)
	case health.ActionEnablePlugin, health.ActionDisablePlugin:
		var names []plugin.Name
		for _, n := range strings.Split(a.Params["plugin"], ", ") {
			if n != "" {
				names = append(names, plugin.Name(n))
			}
		}
		if s.Plugins == nil {
			return ActionResult{}, fail(CodeActionInvalid, nil, "action", actionID)
		}
		err = s.Plugins.SetPluginsEnabled(ctx, instance, names, a.ID == health.ActionEnablePlugin)
	case health.ActionRemovePluginRule:
		if s.Plugins == nil {
			return ActionResult{}, fail(CodeActionInvalid, nil, "action", actionID)
		}
		err = s.Plugins.RemovePluginRule(ctx, instance, plugin.RuleID(target()))
	case ActionDeploy:
		var op operation.ID
		op, err = s.Deploy.Deploy(ctx, instance)
		res.Operations = append(res.Operations, op)
	case ActionReconcile:
		var op operation.ID
		op, err = s.Deploy.Reconcile(ctx, instance)
		res.Operations = append(res.Operations, op)
	case ActionRecheck:
		err = s.RunNow(ctx, instance)
	case ActionInstall:
		res.Operations, err = s.Library.InstallMods(ctx, instance, []mod.ID{mod.ID(target())})
	case ActionReinstall:
		res.Operations, err = s.Library.ReinstallMods(ctx, instance, []mod.ID{mod.ID(target())})
	case ActionAcceptStaging:
		err = s.Library.AcceptStaging(ctx, instance, mod.ID(target()))
	case ActionAckVersion:
		err = s.Games.AcknowledgeVersion(ctx, instance)
	case clearOverride:
		var p relpath.Path
		if p, err = relpath.Parse(a.Params["path"]); err == nil {
			err = s.Conflicts.ClearFileOverrides(ctx, instance, []game.Location{{Target: game.TargetID(a.Params["target"]), Path: p}})
		}
	default:
		return ActionResult{}, fail(CodeActionInvalid, nil, "action", actionID)
	}
	if err != nil {
		return ActionResult{}, err
	}
	s.watch.trigger()
	return res, nil
}

// clearOverride is application/conflicts.ActionClearOverride (kept as a
// literal to avoid importing the service for one name).
const clearOverride = "conflicts.clear_override"

// RunNow is "Verificar agora": the staging is verified file by file, the
// game folders get a light scan for external changes, and the checks run
// again (ui/telas/diagnostics.md §2).
func (s *Service) RunNow(ctx context.Context, instance game.InstanceID) error {
	checks, err := s.Library.CheckStaging(ctx, instance, true)
	if err != nil {
		return err
	}
	s.mu.Lock()
	for _, c := range checks {
		s.deep[c.Installation] = c
	}
	s.mu.Unlock()
	if err := s.Deploy.ScanOnFocus(ctx, instance); err != nil && !isBusy(err) {
		return err
	}
	_, err = s.Refresh(ctx, instance)
	return err
}

// VerifyStagingAll runs the deep staging check of every instance
// (library.verifyStagingOnStartup).
func (s *Service) VerifyStagingAll(ctx context.Context) error {
	list, err := s.Instances.List(ctx)
	if err != nil {
		return err
	}
	for _, inst := range list {
		checks, err := s.Library.CheckStaging(ctx, inst.ID, true)
		if err != nil {
			continue
		}
		s.mu.Lock()
		for _, c := range checks {
			s.deep[c.Installation] = c
		}
		s.mu.Unlock()
	}
	return nil
}

func isBusy(err error) bool {
	var coded interface{ Code() string }
	return errors.As(err, &coded) && coded.Code() == "instance_busy"
}

// Suppress hides a diagnostic by key ("Ignorar este") or every diagnostic
// of its code ("Não mostrar este tipo"). Blocking diagnostics cannot be
// hidden (core/10 §1.2).
func (s *Service) Suppress(ctx context.Context, instance game.InstanceID, key diagnostic.Key, wholeCode bool) error {
	d, err := s.find(ctx, instance, key)
	if err != nil {
		return err
	}
	if d.IsBlocking() {
		return fail(CodeNotSuppressible, nil, "code", string(d.Code))
	}
	k, c := d.Key, diagnostic.Code("")
	if wholeCode {
		k, c = "", d.Code
	}
	sup, err := diagnostic.NewSuppression(k, c, s.Clock.Now())
	if err != nil {
		return err
	}
	if err := s.Suppressions.Save(ctx, sup); err != nil {
		return err
	}
	s.signal(ctx, EventSuppressed, instance, map[string]string{"key": string(k), "code": string(c)})
	return nil
}

// Unsuppress shows again a suppressed key or code ("Reativar").
func (s *Service) Unsuppress(ctx context.Context, key diagnostic.Key, code diagnostic.Code) error {
	sup, err := diagnostic.NewSuppression(key, code, s.Clock.Now())
	if err != nil {
		return err
	}
	if err := s.Suppressions.Delete(ctx, sup); err != nil {
		return err
	}
	s.signal(ctx, EventUnsuppressed, "", map[string]string{"key": string(key), "code": string(code)})
	return nil
}

// Suppressions lists the hidden keys and codes (Settings › Interface shows
// the count; the Problems tab lists the hidden diagnostics).
func (s *Service) SuppressionList(ctx context.Context) ([]diagnostic.Suppression, error) {
	return s.Suppressions.List(ctx)
}

// ResetSuppressions shows every hidden diagnostic again ("Redefinir
// notificações suprimidas") and returns how many suppressions there were.
func (s *Service) ResetSuppressions(ctx context.Context) (int, error) {
	n, err := s.Suppressions.DeleteAll(ctx)
	if err != nil {
		return 0, err
	}
	s.signal(ctx, EventUnsuppressed, "", map[string]string{"count": fmt.Sprint(n)})
	return n, nil
}

// signal publishes a change of delivery state so the UI reads again. It is
// committed like any event (INV-OPS-01) but carries no domain state.
func (s *Service) signal(ctx context.Context, t event.Type, instance game.InstanceID, payload map[string]string) {
	if instance != "" {
		payload["instance"] = string(instance)
	}
	stored, err := s.UoW.Do(ctx, func(ctx context.Context, tx ports.Tx) error {
		tx.Emit(event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), Payload: payload})
		return nil
	})
	if err == nil {
		s.Publisher.Publish(stored...)
	}
}

// Commands lists every command action Execute runs; Places lists every
// navigation target the UI must know (INV-OPS-06: an action that neither
// runs nor opens anything does not lead to a resolution).
func Commands() []string {
	return []string{
		health.ActionEnableMod, health.ActionDisableMod, health.ActionRemoveRule, health.ActionDisableRule,
		ActionDeploy, ActionReconcile, ActionRecheck, ActionInstall, ActionReinstall, ActionAcceptStaging,
		ActionAckVersion, clearOverride, health.ActionEnablePlugin, health.ActionDisablePlugin, health.ActionRemovePluginRule,
	}
}

// Places lists the navigation targets of the actions.
func Places() []string {
	return []string{
		health.NavigateImport, health.NavigateRules, NavigateDeployPlan, NavigateDeployChanges, NavigateDeployResult,
		NavigateSettingsMods, NavigateGame, NavigateStaging, NavigateGameFolder, "conflicts", "conflicts.mod",
		health.NavigatePlugins, health.NavigatePluginRules, health.NavigateLoadOrder, health.NavigateLoadOrderCheck,
	}
}
