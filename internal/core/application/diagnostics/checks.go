package diagnostics

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"modorchestrator/internal/core/application/library"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/dependency"
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
	// ActionRecoverOrphans and ActionRewriteMetadata act on the metadata
	// kept next to each mod in the staging (D145).
	ActionRecoverOrphans  = "library.recover_orphans"
	ActionRewriteMetadata = "library.rewrite_metadata"
	ActionAckVersion      = "games.ack_version"
	ActionReviewPlan      = "deploy.review_plan"
	ActionReviewChanges   = "deploy.review_changes"
	ActionShowFailures    = "deploy.show_failures"
	ActionDeploySettings  = "settings.mods"
	ActionGameDetails     = "games.details"
	ActionRelocateGame    = "games.relocate"
	ActionOpenFolder      = "folder.open"
	// ActionBackupDetails opens Settings › Workarounds (backup_failed).
	ActionBackupDetails = "backups.details"
	NavigateDeployPlan    = "deploy.plan"
	NavigateDeployChanges = "deploy.changes"
	NavigateDeployResult  = "deploy.result"
	NavigateSettingsMods  = "settings.mods"
	NavigateGame          = "games.instance"
	NavigateStaging       = "folder.staging"
	NavigateGameFolder    = "folder.game"
	// NavigateWorkarounds opens Settings › Workarounds (database backups).
	NavigateWorkarounds = "settings.workarounds"

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
		facts[m.ID] = health.ModFact{ID: m.ID, Name: m.DisplayName(), State: m.State, Enabled: p.IsEnabled(m.ID), Package: m.Package}
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
	orphans, err := s.metadataSpecs(ctx, inst)
	if err != nil {
		return nil, err
	}
	specs = append(specs, orphans...)
	unknown, err := s.Library.UnrecognizedContent(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	specs = append(specs, contentSpecs(unknown)...)
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

// contentSpecs: mod_content_unrecognized (D151). The key names the mod, so
// "Ignorar este" ignores the check for that mod only.
func contentSpecs(list []library.UnrecognizedMod) []diagnostic.Spec {
	specs := make([]diagnostic.Spec, 0, len(list))
	for _, u := range list {
		ref := event.EntityRef{Kind: "mod", ID: string(u.Mod)}
		p := diagnostic.Params{"mod": u.Name, "top": strings.Join(u.Top, ", ")}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeModContentUnrecognized, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "mod_content", Ref: &ref, Params: p}},
			Actions: []diagnostic.Action{
				{ID: health.ActionOpenModFolder, Target: &ref, NavigateTo: health.NavigateModFolder},
				{ID: ActionReinstall, Target: &ref, Params: diagnostic.Params{"mod": u.Name}},
			},
			Related: []event.EntityRef{ref},
		})
	}
	return specs
}

