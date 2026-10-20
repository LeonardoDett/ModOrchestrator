// Package diagnostic is the diagnostic vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/diagnostic an adapter may use, as aliases.
package diagnostic

import (
	inner "modorchestrator/internal/core/domain/diagnostic"
)

type (
	Action     = inner.Action
	Code       = inner.Code
	CodeSpec   = inner.CodeSpec
	Diagnostic = inner.Diagnostic
	Evidence   = inner.Evidence
	Params     = inner.Params
	Severity   = inner.Severity
	Spec       = inner.Spec
)

const (
	CodeFrameworkMissing = inner.CodeFrameworkMissing
	SeverityInfo         = inner.SeverityInfo
	SeverityWarning      = inner.SeverityWarning
	SeverityError        = inner.SeverityError
)
