package diagnostics

import (
	"context"
	"errors"
	"strconv"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/deploystate"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/rules"
)

// Action ids executed by this service (commands) and the places the UI
// opens (navigations). The rule actions are in domain/health, the conflict
// ones in application/conflicts. Every blocking or error diagnostic has at
// least one of them (INV-OPS-06, tested by TestEveryErrorLeadsToResolution).
const (
	ActionDeploy          = "deploy.run"
	ActionReconcile       = "deploy.reconcile"
	ActionRecheck         = "diagnostics.recheck"
	ActionInstall         = "library.install"
	ActionReinstall       = "library.reinstall"
	ActionAcceptStaging   = "library.accept_staging"
	ActionAckVersion      = "games.ack_version"
	ActionReviewPlan      = "deploy.review_plan"
	ActionReviewChanges   = "deploy.review_changes"
	ActionShowFailures    = "deploy.show_failures"
	ActionDeploySettings  = "settings.mods"
	ActionGameDetails     = "games.details"
	ActionRelocateGame    = "games.relocate"
	ActionOpenFolder      = "folder.open"
	NavigateDeployPlan    = "deploy.plan"
	NavigateDeployChanges = "deploy.changes"
	NavigateDeployResult  = "deploy.result"
	NavigateSettingsMods  = "settings.mods"
	NavigateGame          = "games.instance"
	NavigateStaging       = "folder.staging"
	NavigateGameFolder    = "folder.game"

	// lowSpace is the free space under which disk_space_low warns.
	lowSpace = 2 << 30
)

// Operations blocked by the game and deploy checks (core/10 §1.1).
var (
	opDeploy  = health.OperationDeploy
	opPurge   = health.OperationPurge
	opLaunch  = health.OperationLaunch
	opImport  = health.OperationImport
	opInstall = operation.Kind("install")
)

func instanceRef(inst game.Instance) event.EntityRef {
	return event.EntityRef{Kind: "instance", ID: string(inst.ID)}
}

func build(specs ...diagnostic.Spec) ([]diagnostic.Diagnostic, error) {
	out := make([]diagnostic.Diagnostic, 0, len(specs))
	for _, s := range specs {
		d, err := diagnostic.New(s)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}

// gameChecks: game_not_found, game_running and game_version_changed.
func (s *Service) gameChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	ref := instanceRef(inst)
	params := diagnostic.Params{"game": inst.DisplayName, "path": inst.Root}
	m, err := s.Games.Details(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	if m.RootMissing {
		return build(diagnostic.Spec{
			Code: diagnostic.CodeGameNotFound, Severity: diagnostic.SeverityError, Params: params,
			Evidence: []diagnostic.Evidence{{Kind: "folder_absent", Ref: &ref, Params: params}},
			Actions:  []diagnostic.Action{{ID: ActionRelocateGame, Target: &ref, NavigateTo: NavigateGame}},
			Blocks:   []operation.Kind{opDeploy, opPurge, opImport, opInstall, opLaunch},
			Related:  []event.EntityRef{ref},
		})
	}
	var specs []diagnostic.Spec
	running, err := s.Games.RunningProcesses(ctx, inst)
	if err != nil {
		return nil, err
	}
	if len(running) > 0 {
		p := diagnostic.Params{"game": inst.DisplayName, "process": running[0]}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeGameRunning, Severity: diagnostic.SeverityError, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "process", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionRecheck, Target: &ref}},
			Blocks:   []operation.Kind{opDeploy, opPurge},
			Related:  []event.EntityRef{ref},
		})
	}
	current, seen, err := s.Games.VersionCheck(ctx, inst)
	if err != nil {
		return nil, err
	}
	if current != "" && seen != "" && current != seen {
		p := diagnostic.Params{"game": inst.DisplayName, "version": current, "previous": seen}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeGameVersionChanged, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "game_version", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionAckVersion, Target: &ref}},
			// The version is part of the key: a later change is a new problem.
			Related: []event.EntityRef{ref, {Kind: "version", ID: current}},
		})
	}
	return build(specs...)
}

