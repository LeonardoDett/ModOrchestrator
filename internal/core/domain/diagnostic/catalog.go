package diagnostic

import (
	"cmp"
	"fmt"
	"maps"
	"regexp"
	"slices"
)

// Catalog of health check codes (core/10 §1.1). A new check of the core
// needs a line in the spec catalog and here; a check of one game is declared
// by its adapter (D131). Codes never change once released.
const (
	CodeStagingMissing          Code = "staging_missing"
	CodeStagingForeign          Code = "staging_foreign"
	CodeForeignDeployment       Code = "foreign_deployment"
	CodeDeployInterrupted       Code = "deploy_interrupted"
	CodeDeployPending           Code = "deploy_pending"
	CodeDeployNeedsDecision     Code = "deploy_needs_decision"
	CodeDeployFailed            Code = "deploy_failed"
	CodeMethodUnavailable       Code = "method_unavailable"
	CodeExternalChangesPending  Code = "external_changes_pending"
	CodeLoadOrderExternalChange Code = "load_order_external_change"
	// CodeSavePathExternal: the key that points the game at the save folder
	// of the profile changed outside the app (D142).
	CodeSavePathExternal       Code = "save_path_external"
	CodeRuleCycle              Code = "rule_cycle"
	CodeModsIncompatible       Code = "mods_incompatible"
	CodeModRequirementMissing  Code = "mod_requirement_missing"
	CodeModRecommendation      Code = "mod_recommendation_missing"
	CodeRuleOrphan             Code = "rule_orphan"
	CodeOverrideStale          Code = "override_stale"
	CodeConflictsUnreviewed    Code = "conflicts_unreviewed"
	CodeModFullyOverwritten    Code = "mod_fully_overwritten"
	CodeStagingFileMissing     Code = "staging_file_missing"
	CodeStagingFileModified    Code = "staging_file_modified"
	CodeModArchiveMissing      Code = "mod_archive_missing"
	CodeInstallerRequired      Code = "installer_required"
	CodePluginMissingMaster    Code = "plugin_missing_master"
	CodePluginLimitExceeded    Code = "plugin_limit_exceeded"
	CodePluginDisabledMaster   Code = "plugin_disabled_master"
	CodePluginHeaderUnreadable Code = "plugin_header_unreadable"
	CodePluginMasterOrder      Code = "plugin_master_order"
	CodePluginRuleOrphan       Code = "plugin_rule_orphan"
	CodePluginRuleCycle        Code = "plugin_rule_cycle"
	CodePluginLockConflict     Code = "plugin_lock_conflict"
	CodePluginFromLosingFile   Code = "plugin_from_losing_file"
	CodeBSAWithoutPlugin       Code = "bsa_without_plugin"
	// Codes of the providers of plugin data (D143).
	CodePluginProviderMessage    Code = "plugin_provider_message"
	CodePluginDirty              Code = "plugin_dirty"
	CodePluginRequirementMissing Code = "plugin_requirement_missing"
	CodePluginIncompatible       Code = "plugin_incompatible"
	CodePluginProviderSkipped    Code = "plugin_provider_skipped"
	CodeGameNotFound             Code = "game_not_found"
	CodeGameVersionChanged       Code = "game_version_changed"
	CodeGameRunning              Code = "game_running"
	CodeFrameworkMissing         Code = "framework_missing"
	CodeDiskSpaceLow             Code = "disk_space_low"
	CodeBackupFailed             Code = "backup_failed"
)

// Module groups codes for the filters of the Diagnostics screen and the
// problem bands of each screen (ui/telas/diagnostics.md §2). The set is
// closed: modules are places of the app, and a code of an adapter joins one
// of them (D131).
type Module string

const (
	ModuleDeploy    Module = "deploy"
	ModuleConflicts Module = "conflicts"
	ModuleRules     Module = "rules"
	ModulePlugins   Module = "plugins"
	ModuleLibrary   Module = "library"
	ModuleGame      Module = "game"
	ModuleApp       Module = "app"
)

var moduleSet = []Module{ModuleDeploy, ModuleConflicts, ModuleRules, ModulePlugins, ModuleLibrary, ModuleGame, ModuleApp}

// CodeSpec describes a code of the catalog: the module it belongs to and
// whether the pre-launch check shows it. WarnsBeforeLaunch is the "launch
// (aviso)" of the "Bloqueia" column of core/10 §1.1: the code does not
// block, but the check shows it with "Jogar mesmo assim" (D045, DLG-26).
type CodeSpec struct {
	Code              Code
	Module            Module
	WarnsBeforeLaunch bool
}

