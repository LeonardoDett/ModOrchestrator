// Package relpath provides the normalized relative path used for every
// location inside a game target or a mod folder. It is pure string handling:
// it never touches the filesystem.
package relpath

import (
	"errors"
	"fmt"
	"strings"
)

// ErrInvalid is returned for paths that are empty, absolute or unsafe.
var ErrInvalid = errors.New("relpath: invalid path")

// Path is a relative, forward-slash separated path without "." or ".."
// segments. The original casing is preserved for display; identity is
// case-insensitive (see Key).
type Path struct{ s string }

// Parse normalizes raw and rejects anything that could escape its root or be
// interpreted differently by the OS: absolute paths, drive letters, alternate
// data streams, ".." segments, NUL bytes and segments with trailing dots or
// spaces (which Windows silently strips).
func Parse(raw string) (Path, error) {
	s := strings.ReplaceAll(raw, `\`, "/")
	if strings.TrimSpace(s) == "" {
		return Path{}, fmt.Errorf("%w: empty", ErrInvalid)
	}
	if strings.HasPrefix(s, "/") {
		return Path{}, fmt.Errorf("%w: %q is absolute", ErrInvalid, raw)
	}
	if strings.ContainsAny(s, ":\x00") {
		return Path{}, fmt.Errorf("%w: %q contains a drive, stream or NUL", ErrInvalid, raw)
	}
	segs := make([]string, 0, strings.Count(s, "/")+1)
	for _, seg := range strings.Split(s, "/") {
		switch seg {
		case "", ".":
			continue
		case "..":
			return Path{}, fmt.Errorf("%w: %q escapes its root", ErrInvalid, raw)
		}
		if strings.TrimRight(seg, ". ") != seg {
			return Path{}, fmt.Errorf("%w: segment %q ends with dot or space", ErrInvalid, seg)
		}
		if err := checkSegment(seg); err != nil {
			return Path{}, err
		}
		segs = append(segs, seg)
	}
	if len(segs) == 0 {
		return Path{}, fmt.Errorf("%w: empty", ErrInvalid)
	}
	return Path{s: strings.Join(segs, "/")}, nil
}

// MustParse is Parse for trusted literals; it panics on invalid input.
func MustParse(raw string) Path {
	p, err := Parse(raw)
	if err != nil {
		panic(err)
	}
	return p
}

// String returns the normalized path with its original casing.
func (p Path) String() string { return p.s }

// Key is the identity used to compare paths: two paths with the same Key
// address the same file on the deployment target.
func (p Path) Key() string { return strings.ToLower(p.s) }

// Equal reports whether both paths address the same file.
func (p Path) Equal(o Path) bool { return p.Key() == o.Key() }

// IsZero reports whether the path was never parsed.
func (p Path) IsZero() bool { return p.s == "" }

// reservedNames are device names Windows resolves regardless of extension
// (INV-ID-02): "nul.txt" opens the NUL device, not a file.
var reservedNames = map[string]struct{}{
	"con": {}, "prn": {}, "aux": {}, "nul": {}, "conin$": {}, "conout$": {},
	"com1": {}, "com2": {}, "com3": {}, "com4": {}, "com5": {}, "com6": {}, "com7": {}, "com8": {}, "com9": {},
	"lpt1": {}, "lpt2": {}, "lpt3": {}, "lpt4": {}, "lpt5": {}, "lpt6": {}, "lpt7": {}, "lpt8": {}, "lpt9": {},
}

// checkSegment rejects characters Windows forbids in names and reserved
// device names. The rule is part of the domain so it holds on every OS
// (D039); only the OS API lives in infrastructure.
func checkSegment(seg string) error {
	for _, r := range seg {
		if r < 0x20 || strings.ContainsRune(`<>"|?*`, r) {
			return fmt.Errorf("%w: segment %q contains a forbidden character", ErrInvalid, seg)
		}
	}
	base := strings.ToLower(seg)
	if i := strings.IndexByte(base, '.'); i >= 0 {
		base = base[:i]
	}
	if _, reserved := reservedNames[strings.TrimRight(base, " ")]; reserved {
		return fmt.Errorf("%w: segment %q is a reserved device name", ErrInvalid, seg)
	}
	return nil
}
