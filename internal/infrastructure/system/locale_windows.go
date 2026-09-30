//go:build windows

package system

import (
	"syscall"
	"unsafe"
)

// Locale reads the user's UI language from Windows.
type Locale struct{}

var procGetUserDefaultLocaleName = syscall.NewLazyDLL("kernel32.dll").NewProc("GetUserDefaultLocaleName")

// Language returns the user default locale name ("pt-BR"), or "" on failure.
func (Locale) Language() string {
	const localeNameMaxLength = 85
	buf := make([]uint16, localeNameMaxLength)
	n, _, _ := procGetUserDefaultLocaleName.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if n == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}
