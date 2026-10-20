//go:build windows

package system

import (
	"golang.org/x/sys/windows"
)

// asfwAny lets any process take the foreground (AllowSetForegroundWindow).
const asfwAny = ^uintptr(0)

var procAllowSetForegroundWindow = windows.NewLazySystemDLL("user32.dll").NewProc("AllowSetForegroundWindow")

// InstanceRunning reports whether a process of the app already holds the
// single instance lock named mutex. It only opens the mutex, never creates
// it, so the first process keeps the lock to itself. When one is running,
// this process (the one the user just opened, in the foreground) allows
// it to bring its window to the front.
func InstanceRunning(mutex string) bool {
	name, err := windows.UTF16PtrFromString(mutex)
	if err != nil {
		return false
	}
	h, err := windows.OpenMutex(windows.SYNCHRONIZE, false, name)
	if err != nil {
		return false
	}
	_ = windows.CloseHandle(h)
	_, _, _ = procAllowSetForegroundWindow.Call(asfwAny)
	return true
}
