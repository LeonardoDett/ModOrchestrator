//go:build !windows

package system

import "context"

// Processes is unavailable outside Windows (D039): nothing is reported as
// running.
type Processes struct{}

// Running reports no running process.
func (Processes) Running(context.Context, []string) ([]string, error) { return nil, nil }