// deployChecks derives the deployment checks from the deployment status
// (core/04 §7): the status is the single derivation of these facts.
func (s *Service) deployChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	st, err := s.Deploy.Status(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	ref := instanceRef(inst)
	base := diagnostic.Params{"game": inst.DisplayName}
	with := func(kv ...string) diagnostic.Params {
		p := diagnostic.Params{}
		for k, v := range base {
			p[k] = v
		}
		for i := 0; i+1 < len(kv); i += 2 {
			p[kv[i]] = kv[i+1]
		}
		return p
	}
	var specs []diagnostic.Spec
	for _, f := range st.Foreign {
		p := with("kind", string(f.Kind), "target", string(f.Target), "name", f.Name)
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeForeignDeployment, Severity: diagnostic.SeverityError, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "foreign_marker", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionGameDetails, Target: &ref, NavigateTo: NavigateGame}, {ID: ActionRecheck, Target: &ref}},
			Blocks:   []operation.Kind{opDeploy, opLaunch},
			Related:  []event.EntityRef{ref, {Kind: "foreign", ID: string(f.Kind) + ":" + string(f.Target)}},
		})
	}
	if st.StagingProblem != "" {
		p := with("folder", inst.Staging)
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.Code(st.StagingProblem), Severity: diagnostic.SeverityError, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "staging", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionDeploySettings, Target: &ref, NavigateTo: NavigateSettingsMods}},
			Blocks:   []operation.Kind{opDeploy},
			Related:  []event.EntityRef{ref},
		})
	}
	if st.JournalPending {
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeDeployInterrupted, Severity: diagnostic.SeverityError, Params: base,
			Evidence: []diagnostic.Evidence{{Kind: "journal", Ref: &ref, Params: base}},
			Actions:  []diagnostic.Action{{ID: ActionReconcile, Target: &ref}},
			Blocks:   []operation.Kind{opDeploy},
			Related:  []event.EntityRef{ref},
		})
	}
	switch {
	case st.Status.Kind == deploystate.Blocked && st.Status.Reason == deploystate.ReasonNeedsDecision:
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeDeployNeedsDecision, Severity: diagnostic.SeverityWarning, Params: base,
			Evidence: []diagnostic.Evidence{{Kind: "deploy_status", Ref: &ref, Params: with("reason", string(st.Status.Reason))}},
			Actions:  []diagnostic.Action{{ID: ActionReviewPlan, Target: &ref, NavigateTo: NavigateDeployPlan}},
			Related:  []event.EntityRef{ref},
		})
	case st.Status.Kind == deploystate.Failed:
		p := with("count", strconv.Itoa(len(st.Failures)))
		if len(st.Failures) > 0 {
			p["first"] = st.Failures[0].Location.String()
			p["reason"] = st.Failures[0].Code
		}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeDeployFailed, Severity: diagnostic.SeverityError, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "deploy_failures", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionShowFailures, Target: &ref, NavigateTo: NavigateDeployResult}, {ID: ActionDeploy, Target: &ref}},
			Related:  []event.EntityRef{ref},
		})
	case st.Status.Kind == deploystate.Pending:
		p := with("reason", string(st.Status.Reason))
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeDeployPending, Severity: diagnostic.SeverityInfo, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "deploy_status", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionDeploy, Target: &ref}},
			Related:  []event.EntityRef{ref},
		})
	}
	if st.ExternalChanges > 0 {
		p := with("count", strconv.Itoa(st.ExternalChanges))
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeExternalChangesPending, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "external_changes", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionReviewChanges, Target: &ref, NavigateTo: NavigateDeployChanges}},
			Related:  []event.EntityRef{ref},
		})
	}
	methods, err := s.Deploy.Methods(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	for _, m := range methods {
		if m.Preferred && !m.Available {
			p := with("method", string(m.Method), "reason", m.Reason)
			specs = append(specs, diagnostic.Spec{
				Code: diagnostic.CodeMethodUnavailable, Severity: diagnostic.SeverityError, Params: p,
				Evidence: []diagnostic.Evidence{{Kind: "deploy_method", Ref: &ref, Params: p}},
				Actions:  []diagnostic.Action{{ID: ActionDeploySettings, Target: &ref, NavigateTo: NavigateSettingsMods}},
				Related:  []event.EntityRef{ref, {Kind: "method", ID: string(m.Method)}},
			})
		}
	}
	return build(specs...)
}

// ruleChecks runs the pure rule checks over the active profile.
func (s *Service) ruleChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	facts, err := s.modFacts(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	set, err := s.Rules.Get(ctx, inst.ID)
	if errors.Is(err, ports.ErrNotFound) {
		set, err = rules.New(inst.ID)
	}
	if err != nil {
		return nil, err
	}
	return health.RuleChecks(set, facts)
}

func (s *Service) modFacts(ctx context.Context, instance game.InstanceID) (health.Mods, error) {
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, pid)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	facts := health.Mods{}
	for _, m := range list {
		facts[m.ID] = health.ModFact{ID: m.ID, Name: m.DisplayName(), State: m.State, Enabled: p.IsEnabled(m.ID)}
	}
	return facts, nil
}

