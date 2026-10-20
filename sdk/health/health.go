// Package health is the health vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/health an adapter may use, as aliases.
package health

import (
	inner "modorchestrator/internal/core/domain/health"
)

const (
	ActionImport   = inner.ActionImport
	NavigateImport = inner.NavigateImport
)
