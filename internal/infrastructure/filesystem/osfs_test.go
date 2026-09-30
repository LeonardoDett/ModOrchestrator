package filesystem

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

var ctx = context.Background()

func TestWriteFileIsAtomicAndReadable(t *testing.T) {
	dir := t.TempDir()
	fs := New()
	path := filepath.Join(dir, ".modorchestrator-staging")
	if err := fs.WriteFile(ctx, path, []byte(`{"instanceId":"a"}`)); err != nil {
		t.Fatal(err)
	}
	// Overwriting replaces the content and leaves no temporary file.
	if err := fs.WriteFile(ctx, path, []byte(`{"instanceId":"b"}`)); err != nil {
		t.Fatal(err)
	}
	r, err := fs.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(r)
	r.Close()
	if string(data) != `{"instanceId":"b"}` {
		t.Fatalf("content = %s", data)
	}
	entries, _ := fs.ReadDir(ctx, dir)
	if len(entries) != 1 {
		t.Fatalf("leftover files: %+v", entries)
	}
}

func TestStatReportsMissingAsNotExisting(t *testing.T) {
	fs := New()
	info, err := fs.Stat(ctx, filepath.Join(t.TempDir(), "nope"))
	if err != nil || info.Exists {
		t.Fatalf("missing path: %+v %v", info, err)
	}
	dir := t.TempDir()
	info, _ = fs.Stat(ctx, dir)
	if !info.Exists || !info.IsDir {
		t.Fatalf("dir: %+v", info)
	}
}

func TestHardlinkSharesFileID(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("file ids are reported on Windows")
	}
	dir := t.TempDir()
	fs := New()
	a, b := filepath.Join(dir, "a.txt"), filepath.Join(dir, "b.txt")
	os.WriteFile(a, []byte("x"), 0o644)
	if err := fs.Hardlink(ctx, a, b); err != nil {
		t.Fatal(err)
	}
	ia, _ := fs.Stat(ctx, a)
	ib, _ := fs.Stat(ctx, b)
	if ia.FileID == "" || ia.FileID != ib.FileID {
		t.Fatalf("ids %q %q", ia.FileID, ib.FileID)
	}
}

func TestRemoveEmptyDirKeepsNonEmpty(t *testing.T) {
	dir := t.TempDir()
	fs := New()
	full, empty := filepath.Join(dir, "full"), filepath.Join(dir, "empty")
	os.MkdirAll(full, 0o755)
	os.MkdirAll(empty, 0o755)
	os.WriteFile(filepath.Join(full, "f"), nil, 0o644)
	if err := fs.RemoveEmptyDir(ctx, full); err != nil {
		t.Fatal(err)
	}
	if err := fs.RemoveEmptyDir(ctx, empty); err != nil {
		t.Fatal(err)
	}
	if err := fs.RemoveEmptyDir(ctx, filepath.Join(dir, "never-existed")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(full); err != nil {
		t.Fatal("non-empty folder must stay")
	}
	if _, err := os.Stat(empty); err == nil {
		t.Fatal("empty folder should be gone")
	}
}

func TestRemoveAllRefusesRootsAndRelativePaths(t *testing.T) {
	fs := New()
	root := filepath.VolumeName(t.TempDir()) + string(filepath.Separator)
	for _, p := range []string{root, "relative", ""} {
		if err := fs.RemoveAll(ctx, p); err == nil {
			t.Errorf("RemoveAll(%q) must be refused", p)
		}
	}
	dir := filepath.Join(t.TempDir(), "x", "y")
	os.MkdirAll(dir, 0o755)
	if err := fs.RemoveAll(ctx, filepath.Dir(dir)); err != nil {
		t.Fatal(err)
	}
}

func TestSameVolumeForFoldersNotCreatedYet(t *testing.T) {
	fs := New()
	base := t.TempDir()
	same, err := fs.SameVolume(ctx, base, filepath.Join(base, "a", "b", "not-yet"))
	if err != nil || !same {
		t.Fatalf("same volume = %v, %v", same, err)
	}
	if free, err := fs.FreeSpace(ctx, filepath.Join(base, "not-yet")); err != nil || free <= 0 {
		t.Fatalf("free space = %d, %v", free, err)
	}
}

func TestDrivesIncludeTheTempDrive(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip()
	}
	drives, err := New().Drives(ctx)
	if err != nil || len(drives) == 0 {
		t.Fatalf("drives = %v, %v", drives, err)
	}
}