// libraryChecks: installer_required, mod_archive_missing and the staging
// checks (folder always, file by file after "Verificar agora").
func (s *Service) libraryChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	list, err := s.Mods.ListByInstance(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	var specs []diagnostic.Spec
	for _, m := range list {
		if m.State != mod.StateImported {
			continue
		}
		ref := event.EntityRef{Kind: "mod", ID: string(m.ID)}
		p := diagnostic.Params{"mod": m.DisplayName()}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeInstallerRequired, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "mod_state", Ref: &ref, Params: diagnostic.Params{"state": string(m.State)}}},
			Actions:  []diagnostic.Action{{ID: ActionInstall, Target: &ref, Params: p}},
			Related:  []event.EntityRef{ref},
		})
	}
	missing, err := s.Library.ArchiveMissing(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	for _, m := range missing {
		ref := event.EntityRef{Kind: "mod", ID: string(m.ID)}
		p := diagnostic.Params{"mod": m.DisplayName()}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeModArchiveMissing, Severity: diagnostic.SeverityInfo, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "archive_absent", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: health.ActionImport, NavigateTo: health.NavigateImport, Params: p}},
			Related:  []event.EntityRef{ref},
		})
	}
	checks, err := s.Library.CheckStaging(ctx, inst.ID, false)
	if err != nil {
		return nil, err
	}
	retained := map[mod.ID]bool{}
	for _, m := range list {
		retained[m.ID] = m.Archive != ""
	}
	for _, m := range missing {
		retained[m.ID] = false
	}
	for _, c := range checks {
		if !c.FolderMissing {
			s.mu.Lock()
			deep, ok := s.deep[c.Installation]
			s.mu.Unlock()
			if !ok {
				continue
			}
			c = deep
		}
		specs = append(specs, stagingSpecs(c, retained[c.Mod])...)
	}
	return build(specs...)
}

func stagingSpecs(c library.StagingCheck, reinstall bool) []diagnostic.Spec {
	ref := event.EntityRef{Kind: "mod", ID: string(c.Mod)}
	actions := func(p diagnostic.Params) []diagnostic.Action {
		var out []diagnostic.Action
		if reinstall {
			out = append(out, diagnostic.Action{ID: ActionReinstall, Target: &ref, Params: p})
		}
		return append(out, diagnostic.Action{ID: ActionAcceptStaging, Target: &ref, Params: p})
	}
	var out []diagnostic.Spec
	if c.FolderMissing || len(c.Missing) > 0 {
		p := diagnostic.Params{"mod": c.Name, "count": strconv.Itoa(len(c.Missing)), "folder": strconv.FormatBool(c.FolderMissing)}
		ev := []diagnostic.Evidence{{Kind: "staging_folder", Ref: &ref, Params: p}}
		for i, l := range c.Missing {
			if i == 20 {
				break
			}
			ev = append(ev, diagnostic.Evidence{Kind: "location", Ref: &ref, Params: diagnostic.Params{"target": string(l.Target), "path": l.Path.String()}})
		}
		acts := actions(p)
		if c.FolderMissing {
			acts = acts[:len(acts)-1] // nothing left to accept
			if len(acts) == 0 {
				acts = []diagnostic.Action{{ID: health.ActionImport, NavigateTo: health.NavigateImport, Params: p}}
			}
		}
		out = append(out, diagnostic.Spec{
			Code: diagnostic.CodeStagingFileMissing, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: ev, Actions: acts, Related: []event.EntityRef{ref},
		})
	}
	if len(c.Modified) > 0 {
		p := diagnostic.Params{"mod": c.Name, "count": strconv.Itoa(len(c.Modified))}
		ev := []diagnostic.Evidence{{Kind: "staging_folder", Ref: &ref, Params: p}}
		for i, l := range c.Modified {
			if i == 20 {
				break
			}
			ev = append(ev, diagnostic.Evidence{Kind: "location", Ref: &ref, Params: diagnostic.Params{"target": string(l.Target), "path": l.Path.String()}})
		}
		out = append(out, diagnostic.Spec{
			Code: diagnostic.CodeStagingFileModified, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: ev, Actions: actions(p), Related: []event.EntityRef{ref},
		})
	}
	return out
}

// appChecks: disk_space_low on the volumes the manager writes to (the
// staging and the game folder).
func (s *Service) appChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	var specs []diagnostic.Spec
	for _, f := range []struct{ which, path, nav string }{
		{"staging", inst.Staging, NavigateStaging},
		{"game", inst.Root, NavigateGameFolder},
	} {
		free, err := s.FS.FreeSpace(ctx, f.path)
		if err != nil || free >= lowSpace {
			continue
		}
		ref := instanceRef(inst)
		p := diagnostic.Params{"folder": f.which, "path": f.path, "free": strconv.FormatInt(free, 10)}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeDiskSpaceLow, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "free_space", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: ActionOpenFolder, Target: &ref, NavigateTo: f.nav}},
			Related:  []event.EntityRef{ref, {Kind: "volume", ID: f.which}},
		})
	}
	return build(specs...)
}

// adapterChecks runs the checks the adapter declares (framework_missing...).
func (s *Service) adapterChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	a, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil, nil
	}
	hc, ok := a.(ports.HealthCheckProvider)
	if !ok {
		return nil, nil
	}
	pid, err := s.Profiles.Active(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	p, err := s.Profiles.Get(ctx, pid)
	if err != nil {
		return nil, err
	}
	list, err := s.Mods.ListByInstance(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	var mods []ports.ModContent
	for _, m := range list {
		if m.State != mod.StateInstalled {
			continue
		}
		mods = append(mods, ports.ModContent{ID: m.ID, Name: m.DisplayName(), Type: m.Type, Content: m.Content, Enabled: p.IsEnabled(m.ID)})
	}
	specs, err := hc.HealthChecks(ctx, s.FS, inst, mods)
	if err != nil {
		return nil, err
	}
	return build(specs...)
}
