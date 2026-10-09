//go:build !windows

package updates

import (
	"context"
	"os/exec"

	"modorchestrator/internal/core/domain/appupdate"
)

// Signatures has no Authenticode outside Windows (D039: V1 is Windows only).
type Signatures struct{}

func (Signatures) Verify(context.Context, string) (appupdate.Signature, error) {
	return appupdate.SignatureMissing, nil
}

func newInstallerCommand(path string) *exec.Cmd { return exec.Command(path) }
