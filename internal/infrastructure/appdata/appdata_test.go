package appdata

import (
	"path/filepath"
	"testing"
)

// The single instance lock follows the data folder only when it was moved.
func TestDirKey(t *testing.T) {
	t.Setenv(EnvDataDir, "")
	if k := DirKey(); k != "" {
		t.Fatalf("default folder: %q", k)
	}
	dir := t.TempDir()
	t.Setenv(EnvDataDir, dir)
	a := DirKey()
	t.Setenv(EnvDataDir, dir+string(filepath.Separator))
	if b := DirKey(); a == "" || a != b {
		t.Fatalf("same folder, different keys: %q %q", a, b)
	}
	t.Setenv(EnvDataDir, filepath.Join(dir, "other"))
	if c := DirKey(); c == a {
		t.Fatal("two folders, one key")
	}
}
