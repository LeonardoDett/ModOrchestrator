//go:build windows

package filesystem

import (
	"os"
	"path/filepath"
	"testing"
)

// F14: the one-handle Stat returns exactly what the portable path does.
func TestStatFastMatchesSlow(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "a.esp")
	if err := os.WriteFile(file, []byte("plugin"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "hard.esp")
	if err := os.Link(file, link); err != nil {
		t.Fatal(err)
	}
	ro := filepath.Join(dir, "ro.txt")
	if err := os.WriteFile(ro, []byte("x"), 0o444); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{file, link, ro, dir, filepath.Join(dir, "missing"), filepath.Join(dir, "no", "parent")} {
		fast, ok, err := statFast(p)
		if !ok {
			t.Fatalf("%s: fast path not taken", p)
		}
		slow, serr := statSlow(p)
		if (err == nil) != (serr == nil) || fast != slow {
			t.Fatalf("%s:\nfast %+v %v\nslow %+v %v", p, fast, err, slow, serr)
		}
	}
	if a, _, _ := statFast(file); a.FileID == "" {
		t.Fatal("identity")
	} else if b, _, _ := statFast(link); a.FileID != b.FileID {
		t.Fatal("hardlinks share the identity")
	}
	sym := filepath.Join(dir, "sym.esp")
	if os.Symlink(file, sym) == nil {
		if _, ok, _ := statFast(sym); ok {
			t.Fatal("a symlink takes the full path (link target)")
		}
	}
}
