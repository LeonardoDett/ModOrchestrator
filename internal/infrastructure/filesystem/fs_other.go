//go:build !windows

package filesystem

import (
	"path/filepath"
	"syscall"
)

// The application targets Windows (D039); these keep the package buildable
// elsewhere for tooling and tests.

func longPath(path string) string { return path }

func fileID(string) string { return "" }

func volumeOf(path string) (string, error) { return filepath.VolumeName(path), nil }

func freeSpace(path string) (int64, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, err
	}
	return int64(st.Bavail) * int64(st.Bsize), nil
}

func fixedDrives() ([]string, error) { return []string{"/"}, nil }
