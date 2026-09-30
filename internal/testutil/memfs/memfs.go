// Package memfs is an in-memory ports.FileSystem for tests. Paths are
// compared like the real platform does (case-insensitive, either
// separator). It supports what the games service needs; link operations
// are not implemented.
package memfs

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

type node struct {
	name  string // display name
	dir   bool
	data  []byte
	mtime time.Time
}

// FS is a fake filesystem. The zero value is not usable; call New.
type FS struct {
	mu     sync.Mutex
	nodes  map[string]*node
	drives []string
	// Denied lists folders whose listing fails, to test unreadable folders.
	Denied map[string]bool
	// FreeBytes is returned by FreeSpace.
	FreeBytes int64
	// Writes records every mutating call, in order ("mkdir C:\x").
	Writes []string
}

var (
	_ ports.FileSystem  = (*FS)(nil)
	_ ports.DriveLister = (*FS)(nil)
)

// New returns an empty filesystem with the given drives ("C:", "D:").
func New(drives ...string) *FS {
	f := &FS{nodes: map[string]*node{}, Denied: map[string]bool{}, FreeBytes: 1 << 40, drives: drives}
	for _, d := range drives {
		f.nodes[key(d)] = &node{name: d, dir: true}
	}
	return f
}

func key(p string) string { return game.CleanAbs(p) }

func parent(p string) string {
	s := strings.TrimRight(strings.ReplaceAll(p, `\`, "/"), "/")
	i := strings.LastIndex(s, "/")
	if i < 0 {
		return ""
	}
	return s[:i]
}

func base(p string) string {
	s := strings.TrimRight(strings.ReplaceAll(p, `\`, "/"), "/")
	return s[strings.LastIndex(s, "/")+1:]
}

// AddDir creates the folder and its parents.
func (f *FS) AddDir(path string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.mkdirAll(path)
}

func (f *FS) mkdirAll(path string) {
	s := strings.TrimRight(strings.ReplaceAll(path, `\`, "/"), "/")
	for cur := s; cur != ""; cur = parent(cur) {
		if _, ok := f.nodes[key(cur)]; ok {
			break
		}
		f.nodes[key(cur)] = &node{name: base(cur), dir: true}
	}
}

// AddFile creates a file (and its parents).
func (f *FS) AddFile(path string, data string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.mkdirAll(parent(path))
	f.nodes[key(path)] = &node{name: base(path), data: []byte(data)}
}

// Exists reports whether a path exists.
func (f *FS) Exists(path string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.nodes[key(path)]
	return ok
}

// Content returns a file's content.
func (f *FS) Content(path string) (string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(path)]
	if !ok || n.dir {
		return "", false
	}
	return string(n.data), true
}

func (f *FS) Stat(_ context.Context, path string) (ports.FileInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(path)]
	if !ok {
		return ports.FileInfo{}, nil
	}
	return ports.FileInfo{Exists: true, IsDir: n.dir, Size: int64(len(n.data)), ModTime: n.mtime}, nil
}

func (f *FS) ReadDir(_ context.Context, path string) ([]ports.DirEntry, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Denied[key(path)] {
		return nil, errors.New("memfs: access denied")
	}
	n, ok := f.nodes[key(path)]
	if !ok || !n.dir {
		return nil, errors.New("memfs: not a directory")
	}
	prefix := key(path) + "/"
	var out []ports.DirEntry
	for k, c := range f.nodes {
		if strings.HasPrefix(k, prefix) && !strings.Contains(k[len(prefix):], "/") {
			out = append(out, ports.DirEntry{Name: c.name, IsDir: c.dir})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (f *FS) Open(_ context.Context, path string) (io.ReadCloser, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(path)]
	if !ok || n.dir {
		return nil, errors.New("memfs: no such file")
	}
	return io.NopCloser(bytes.NewReader(n.data)), nil
}

func (f *FS) MkdirAll(_ context.Context, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Writes = append(f.Writes, "mkdir "+path)
	f.mkdirAll(path)
	return nil
}

func (f *FS) WriteFile(_ context.Context, path string, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if p, ok := f.nodes[key(parent(path))]; !ok || !p.dir {
		return errors.New("memfs: parent folder missing")
	}
	f.Writes = append(f.Writes, "write "+path)
	f.nodes[key(path)] = &node{name: base(path), data: bytes.Clone(data)}
	return nil
}

func (f *FS) Hardlink(context.Context, string, string) error { return errors.New("memfs: unsupported") }
func (f *FS) Symlink(context.Context, string, string) error  { return errors.New("memfs: unsupported") }
func (f *FS) Copy(context.Context, string, string) error     { return errors.New("memfs: unsupported") }
func (f *FS) Rename(context.Context, string, string) error   { return errors.New("memfs: unsupported") }

func (f *FS) Remove(_ context.Context, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Writes = append(f.Writes, "remove "+path)
	delete(f.nodes, key(path))
	return nil
}

func (f *FS) RemoveEmptyDir(_ context.Context, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	prefix := key(path) + "/"
	for k := range f.nodes {
		if strings.HasPrefix(k, prefix) {
			return nil
		}
	}
	if n, ok := f.nodes[key(path)]; ok && n.dir {
		f.Writes = append(f.Writes, "rmdir "+path)
		delete(f.nodes, key(path))
	}
	return nil
}

func (f *FS) RemoveAll(_ context.Context, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Writes = append(f.Writes, "removeall "+path)
	prefix := key(path) + "/"
	for k := range f.nodes {
		if k == key(path) || strings.HasPrefix(k, prefix) {
			delete(f.nodes, k)
		}
	}
	return nil
}

func (f *FS) SameVolume(_ context.Context, a, b string) (bool, error) {
	return game.Volume(a) == game.Volume(b), nil
}

func (f *FS) FreeSpace(context.Context, string) (int64, error) { return f.FreeBytes, nil }

func (f *FS) Drives(context.Context) ([]string, error) { return f.drives, nil }
