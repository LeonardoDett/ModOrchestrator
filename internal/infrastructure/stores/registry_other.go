//go:build !windows

package stores

// NewRegistry returns nil outside Windows: there is no registry to read
// (D039), and the scanner treats a nil registry as "nothing found".
func NewRegistry() Registry { return nil }
