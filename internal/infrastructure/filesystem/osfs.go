// Package filesystem is the disk-backed ports.FileSystem. Paths are absolute
// Windows paths (D039); long paths are handled by the platform files.
package filesystem

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"modorchestrator/internal/core/application/ports"
)

// OS implements ports.FileSystem and ports.DriveLister.
type OS struct{}

var (
	_ ports.FileSystem  = OS{}
	_ ports.DriveLister = OS{}
)

// New returns the filesystem.
func New() OS { return OS{} }

func (OS) Stat(_ context.Context, path string) (ports.FileInfo, error) {
	p := longPath(path)
	fi, err := os.Lstat(p)
	if errors.Is(err, fs.ErrNotExist) {
		return ports.FileInfo{}, nil
	}
	if err != nil {
		return ports.FileInfo{}, err
	}
	info := ports.FileInfo{Exists: true, IsDir: fi.IsDir(), Size: fi.Size(), ModTime: fi.ModTime(), Created: createdAt(fi)}
	if fi.Mode()&os.ModeSymlink != 0 {
		info.IsSymlink = true
		info.LinkTarget, _ = os.Readlink(p)
		if target, err := os.Stat(p); err == nil {
			info.IsDir = target.IsDir()
		}
	}
	if !info.IsDir {
		info.FileID = fileID(p)
	}
	return info, nil
}

func (OS) ReadDir(_ context.Context, path string) ([]ports.DirEntry, error) {
	entries, err := os.ReadDir(longPath(path))
	if err != nil {
		return nil, err
	}
	out := make([]ports.DirEntry, len(entries))
	for i, e := range entries {
		out[i] = ports.DirEntry{Name: e.Name(), IsDir: e.IsDir()}
	}
	return out, nil
}

func (OS) Open(_ context.Context, path string) (io.ReadCloser, error) {
	return os.Open(longPath(path))
}

func (OS) MkdirAll(_ context.Context, path string) error {
	return classify(os.MkdirAll(longPath(path), 0o755))
}

// classify wraps a platform error with the port's failure kind, keeping the
// original for the technical detail.
func classify(err error) error {
	if err == nil {
		return nil
	}
	if kind := failureKind(err); kind != nil {
		return fmt.Errorf("%w: %w", kind, err)
	}
	if errors.Is(err, fs.ErrPermission) {
		return fmt.Errorf("%w: %w", ports.ErrPermission, err)
	}
	return err
}

// WriteFile writes to a temporary file in the same folder and renames it
// over the destination, so a reader never sees half a marker.
func (OS) WriteFile(_ context.Context, path string, data []byte) error {
	dir := filepath.Dir(path)
	var nonce [6]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return err
	}
	tmp := filepath.Join(dir, ".mo-tmp-"+hex.EncodeToString(nonce[:]))
	if err := os.WriteFile(longPath(tmp), data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(longPath(tmp), longPath(path)); err != nil {
		_ = os.Remove(longPath(tmp))
		return err
	}
	return nil
}

func (OS) Hardlink(_ context.Context, src, dst string) error {
	return classify(os.Link(longPath(src), longPath(dst)))
}

func (OS) Symlink(_ context.Context, target, link string) error {
	return classify(os.Symlink(target, longPath(link)))
}

func (o OS) Copy(ctx context.Context, src, dst string) error {
	return classify(o.copyFile(ctx, src, dst))
}

func (OS) copyFile(_ context.Context, src, dst string) error {
	in, err := os.Open(longPath(src))
	if err != nil {
		return err
	}
	defer in.Close()
	fi, err := in.Stat()
	if err != nil {
		return err
	}
	out, err := os.OpenFile(longPath(dst), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(longPath(dst))
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Chtimes(longPath(dst), fi.ModTime(), fi.ModTime())
}

func (OS) Rename(_ context.Context, src, dst string) error {
	return classify(os.Rename(longPath(src), longPath(dst)))
}

func (OS) Remove(_ context.Context, path string) error { return classify(os.Remove(longPath(path))) }

func (OS) RemoveEmptyDir(_ context.Context, path string) error {
	p := longPath(path)
	entries, err := os.ReadDir(p)
	if errors.Is(err, fs.ErrNotExist) || (err == nil && len(entries) > 0) {
		return nil
	}
	if err != nil {
		return err
	}
	return os.Remove(p)
}

// RemoveAll refuses relative paths and drive roots; the caller is
// responsible for having proven ownership of the folder.
func (OS) RemoveAll(_ context.Context, path string) error {
	clean := filepath.Clean(path)
	vol := filepath.VolumeName(clean)
	if !filepath.IsAbs(clean) || clean == vol+string(filepath.Separator) || clean == vol {
		return fmt.Errorf("filesystem: refusing to remove %q", path)
	}
	return os.RemoveAll(longPath(clean))
}

func (OS) SameVolume(_ context.Context, a, b string) (bool, error) {
	va, err := volumeOf(nearestExisting(a))
	if err != nil {
		return false, err
	}
	vb, err := volumeOf(nearestExisting(b))
	if err != nil {
		return false, err
	}
	return strings.EqualFold(va, vb), nil
}

func (OS) VolumeFormat(_ context.Context, path string) (string, error) {
	return volumeFormat(nearestExisting(path))
}

func (OS) FreeSpace(_ context.Context, path string) (int64, error) {
	return freeSpace(nearestExisting(path))
}

func (OS) Drives(context.Context) ([]string, error) { return fixedDrives() }

// nearestExisting walks up from path to the closest folder that exists, so
// volume questions work for folders not created yet.
func nearestExisting(path string) string {
	p := filepath.Clean(path)
	for {
		if _, err := os.Stat(longPath(p)); err == nil {
			return p
		}
		parent := filepath.Dir(p)
		if parent == p {
			return p
		}
		p = parent
	}
}

// LongPath returns path in the form the OS accepts beyond MAX_PATH (D039),
// for other infrastructure packages that open files directly.
func LongPath(path string) string { return longPath(path) }