// metadataSpecs: staging_orphan_folders (folders of the staging that are no
// mod of the library) and mod_metadata_stale (D145).
func (s *Service) metadataSpecs(ctx context.Context, inst game.Instance) ([]diagnostic.Spec, error) {
	var specs []diagnostic.Spec
	ref := instanceRef(inst)
	orphans, err := s.Library.OrphanFolders(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	if len(orphans) > 0 {
		withMeta := 0
		ev := make([]diagnostic.Evidence, 0, min(len(orphans), 20))
		for i, o := range orphans {
			if o.Metadata {
				withMeta++
			}
			if i < 20 {
				ev = append(ev, diagnostic.Evidence{Kind: "orphan_folder", Ref: &ref,
					Params: diagnostic.Params{"folder": o.Name, "metadata": strconv.FormatBool(o.Metadata)}})
			}
		}
		p := diagnostic.Params{"count": strconv.Itoa(len(orphans)), "metadata": strconv.Itoa(withMeta)}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeStagingOrphanFolders, Severity: diagnostic.SeverityWarning, Params: p,
			Evidence: ev,
			Actions: []diagnostic.Action{
				{ID: ActionRecoverOrphans, Target: &ref, Params: p},
				{ID: ActionOpenFolder, Target: &ref, NavigateTo: NavigateStaging},
			},
			Related: []event.EntityRef{ref},
		})
	}
	stale, err := s.Library.MetadataStale(ctx, inst.ID)
	if err != nil {
		return nil, err
	}
	if len(stale) > 0 {
		p := diagnostic.Params{"count": strconv.Itoa(len(stale))}
		ev := make([]diagnostic.Evidence, 0, min(len(stale), 20))
		for i, id := range stale {
			if i == 20 {
				break
			}
			name := string(id)
			if m, err := s.Mods.Get(ctx, id); err == nil {
				name = m.DisplayName()
			}
			mref := event.EntityRef{Kind: "mod", ID: string(id)}
			ev = append(ev, diagnostic.Evidence{Kind: "mod_metadata", Ref: &mref, Params: diagnostic.Params{"mod": name}})
		}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeModMetadataStale, Severity: diagnostic.SeverityInfo, Params: p,
			Evidence: ev,
			Actions:  []diagnostic.Action{{ID: ActionRewriteMetadata, Target: &ref, Params: p}},
			Related:  []event.EntityRef{ref},
		})
	}
	return specs, nil
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
	specs = append(specs, s.folderSpecs(inst)...)
	// backup_failed is an app fact shown in every game (diagnostics are
	// evaluated per instance); its key is the same everywhere.
	if s.Backups != nil {
		if f := s.Backups.LastFailure(ctx); f != nil {
			ref := event.EntityRef{Kind: "app", ID: "database"}
			p := diagnostic.Params{"kind": string(f.Kind), "at": f.At.Format(time.RFC3339), "reason": f.Reason}
			specs = append(specs, diagnostic.Spec{
				Code: diagnostic.CodeBackupFailed, Severity: diagnostic.SeverityWarning, Params: p,
				Evidence: []diagnostic.Evidence{{Kind: "backup", Ref: &ref, Params: p}},
				Actions:  []diagnostic.Action{{ID: ActionBackupDetails, NavigateTo: NavigateWorkarounds}},
				Related:  []event.EntityRef{ref},
			})
		}
	}
	return build(specs...)
}

// folderSpecs: folder_location_risky for the game folder, the staging and
// the archives (D151). It applies to every game: the places are folders of
// the user, not of a game. A game folder in Program Files is only informed:
// Steam installs there by default and opens its library to the user.
func (s *Service) folderSpecs(inst game.Instance) []diagnostic.Spec {
	places := ports.RiskyPlaces(s.Folders)
	ref := instanceRef(inst)
	var specs []diagnostic.Spec
	for _, f := range []struct{ which, path, action, nav string }{
		{"game", inst.Root, ActionRelocateGame, NavigateGame},
		{"staging", inst.Staging, ActionDeploySettings, NavigateSettingsMods},
		{"archives", inst.ArchiveStore, ActionDeploySettings, NavigateSettingsMods},
	} {
		kind, ok := game.PlaceOf(f.path, places)
		if !ok {
			continue
		}
		severity := diagnostic.SeverityWarning
		if f.which == "game" && kind == game.PlaceProgramFiles {
			severity = diagnostic.SeverityInfo
		}
		p := diagnostic.Params{"folder": f.which, "kind": string(kind), "path": f.path}
		specs = append(specs, diagnostic.Spec{
			Code: diagnostic.CodeFolderLocationRisky, Severity: severity, Params: p,
			Evidence: []diagnostic.Evidence{{Kind: "folder_place", Ref: &ref, Params: p}},
			Actions:  []diagnostic.Action{{ID: f.action, Target: &ref, NavigateTo: f.nav}},
			Related:  []event.EntityRef{ref, {Kind: "folder", ID: f.which}},
		})
	}
	return specs
}

// adapterChecks runs the checks the adapter declares (framework_missing...)
// and the checks of its run log (D151).
func (s *Service) adapterChecks(ctx context.Context, inst game.Instance) ([]diagnostic.Diagnostic, error) {
	a, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil, nil
	}
	out, err := s.healthChecks(ctx, inst, a)
	if err != nil {
		return nil, err
	}
	logged, err := s.runLogChecks(ctx, inst, a)
	if err != nil {
		return nil, err
	}
	return append(out, logged...), nil
}