var coreModules = map[Code]Module{
	CodeStagingMissing: ModuleDeploy, CodeStagingForeign: ModuleDeploy, CodeForeignDeployment: ModuleDeploy,
	CodeDeployInterrupted: ModuleDeploy, CodeDeployPending: ModuleDeploy, CodeDeployNeedsDecision: ModuleDeploy,
	CodeDeployFailed: ModuleDeploy, CodeMethodUnavailable: ModuleDeploy, CodeExternalChangesPending: ModuleDeploy,
	CodeLoadOrderExternalChange: ModulePlugins,
	CodeRuleCycle:               ModuleRules, CodeModsIncompatible: ModuleRules, CodeModRequirementMissing: ModuleRules,
	CodeModRecommendation: ModuleRules, CodeRuleOrphan: ModuleRules,
	CodeOverrideStale: ModuleConflicts, CodeConflictsUnreviewed: ModuleConflicts, CodeModFullyOverwritten: ModuleConflicts,
	CodeStagingFileMissing: ModuleLibrary, CodeStagingFileModified: ModuleLibrary, CodeModArchiveMissing: ModuleLibrary,
	CodeInstallerRequired:   ModuleLibrary,
	CodePluginMissingMaster: ModulePlugins, CodePluginLimitExceeded: ModulePlugins, CodePluginDisabledMaster: ModulePlugins,
	CodePluginHeaderUnreadable: ModulePlugins, CodePluginMasterOrder: ModulePlugins, CodePluginRuleOrphan: ModulePlugins,
	CodePluginRuleCycle: ModulePlugins, CodePluginLockConflict: ModulePlugins, CodePluginFromLosingFile: ModulePlugins,
	CodeBSAWithoutPlugin: ModulePlugins, CodePluginProviderMessage: ModulePlugins, CodePluginDirty: ModulePlugins,
	CodePluginRequirementMissing: ModulePlugins, CodePluginIncompatible: ModulePlugins, CodePluginProviderSkipped: ModulePlugins,
	CodeGameNotFound: ModuleGame, CodeGameVersionChanged: ModuleGame, CodeGameRunning: ModuleGame,
	CodeFrameworkMissing: ModuleGame, CodeSavePathExternal: ModuleGame,
	CodeDiskSpaceLow: ModuleApp, CodeBackupFailed: ModuleApp,
}

var coreLaunchWarnings = map[Code]bool{
	CodePluginMissingMaster: true, CodePluginLimitExceeded: true, CodeFrameworkMissing: true,
}

// CoreCodes lists the codes of the core (core/10 §1.1), sorted.
func CoreCodes() []CodeSpec {
	out := make([]CodeSpec, 0, len(coreModules))
	for c, m := range coreModules {
		out = append(out, CodeSpec{Code: c, Module: m, WarnsBeforeLaunch: coreLaunchWarnings[c]})
	}
	slices.SortFunc(out, func(a, b CodeSpec) int { return cmp.Compare(a.Code, b.Code) })
	return out
}

var codePattern = regexp.MustCompile(`^[a-z][a-z0-9]*(_[a-z0-9]+)*$`)

// Catalog is the set of codes in effect: the core's and the ones the
// adapters declare (D131). The zero value knows only the core codes.
type Catalog struct {
	specs map[Code]CodeSpec
}

// NewCatalog adds the declared codes to the core's. A code must be
// snake_case, belong to a known module and appear once: an adapter cannot
// redefine a code of the core or of another adapter.
func NewCatalog(declared ...CodeSpec) (Catalog, error) {
	specs := map[Code]CodeSpec{}
	for _, s := range CoreCodes() {
		specs[s.Code] = s
	}
	for _, s := range declared {
		if !codePattern.MatchString(string(s.Code)) {
			return Catalog{}, fmt.Errorf("%w: code %q is not snake_case", ErrInvalid, s.Code)
		}
		if !slices.Contains(moduleSet, s.Module) {
			return Catalog{}, fmt.Errorf("%w: code %s has unknown module %q", ErrInvalid, s.Code, s.Module)
		}
		if _, dup := specs[s.Code]; dup {
			return Catalog{}, fmt.Errorf("%w: code %s is declared twice", ErrInvalid, s.Code)
		}
		specs[s.Code] = s
	}
	return Catalog{specs: specs}, nil
}

func (c Catalog) spec(code Code) (CodeSpec, bool) {
	if c.specs == nil {
		m, ok := coreModules[code]
		return CodeSpec{Code: code, Module: m, WarnsBeforeLaunch: coreLaunchWarnings[code]}, ok
	}
	s, ok := c.specs[code]
	return s, ok
}

// Has reports whether the code is in the catalog.
func (c Catalog) Has(code Code) bool {
	_, ok := c.spec(code)
	return ok
}

// ModuleOf returns the module of a code ("" for unknown codes).
func (c Catalog) ModuleOf(code Code) Module {
	s, _ := c.spec(code)
	return s.Module
}

// WarnsBeforeLaunch reports whether the pre-launch check shows the code.
func (c Catalog) WarnsBeforeLaunch(code Code) bool {
	s, _ := c.spec(code)
	return s.WarnsBeforeLaunch
}

// Codes lists every code of the catalog, sorted.
func (c Catalog) Codes() []Code {
	if c.specs == nil {
		return slices.Sorted(maps.Keys(coreModules))
	}
	return slices.Sorted(maps.Keys(c.specs))
}
