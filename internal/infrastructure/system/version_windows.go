//go:build windows

package system

import (
	"context"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// FileVersions reads the version resource of executables.
type FileVersions struct{}

// FileVersion returns "major.minor.build.revision", or "" when the file has
// no version resource (or does not exist).
func (FileVersions) FileVersion(_ context.Context, path string) (string, error) {
	size, err := windows.GetFileVersionInfoSize(path, nil)
	if err != nil || size == 0 {
		return "", nil
	}
	block := make([]byte, size)
	if err := windows.GetFileVersionInfo(path, 0, size, unsafe.Pointer(&block[0])); err != nil {
		return "", nil
	}
	var info *windows.VS_FIXEDFILEINFO
	var length uint32
	if err := windows.VerQueryValue(unsafe.Pointer(&block[0]), `\`, unsafe.Pointer(&info), &length); err != nil || info == nil {
		return "", nil
	}
	return fmt.Sprintf("%d.%d.%d.%d",
		info.FileVersionMS>>16, info.FileVersionMS&0xffff, info.FileVersionLS>>16, info.FileVersionLS&0xffff), nil
}
