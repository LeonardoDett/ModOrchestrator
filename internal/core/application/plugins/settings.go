package plugins

import (
	"modorchestrator/internal/core/application/games"
	domainsettings "modorchestrator/internal/core/domain/settings"
)

// SettingsTab is the Plugins tab of Settings, contributed by this module
// after Mods (Vortex order) and shown for the games that offer the
// settings.plugins section (D135).
const SettingsTab domainsettings.Tab = "plugins"

// SettingsContribution is what the module adds to the settings catalog
// (core/13): its tab and its instance settings. The texts stay in the app
// catalog because the module is the app's own.
func SettingsContribution() domainsettings.Contribution {
	return domainsettings.Contribution{
		Tabs: []domainsettings.TabDef{{ID: SettingsTab, After: domainsettings.TabMods, Section: games.SectionSettingsPlugins}},
		Defs: []domainsettings.Def{
			{Key: "plugins.autoSort", Scope: domainsettings.ScopeInstance, Type: domainsettings.TypeBool, Tab: SettingsTab, Release: domainsettings.V1, Default: "true"},
			{Key: "plugins.enableOnModEnable", Scope: domainsettings.ScopeInstance, Type: domainsettings.TypeBool, Tab: SettingsTab, Release: domainsettings.V1, Default: "true"},
			{Key: "plugins.enableExternallyAdded", Scope: domainsettings.ScopeInstance, Type: domainsettings.TypeBool, Tab: SettingsTab, Release: domainsettings.V1, Default: "false"},
			{Key: "plugins.lootProvider", Scope: domainsettings.ScopeInstance, Type: domainsettings.TypeBool, Tab: SettingsTab, Release: domainsettings.V1x, Default: "false"},
		},
	}
}
