// Package plugin is the plugin vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/plugin an adapter may use, as aliases.
package plugin

import (
	inner "modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/core/domain/pluginhealth"
)

type (
	Entry      = inner.Entry
	Flag       = inner.Flag
	Header     = inner.Header
	LimitUsage = inner.LimitUsage
	Name       = inner.Name
	Plugin     = inner.Plugin
)

const (
	RefAdapterPrefix = inner.RefAdapterPrefix
	// ActionDisable deactivates the plugin of its target ({Kind: "plugin",
	// ID: Name.Key()}) in the active profile.
	ActionDisable = pluginhealth.ActionDisablePlugin
)
