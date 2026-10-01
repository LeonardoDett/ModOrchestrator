// Package memfs is an in-memory ports.FileSystem for tests. Paths are
// compared like the real platform does (case-insensitive, either
// separator). Hardlinks share content and file id; symlinks record their
// target (Stat does not follow them, like the real Lstat).
package memfs

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// content is what hardlinks share: data, time and file identity.
type content struct {
	id    int
	data  []byte
	mtime time.Time
}

type node struct {
	name string // display name
	dir  bool
	*content
	// link is the target of a symlink ("" for files and folders).
	link string
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
	// Fail, when set, is asked before every mutating call ("hardlink",
	// "symlink", "copy", "rename", "remove", "rmdir", "mkdir", "write") and
	// its error is returned instead of acting (fault injection).
	Fail func(op, path string) error
	// Format is returned by VolumeFormat ("NTFS" when empty).
	Format string
	// NoSymlinks makes Symlink fail like Windows without Developer Mode.
	NoSymlinks bool
	nextID     int
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

var baseTime = time.Unix(1700000000, 0).UTC()

func (f *FS) newContent(data []byte, mtime time.Time) *content {
	f.nextID++
	return &content{id: f.nextID, data: data, mtime: mtime}
}

func (f *FS) fail(op, path string) error {
	if f.Fail == nil {
		return nil
	}
	return f.Fail(op, path)
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

func idOf(n *node) string { return "mem:" + strconv.Itoa(n.id) }

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
	f.nodes[key(path)] = &node{name: base(path), content: f.newContent([]byte(data), baseTime)}
}

// SetContent changes a file's content in place (an edit through any of its
// hardlinks), keeping its identity.
func (f *FS) SetContent(path, data string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if n, ok := f.nodes[key(path)]; ok && n.content != nil {
		n.data = []byte(data)
		n.mtime = n.mtime.Add(time.Second)
	}
}

// FileID returns the identity of a file ("" when absent).
func (f *FS) FileID(path string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if n, ok := f.nodes[key(path)]; ok && n.content != nil {
		return idOf(n)
	}
	return ""
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
	if !ok || n.content == nil {
		return "", false
	}
	return string(n.data), true
}

func (f *FS) Stat(_ context.Context, path string) (ports.FileInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(path)]
	switch {
	case !ok:
		return ports.FileInfo{}, nil
	case n.dir:
		return ports.FileInfo{Exists: true, IsDir: true}, nil
	case n.link != "":
		return ports.FileInfo{Exists: true, IsSymlink: true, LinkTarget: n.link}, nil
	}
	return ports.FileInfo{Exists: true, Size: int64(len(n.data)), ModTime: n.mtime, FileID: idOf(n)}, nil
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
	if ok && n.link != "" {
		n, ok = f.nodes[key(n.link)]
	}
	if !ok || n.content == nil {
		return nil, errors.New("memfs: no such file")
	}
	return io.NopCloser(bytes.NewReader(bytes.Clone(n.data))), nil
}

func (f *FS) MkdirAll(_ context.Context, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if n, ok := f.nodes[key(path)]; ok && !n.dir {
		return errors.New("memfs: a file exists at " + path)
	}
	if err := f.fail("mkdir", path); err != nil {
		return err
	}
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
	if err := f.fail("write", path); err != nil {
		return err
	}
	f.Writes = append(f.Writes, "write "+path)
	f.nodes[key(path)] = &node{name: base(path), content: f.newContent(bytes.Clone(data), baseTime)}
	return nil
}

// creatable checks that dst does not exist and its folder does.
func (f *FS) creatable(dst string) error {
	if _, exists := f.nodes[key(dst)]; exists {
		return errors.New("memfs: file exists")
	}
	if p, ok := f.nodes[key(parent(dst))]; !ok || !p.dir {
		return errors.New("memfs: parent folder missing")
	}
	return nil
}

