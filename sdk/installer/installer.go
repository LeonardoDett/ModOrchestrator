// Package installer is the installer vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/installer an adapter may use, as aliases.
package installer

import (
	inner "modorchestrator/internal/core/domain/installer"
)

type (
	Context   = inner.Context
	Entry     = inner.Entry
	File      = inner.File
	Installer = inner.Installer
	Metadata  = inner.Metadata
	Options   = inner.Options
	Plan      = inner.Plan
	Result    = inner.Result
)

const (
	OptionRoot = inner.OptionRoot
)

var (
	ErrUnsupported = inner.ErrUnsupported
)

// Finish is inner.Finish.
func Finish(p *Plan) (*Plan, error) { return inner.Finish(p) }
