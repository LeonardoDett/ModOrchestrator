//go:build windows

package system

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestFileVersionOfASystemBinary(t *testing.T) {
	path := filepath.Join(os.Getenv("SystemRoot"), "System32", "kernel32.dll")
	v, err := FileVersions{}.FileVersion(context.Background(), path)
	if err != nil || !regexp.MustCompile(`^\d+\.\d+\.\d+\.\d+$`).MatchString(v) {
		t.Fatalf("version = %q, %v", v, err)
	}
	if v, err := (FileVersions{}).FileVersion(context.Background(), filepath.Join(t.TempDir(), "missing.exe")); v != "" || err != nil {
		t.Fatalf("missing file: %q %v", v, err)
	}
}
