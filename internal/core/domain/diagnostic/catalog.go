package diagnostic

import "slices"

// Catalog of health check codes (core/10 §1.1). A new check needs a line in
// the spec catalog and here; codes never change once released.
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
	CodeRuleCycle               Code = "rule_cycle"
	CodeModsIncompatible        Code = "mods_incompatible"
	CodeModRequirementMissing   Code = "mod_requirement_missing"
	CodeModRecommendation       Code = "mod_recommendation_missing"
	CodeRuleOrphan              Code = "rule_orphan"
	CodeOverrideStale           Code = "override_stale"
	CodeConflictsUnreviewed     Code = "conflicts_unreviewed"
	CodeModFullyOverwritten     Code = "mod_fully_overwritten"
	CodeStagingFileMissing      Code = "staging_file_missing"
	CodeStagingFileModified     Code = "staging_file_modified"
	CodeModArchiveMissing       Code = "mod_archive_missing"
	CodeInstallerRequired       Code = "installer_required"
	CodePluginMissingMaster     Code = "plugin_missing_master"
	CodePluginLimitExceeded     Code = "plugin_limit_exceeded"
	CodePluginDisabledMaster    Code = "plugin_disabled_master"
	CodePluginHeaderUnreadable  Code = "plugin_header_unreadable"
	CodePluginMasterOrder       Code = "plugin_master_order"
	CodePluginRuleOrphan        Code = "plugin_rule_orphan"
	CodePluginRuleCycle         Code = "plugin_rule_cycle"
	CodePluginLockConflict      Code = "plugin_lock_conflict"
	CodePluginFromLosingFile    Code = "plugin_from_losing_file"
	CodeBSAWithoutPlugin        Code = "bsa_without_plugin"
	CodeGameNotFound            Code = "game_not_found"
	CodeGameVersionChanged      Code = "game_version_changed"
	CodeGameRunning             Code = "game_running"
	CodeFrameworkMissing        Code = "framework_missing"
	CodeDiskSpaceLow            Code = "disk_space_low"
	CodeBackupFailed            Code = "backup_failed"
)

// Module groups codes for the filters of the Diagnostics screen and the
// problem bands of each screen (ui/telas/diagnostics.md §2).
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

var modules = map[Code]Module{
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
	CodeBSAWithoutPlugin: ModulePlugins,
	CodeGameNotFound:     ModuleGame, CodeGameVersionChanged: ModuleGame, CodeGameRunning: ModuleGame,
	CodeFrameworkMissing: ModuleGame,
	CodeDiskSpaceLow:     ModuleApp, CodeBackupFailed: ModuleApp,
}

// launchWarnings are the codes of core/10 §1.1 whose "Bloqueia" column says
// "launch (aviso)": they do not block, but the pre-launch check shows them
// with "Jogar mesmo assim" (D045, DLG-26).
var launchWarnings = map[Code]bool{
	CodePluginMissingMaster: true, CodePluginLimitExceeded: true, CodeFrameworkMissing: true,
}

// WarnsBeforeLaunch reports whether the pre-launch check shows the code.
func WarnsBeforeLaunch(c Code) bool { return launchWarnings[c] }

// ModuleOf returns the module of a catalog code ("" for unknown codes).
func ModuleOf(c Code) Module { return modules[c] }

// Catalog lists every code of core/10 §1.1.
func Catalog() []Code {
	out := make([]Code, 0, len(modules))
	for c := range modules {
		out = append(out, c)
	}
	slices.Sort(out)
	return out
}
