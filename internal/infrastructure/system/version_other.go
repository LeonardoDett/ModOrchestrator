//go:build !windows

package system

import "context"

// FileVersions has no version resources to read outside Windows (D039).
type FileVersions struct{}

func (FileVersions) FileVersion(context.Context, string) (string, error) { return "", nil }