// maxRunLog bounds what is read of a run log; a script extender log is a
// few kilobytes.
const maxRunLog = 4 << 20

// runLogChecks reads the run log the adapter names and lets it decide
// (D151). Only with the health_checks capability; a log that does not
// exist or cannot be read gives no check (the game never ran with it).
func (s *Service) runLogChecks(ctx context.Context, inst game.Instance, a ports.GameAdapter) ([]diagnostic.Diagnostic, error) {
	rc, ok := a.(ports.RunLogChecker)
	if !ok || s.Folders == nil {
		return nil, nil
	}
	def, err := ports.InstanceDefinition(a, inst)
	if err != nil || !def.Capabilities.Has(game.CapHealthChecks) {
		return nil, nil
	}
	where, ok := rc.RunLogFile(inst)
	if !ok {
		return nil, nil
	}
	base, err := s.Folders.Folder(where.Folder)
	if err != nil {
		return nil, nil
	}
	path := game.JoinPath(base, where.Path)
	info, err := s.FS.Stat(ctx, path)
	if err != nil || !info.Exists || info.IsDir {
		return nil, nil
	}
	r, err := s.FS.Open(ctx, path)
	if err != nil {
		return nil, nil
	}
	content, err := io.ReadAll(io.LimitReader(r, maxRunLog))
	r.Close()
	if err != nil {
		return nil, nil
	}
	specs, err := rc.RunLogChecks(ctx, s.FS, inst, ports.RunLog{Content: content, ModTime: info.ModTime}, owners{s, inst.ID})
	if err != nil {
		return nil, err
	}
	return s.declared(inst, specs)
}

// owners answers ports.FileOwners for one instance.
type owners struct {
	s        *Service
	instance game.InstanceID
}

func (o owners) Owner(ctx context.Context, loc game.Location) (ports.TargetFile, bool, error) {
	p, ok, err := o.s.Conflicts.Owner(ctx, o.instance, loc)
	if err != nil || !ok {
		return ports.TargetFile{}, false, err
	}
	return ports.TargetFile{Name: loc.Path.String(), Mod: p.Mod, ModName: p.Name, Source: p.Source}, true, nil
}

// declared builds the diagnostics of adapter specs; a code outside the
// catalog would have no module and no text (D131).
func (s *Service) declared(inst game.Instance, specs []diagnostic.Spec) ([]diagnostic.Diagnostic, error) {
	for _, sp := range specs {
		if !s.Registry.Diagnostics().Has(sp.Code) {
			return nil, fmt.Errorf("diagnostics: adapter %s emitted undeclared code %q", inst.Adapter, sp.Code)
		}
	}
	return build(specs...)
}

// healthChecks runs the HealthCheckProvider of the adapter.
func (s *Service) healthChecks(ctx context.Context, inst game.Instance, a ports.GameAdapter) ([]diagnostic.Diagnostic, error) {
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
	return s.declared(inst, specs)
}

// Requirements counts the requirements of a mod (DependencyRule "requires")
// and the packages it requires that no mod declares (D125), and how many are
// satisfied now, for the summary of the mod (B13). Optional recommendations
// are not counted.
type Requirements struct {
	Total, Present int
}

// ModRequirements evaluates the requirements of m with the same rule as
// the dependency checks (core/06 §2).
func (s *Service) ModRequirements(ctx context.Context, instance game.InstanceID, m mod.ID) (Requirements, error) {
	facts, err := s.modFacts(ctx, instance)
	if err != nil {
		return Requirements{}, err
	}
	set, err := s.Rules.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		set, err = rules.New(instance)
	}
	if err != nil {
		return Requirements{}, err
	}
	out := Requirements{Total: len(health.MissingPackages(set, facts, m))}
	for _, r := range set.DependencyRules() {
		if r.Mod != m || r.Kind != rules.Requires {
			continue
		}
		out.Total++
		if res, err := health.Evaluate(r, facts); err == nil && res.Status == dependency.StatusSatisfied {
			out.Present++
		}
	}
	return out, nil
}
