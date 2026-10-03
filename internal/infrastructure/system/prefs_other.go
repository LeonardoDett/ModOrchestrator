//go:build !windows

package system

// Preferences reads the OS preferences derived settings follow (core/13).
type Preferences struct{}

// ReduceMotion is unknown outside Windows.
func (Preferences) ReduceMotion() bool { return false }

// LongPaths: paths are not limited outside Windows.
func (Preferences) LongPaths() (enabled, known bool) { return true, true }
