// Package archive implements ports.Extractor in pure Go (D062): ZIP with
// the standard library, 7Z with bodgit/sevenzip, RAR with
// nwaples/rardecode, and imported folders (D048) by walking the disk.
// Libraries only read; every write is done here, after the entry path was
// normalised and proven to stay below the destination (INV-ID-04). Nothing
// is ever executed (INV-LIB-04).
package archive

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/bodgit/sevenzip"
	"github.com/nwaples/rardecode/v2"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/relpath"
	"modorchestrator/internal/infrastructure/filesystem"
)

// Extractor implements ports.Extractor.
type Extractor struct{}

var _ ports.Extractor = Extractor{}

// New returns the extractor.
func New() Extractor { return Extractor{} }

var (
	magicZip      = []byte("PK\x03\x04")
	magicZipEmpty = []byte("PK\x05\x06")
	magic7z       = []byte{'7', 'z', 0xBC, 0xAF, 0x27, 0x1C}
	magicRar      = []byte("Rar!\x1A\x07")
)

// fileAttributeReparsePoint marks Windows links in archive attributes.
const fileAttributeReparsePoint = 0x400

// Detect identifies the format by content, never by extension: an .exe
// renamed .zip is unsupported.
func (Extractor) Detect(_ context.Context, path string) (string, error) {
	p := filesystem.LongPath(path)
	fi, err := os.Stat(p)
	if err != nil {
		return "", err
	}
	if fi.IsDir() {
		return ports.FormatFolder, nil
	}
	f, err := os.Open(p)
	if err != nil {
		return "", err
	}
	defer f.Close()
	head := make([]byte, 8)
	n, _ := io.ReadFull(f, head)
	head = head[:n]
	switch {
	case bytes.HasPrefix(head, magicZip), bytes.HasPrefix(head, magicZipEmpty):
		return ports.FormatZip, nil
	case bytes.HasPrefix(head, magic7z):
		return ports.Format7z, nil
	case bytes.HasPrefix(head, magicRar):
		return ports.FormatRar, nil
	}
	return "", ports.ErrArchiveUnsupported
}

// List returns every entry without extracting anything.
func (e Extractor) List(ctx context.Context, path string) ([]ports.ArchiveEntry, error) {
	format, err := e.Detect(ctx, path)
	if err != nil {
		return nil, err
	}
	var out []ports.ArchiveEntry
	err = e.walk(ctx, format, path, func(en ports.ArchiveEntry, _ func() (io.ReadCloser, error)) error {
		out = append(out, en)
		return nil
	})
	return out, err
}

