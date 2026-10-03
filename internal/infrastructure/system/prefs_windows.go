//go:build windows

package system

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

// Preferences reads the OS preferences derived settings follow (core/13).
type Preferences struct{}

var procSystemParametersInfo = syscall.NewLazyDLL("user32.dll").NewProc("SystemParametersInfoW")

// ReduceMotion is true when Windows "Animation effects" is off
// (SPI_GETCLIENTAREAANIMATION).
func (Preferences) ReduceMotion() bool {
	const spiGetClientAreaAnimation = 0x1042
	var on int32
	r, _, _ := procSystemParametersInfo.Call(spiGetClientAreaAnimation, 0, uintptr(unsafe.Pointer(&on)), 0)
	return r != 0 && on == 0
}

// LongPaths reports whether the OS long path support is enabled
// (LongPathsEnabled), for the informative workarounds.longPathSupport.
func (Preferences) LongPaths() (enabled, known bool) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\FileSystem`, registry.QUERY_VALUE)
	if err != nil {
		return false, false
	}
	defer k.Close()
	v, _, err := k.GetIntegerValue("LongPathsEnabled")
	if err != nil {
		return false, true
	}
	return v == 1, true
}