// Hardlink makes dst another name of src (shared content and id).
func (f *FS) Hardlink(_ context.Context, src, dst string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(src)]
	if !ok || n.content == nil {
		return errors.New("memfs: no such file")
	}
	if err := f.creatable(dst); err != nil {
		return err
	}
	if err := f.fail("hardlink", dst); err != nil {
		return err
	}
	f.Writes = append(f.Writes, "hardlink "+src+" "+dst)
	f.nodes[key(dst)] = &node{name: base(dst), content: n.content}
	return nil
}

// Symlink records a link to target at link.
func (f *FS) Symlink(_ context.Context, target, link string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.NoSymlinks {
		return errors.New("memfs: a required privilege is not held by the client")
	}
	if err := f.creatable(link); err != nil {
		return err
	}
	if err := f.fail("symlink", link); err != nil {
		return err
	}
	f.Writes = append(f.Writes, "symlink "+target+" "+link)
	f.nodes[key(link)] = &node{name: base(link), link: target}
	return nil
}

// Copy copies a file keeping its time; the destination must not exist and
// its folder must.
func (f *FS) Copy(_ context.Context, src, dst string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(src)]
	if !ok || n.content == nil {
		return errors.New("memfs: no such file")
	}
	if err := f.creatable(dst); err != nil {
		return err
	}
	if err := f.fail("copy", dst); err != nil {
		return err
	}
	f.Writes = append(f.Writes, "copy "+src+" "+dst)
	f.nodes[key(dst)] = &node{name: base(dst), content: f.newContent(bytes.Clone(n.data), n.mtime)}
	return nil
}

// Rename moves a file or a whole folder; the destination must not exist
// (like a directory rename on Windows) unless both are files, in which case
// it is replaced atomically.
func (f *FS) Rename(_ context.Context, src, dst string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(src)]
	if !ok {
		return errors.New("memfs: no such file")
	}
	if d, exists := f.nodes[key(dst)]; exists && (d.dir || n.dir) {
		return errors.New("memfs: destination exists")
	}
	if p, ok := f.nodes[key(parent(dst))]; !ok || !p.dir {
		return errors.New("memfs: parent folder missing")
	}
	if err := f.fail("rename", dst); err != nil {
		return err
	}
	f.Writes = append(f.Writes, "rename "+src+" "+dst)
	prefix := key(src) + "/"
	moved := map[string]*node{}
	for k, c := range f.nodes {
		if strings.HasPrefix(k, prefix) {
			moved[key(dst)+"/"+k[len(prefix):]] = c
			delete(f.nodes, k)
		}
	}
	delete(f.nodes, key(src))
	n.name = base(dst)
	f.nodes[key(dst)] = n
	for k, c := range moved {
		f.nodes[k] = c
	}
	return nil
}

// Paths lists every path below root (files and folders), sorted, relative
// with "/" separators; handy to assert that nothing was left behind.
func (f *FS) Paths(root string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	prefix := key(root) + "/"
	var out []string
	for k := range f.nodes {
		if strings.HasPrefix(k, prefix) {
			out = append(out, k[len(prefix):])
		}
	}
	sort.Strings(out)
	return out
}

// Remove deletes a file or an empty folder, failing like the real one when
// the path does not exist or the folder is not empty.
func (f *FS) Remove(_ context.Context, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	n, ok := f.nodes[key(path)]
	if !ok {
		return errors.New("memfs: no such file")
	}
	if n.dir {
		prefix := key(path) + "/"
		for k := range f.nodes {
			if strings.HasPrefix(k, prefix) {
				return errors.New("memfs: folder not empty")
			}
		}
	}
	if err := f.fail("remove", path); err != nil {
		return err
	}
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
		if err := f.fail("rmdir", path); err != nil {
			return err
		}
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

// VolumeFormat reports the filesystem of the volume.
func (f *FS) VolumeFormat(context.Context, string) (string, error) {
	if f.Format == "" {
		return "NTFS", nil
	}
	return f.Format, nil
}

func (f *FS) FreeSpace(context.Context, string) (int64, error) { return f.FreeBytes, nil }

func (f *FS) Drives(context.Context) ([]string, error) { return f.drives, nil }
