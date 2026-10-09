//go:build windows

package filesystem

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"modorchestrator/internal/core/domain/relpath"
)

// F14: Windows is the oracle of the path normalization (INV-ID-02, D039).
// A path the domain accepts must create exactly that file below the root,
// and two accepted paths that address the same file have the same Key.
// The converse does not hold for a few characters strings.ToLower folds and
// NTFS does not ("İ"/"i", Kelvin "K"/"k"): such paths count as one Location,
// which errs on the safe side (D099).
func FuzzRelpathOnWindows(f *testing.F) {
	for _, s := range [][2]string{
		{"Data/Textures/a.dds", "data/textures/A.DDS"}, {"COM¹", "x"}, {"lpt².esp", "LPT².ESP"}, {"Ä/ä", "ä/Ä"},
		{"σ", "ς"}, {"ß", "SS"}, {"İ", "i"}, {"K", "K"}, {" ", "  "}, {"a.b", "A.B"},
		{strings.Repeat("d/", 120) + "f", strings.Repeat("D/", 120) + "F"}, {strings.Repeat("n", 255), "n"},
	} {
		f.Add(s[0], s[1])
	}
	fsys := New()
	f.Fuzz(func(t *testing.T, a, b string) {
		pa, err := relpath.Parse(a)
		if err != nil {
			return
		}
		root := t.TempDir()
		target := filepath.Join(root, filepath.FromSlash(pa.String()))
		if err := fsys.MkdirAll(ctx, filepath.Dir(target)); err != nil {
			return // a parent name Windows refuses (too long a segment): refused, not misplaced
		}
		if err := os.WriteFile(longPath(target), []byte("x"), 0o644); err != nil {
			return
		}
		var found []string
		_ = filepath.WalkDir(longPath(root), func(p string, d fs.DirEntry, err error) error {
			if err == nil && !d.IsDir() {
				rel, _ := filepath.Rel(longPath(root), p)
				found = append(found, filepath.ToSlash(rel))
			}
			return nil
		})
		if len(found) != 1 || found[0] != pa.String() {
			t.Fatalf("%q created %q", pa.String(), found)
		}
		pb, err := relpath.Parse(b)
		if err != nil {
			return
		}
		st, err := os.Stat(longPath(filepath.Join(root, filepath.FromSlash(pb.String()))))
		same := err == nil && st.Mode().IsRegular()
		if same && pa.Key() != pb.Key() {
			t.Fatalf("Windows says %q and %q are the same file: %v; Keys %q %q", pa, pb, same, pa.Key(), pb.Key())
		}
	})
}
