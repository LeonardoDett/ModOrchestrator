// Package relpath is the relpath vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/relpath an adapter may use, as aliases.
package relpath

import (
	inner "modorchestrator/internal/core/domain/relpath"
)

type (
	Path = inner.Path
)

// MustParse is inner.MustParse.
func MustParse(raw string) Path { return inner.MustParse(raw) }

// Parse is inner.Parse.
func Parse(raw string) (Path, error) { return inner.Parse(raw) }
