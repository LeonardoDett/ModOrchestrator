//go:build !windows

package system

// InstanceRunning is only probed on Windows (D039); elsewhere the single
// instance lock of the window toolkit decides alone.
func InstanceRunning(string) bool { return false }