// Extract writes every file entry below destDir. It refuses links and
// unsafe paths again, and stops once more than opts.MaxBytes were written.
func (e Extractor) Extract(ctx context.Context, path, destDir string, opts ports.ExtractOptions) error {
	format, err := e.Detect(ctx, path)
	if err != nil {
		return err
	}
	root, err := filepath.Abs(destDir)
	if err != nil {
		return err
	}
	var written int64
	return e.walk(ctx, format, path, func(en ports.ArchiveEntry, open func() (io.ReadCloser, error)) error {
		if en.IsLink {
			return fmt.Errorf("%w: %s is a link", ports.ErrArchiveUnsafe, en.Path)
		}
		target, err := safeTarget(root, en.Path)
		if err != nil {
			if en.IsDir {
				return nil // "./" and similar folder noise
			}
			return err
		}
		if en.IsDir {
			return os.MkdirAll(filesystem.LongPath(target), 0o755)
		}
		if err := os.MkdirAll(filesystem.LongPath(filepath.Dir(target)), 0o755); err != nil {
			return err
		}
		rc, err := open()
		if err != nil {
			return classify(err)
		}
		defer rc.Close()
		out, err := os.OpenFile(filesystem.LongPath(target), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		w := &limitWriter{w: out, ctx: ctx, total: &written, max: opts.MaxBytes, progress: opts.Progress}
		_, cerr := io.Copy(w, rc)
		if err := out.Close(); cerr == nil {
			cerr = err
		}
		return classify(cerr)
	})
}

// walk visits every entry in archive order. open is valid only during the
// callback.
func (Extractor) walk(ctx context.Context, format, path string, fn func(ports.ArchiveEntry, func() (io.ReadCloser, error)) error) error {
	p := filesystem.LongPath(path)
	switch format {
	case ports.FormatZip:
		r, err := zip.OpenReader(p)
		if err != nil {
			return classify(err)
		}
		defer r.Close()
		for _, f := range r.File {
			if err := ctx.Err(); err != nil {
				return err
			}
			if f.Flags&0x1 != 0 {
				return ports.ErrArchiveEncrypted
			}
			mode := f.Mode()
			en := ports.ArchiveEntry{Path: f.Name, Size: int64(f.UncompressedSize64), IsDir: mode.IsDir() || strings.HasSuffix(f.Name, "/"),
				IsLink: mode&(fs.ModeSymlink|fs.ModeDevice|fs.ModeNamedPipe|fs.ModeSocket) != 0}
			if err := fn(en, f.Open); err != nil {
				return err
			}
		}
		return nil
	case ports.Format7z:
		r, err := sevenzip.OpenReader(p)
		if err != nil {
			return classify(err)
		}
		defer r.Close()
		for _, f := range r.File {
			if err := ctx.Err(); err != nil {
				return err
			}
			mode := f.FileInfo().Mode()
			en := ports.ArchiveEntry{Path: f.Name, Size: int64(f.UncompressedSize), IsDir: mode.IsDir(),
				IsLink: mode&fs.ModeSymlink != 0 || f.Attributes&fileAttributeReparsePoint != 0}
			if err := fn(en, f.Open); err != nil {
				return err
			}
		}
		return nil
	case ports.FormatRar:
		r, err := rardecode.OpenReader(p)
		if err != nil {
			return classify(err)
		}
		defer r.Close()
		for {
			if err := ctx.Err(); err != nil {
				return err
			}
			h, err := r.Next()
			if errors.Is(err, io.EOF) {
				return nil
			}
			if err != nil {
				return classify(err)
			}
			if h.Encrypted || h.HeaderEncrypted {
				return ports.ErrArchiveEncrypted
			}
			en := ports.ArchiveEntry{Path: h.Name, Size: h.UnPackedSize, IsDir: h.IsDir,
				IsLink: h.LinkType != 0 || h.Mode()&fs.ModeSymlink != 0}
			if err := fn(en, func() (io.ReadCloser, error) { return io.NopCloser(r), nil }); err != nil {
				return err
			}
		}
	case ports.FormatFolder:
		base, err := filepath.Abs(path)
		if err != nil {
			return err
		}
		return filepath.WalkDir(filesystem.LongPath(base), func(cur string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			rel, err := filepath.Rel(filesystem.LongPath(base), cur)
			if err != nil || rel == "." {
				return err
			}
			en := ports.ArchiveEntry{Path: filepath.ToSlash(rel), IsDir: d.IsDir(), IsLink: d.Type()&fs.ModeSymlink != 0 || d.Type()&fs.ModeIrregular != 0}
			if !en.IsDir && !en.IsLink {
				info, err := d.Info()
				if err != nil {
					return err
				}
				en.Size = info.Size()
			}
			if en.IsLink && d.IsDir() {
				// never follow a linked folder
				if err := fn(en, nil); err != nil {
					return err
				}
				return fs.SkipDir
			}
			return fn(en, func() (io.ReadCloser, error) { return os.Open(cur) })
		})
	}
	return ports.ErrArchiveUnsupported
}

// safeTarget joins a raw entry path to root only after the domain
// normalisation accepted it, and checks the result is below root
// (anti-pattern 32).
func safeTarget(root, raw string) (string, error) {
	rel, err := relpath.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ports.ErrArchiveUnsafe, err)
	}
	target := filepath.Join(root, filepath.FromSlash(rel.String()))
	if !strings.HasPrefix(strings.ToLower(target), strings.ToLower(root)+string(filepath.Separator)) {
		return "", fmt.Errorf("%w: %s", ports.ErrArchiveUnsafe, raw)
	}
	return target, nil
}

// classify maps library errors to the port errors.
func classify(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, ports.ErrArchiveTooLarge), errors.Is(err, context.Canceled), errors.Is(err, ports.ErrArchiveUnsafe):
		return err
	case errors.Is(err, rardecode.ErrArchiveEncrypted), errors.Is(err, rardecode.ErrArchivedFileEncrypted),
		errors.Is(err, rardecode.ErrBadPassword), strings.Contains(err.Error(), "password"):
		return fmt.Errorf("%w: %v", ports.ErrArchiveEncrypted, err)
	case errors.Is(err, zip.ErrFormat), errors.Is(err, zip.ErrChecksum), errors.Is(err, zip.ErrAlgorithm),
		errors.Is(err, io.ErrUnexpectedEOF), strings.Contains(err.Error(), "sevenzip"), strings.Contains(err.Error(), "rardecode"):
		return fmt.Errorf("%w: %v", ports.ErrArchiveCorrupt, err)
	}
	var pe *fs.PathError
	if errors.As(err, &pe) {
		return err
	}
	return fmt.Errorf("%w: %v", ports.ErrArchiveCorrupt, err)
}

// limitWriter counts bytes as they are written, stops at max and reports
// progress; it also honours cancellation between writes.
type limitWriter struct {
	w        io.Writer
	ctx      context.Context
	total    *int64
	max      int64
	progress func(int64)
}

func (l *limitWriter) Write(p []byte) (int, error) {
	if err := l.ctx.Err(); err != nil {
		return 0, err
	}
	if l.max > 0 && *l.total+int64(len(p)) > l.max {
		return 0, ports.ErrArchiveTooLarge
	}
	n, err := l.w.Write(p)
	*l.total += int64(n)
	if l.progress != nil {
		l.progress(*l.total)
	}
	return n, err
}
