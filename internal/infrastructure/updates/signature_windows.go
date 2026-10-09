//go:build windows

package updates

import (
	"context"
	"errors"
	"os/exec"
	"unsafe"

	"golang.org/x/sys/windows"

	"modorchestrator/internal/core/domain/appupdate"
)

// Signatures checks Authenticode with WinVerifyTrust (ports.SignatureVerifier):
// the file's embedded signature, its chain up to a trusted root and the
// whole-chain revocation status.
type Signatures struct{}

// Verify reports valid, missing (no signature) or invalid (anything else:
// tampered file, untrusted or revoked certificate).
func (Signatures) Verify(_ context.Context, path string) (appupdate.Signature, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}
	data := &windows.WinTrustData{
		Size:             uint32(unsafe.Sizeof(windows.WinTrustData{})),
		UIChoice:         windows.WTD_UI_NONE,
		RevocationChecks: windows.WTD_REVOKE_WHOLECHAIN,
		UnionChoice:      windows.WTD_CHOICE_FILE,
		StateAction:      windows.WTD_STATEACTION_VERIFY,
		FileOrCatalogOrBlobOrSgnrOrCert: unsafe.Pointer(&windows.WinTrustFileInfo{
			Size:     uint32(unsafe.Sizeof(windows.WinTrustFileInfo{})),
			FilePath: p,
		}),
	}
	verr := windows.WinVerifyTrustEx(windows.InvalidHWND, &windows.WINTRUST_ACTION_GENERIC_VERIFY_V2, data)
	data.StateAction = windows.WTD_STATEACTION_CLOSE
	_ = windows.WinVerifyTrustEx(windows.InvalidHWND, &windows.WINTRUST_ACTION_GENERIC_VERIFY_V2, data)
	var errno windows.Errno
	switch {
	case verr == nil:
		return appupdate.SignatureValid, nil
	case errors.As(verr, &errno) && windows.Handle(errno) == windows.TRUST_E_NOSIGNATURE:
		return appupdate.SignatureMissing, nil
	}
	return appupdate.SignatureInvalid, nil
}

func newInstallerCommand(path string) *exec.Cmd { return exec.Command(path) }
