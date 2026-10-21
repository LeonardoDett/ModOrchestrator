//go:build !windows

package system

import (
	"context"

	"modorchestrator/internal/core/application/ports"
)

// Icons has no icon outside Windows (D039).
type Icons struct{}

func (Icons) Icon(context.Context, string, int) ([]byte, error) { return nil, ports.ErrNotFound }
