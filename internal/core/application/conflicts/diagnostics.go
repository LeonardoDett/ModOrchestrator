package conflicts

import (
	"context"
	"strconv"

	"modorchestrator/internal/core/domain/conflict"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
)

// Action ids of the conflict diagnostics (core/10 §1.1). The UI maps each
// to the place where the problem is solved (INV-OPS-06).
const (
	ActionClearOverride = "conflicts.clear_override"
	ActionShowFile      = "conflicts.show_file"
	ActionChooseWinner  = "conflicts.choose_winner"
	ActionOpenConflicts = "conflicts.open"
	ActionModConflicts  = "conflicts.open_mod"

	// Places the navigation actions open (diagnostic.Action.NavigateTo):
	// the Conflicts screen, and the conflict files of a mod.
	NavigateConflicts = "conflicts"
	NavigateModFiles  = "conflicts.mod"
)

const settingUnreviewed = "diagnostics.showUnreviewedConflicts"

// Diagnostics derives the conflict health checks of the active profile:
// override_stale (warning, one per ignored override or exclusion,
// INV-CON-03), conflicts_unreviewed (info, unless disabled by setting) and
// mod_fully_overwritten (info). They are calculated, never stored; the
// diagnostics service gathers them with the other checks (F9).
func (s *Service) Diagnostics(ctx context.Context, instance game.InstanceID) ([]diagnostic.Diagnostic, error) {
	showUnreviewed := true
	if v, err := s.Settings.InstanceValue(ctx, string(instance), settingUnreviewed); err == nil {
		showUnreviewed, _ = strconv.ParseBool(v.Value)
	}
	st, err := s.load(ctx, instance, false)
	if err != nil {
		return nil, err
	}
	var out []diagnostic.Diagnostic
	add := func(spec diagnostic.Spec) error {
		d, err := diagnostic.New(spec)
		if err != nil {
			return err
		}
		out = append(out, d)
		return nil
	}
	for _, v := range st.staleViews() {
		modRef := event.EntityRef{Kind: "mod", ID: string(v.Mod.ID)}
		locRef := event.EntityRef{Kind: "location", ID: v.Kind + ":" + v.Location.Key()}
		params := diagnostic.Params{"kind": v.Kind, "reason": string(v.Reason), "mod": v.Mod.Name, "target": string(v.Location.Target), "path": v.Location.Path.String()}
		remove := diagnostic.Action{ID: ActionClearOverride, Params: params, Target: &modRef}
		if v.Kind == "exclusion" {
			remove = diagnostic.Action{ID: ActionShowFile, Params: params, Target: &modRef, NavigateTo: NavigateModFiles}
		}
		actions := []diagnostic.Action{remove}
		if v.Kind == "override" {
			actions = append(actions, diagnostic.Action{ID: ActionChooseWinner, Params: params, Target: &modRef, NavigateTo: NavigateModFiles})
		}
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodeOverrideStale, Severity: diagnostic.SeverityWarning, Params: params,
			Evidence: []diagnostic.Evidence{{Kind: "location", Ref: &modRef, Params: params}},
			Actions:  actions, Related: []event.EntityRef{modRef, locRef},
		}); err != nil {
			return nil, err
		}
	}
	unreviewed := 0
	for _, ps := range conflict.Pairs(st.eval.Conflicts) {
		if st.pairView(ps).NeedsReview {
			unreviewed++
		}
	}
	instRef := event.EntityRef{Kind: subjectInstance, ID: string(instance)}
	if showUnreviewed && unreviewed > 0 {
		params := diagnostic.Params{"count": strconv.Itoa(unreviewed)}
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodeConflictsUnreviewed, Severity: diagnostic.SeverityInfo, Params: params,
			Evidence: []diagnostic.Evidence{{Kind: "conflict_pairs", Ref: &instRef, Params: params}},
			Actions:  []diagnostic.Action{{ID: ActionOpenConflicts, Target: &instRef, NavigateTo: NavigateConflicts}}, Related: []event.EntityRef{instRef},
		}); err != nil {
			return nil, err
		}
	}
	for _, sl := range st.order {
		if !sl.Enabled || conflict.ModIndicator(sl.Mod, st.eval.Provided[sl.Mod], st.eval.Conflicts) != conflict.IndicatorFullyOverwritten {
			continue
		}
		ref := event.EntityRef{Kind: "mod", ID: string(sl.Mod)}
		params := diagnostic.Params{"mod": st.ref(sl.Mod).Name}
		if err := add(diagnostic.Spec{
			Code: diagnostic.CodeModFullyOverwritten, Severity: diagnostic.SeverityInfo, Params: params,
			Evidence: []diagnostic.Evidence{{Kind: "mod_conflicts", Ref: &ref, Params: params}},
			Actions:  []diagnostic.Action{{ID: ActionModConflicts, Target: &ref, NavigateTo: NavigateModFiles}}, Related: []event.EntityRef{ref},
		}); err != nil {
			return nil, err
		}
	}
	return out, nil
}
