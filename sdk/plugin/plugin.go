// Package plugin is the plugin vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/plugin an adapter may use, as aliases.
package plugin

import (
	inner "modorchestrator/internal/core/domain/plugin"
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
)
