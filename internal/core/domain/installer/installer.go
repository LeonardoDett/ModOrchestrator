// Package installer turns the entries of an archive into an install plan
// (core/03). State category: calculated. Installers are pure: they read a
// list of entries and a game context and answer with a plan, a decision to
// ask the user, or an error. They never touch the disk; the import operation
// materializes the plan (core/02 §3 step stage), which keeps installers
// testable without a filesystem (core/03 §2, §9).
package installer

import (
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// Errors returned by installers and entry checks.
var (
	// ErrNoInstallableFiles means the chosen root holds no file to install.
	ErrNoInstallableFiles = errors.New("installer: no installable files")
	// ErrUnsupported means the installer cannot handle the archive.
	ErrUnsupported = errors.New("installer: unsupported")
	// ErrInvalidOption means a stored option (e.g. root) no longer applies.
	ErrInvalidOption = errors.New("installer: invalid option")
)

// RawEntry is an archive entry as the extractor lists it, before any
// normalisation.
type RawEntry struct {
	Path string
	Size int64
	Dir  bool
	// Link marks symbolic links, hard links and devices: never extracted.
	Link bool
}

// Entry is a safe, normalised archive entry.
type Entry struct {
	Path relpath.Path
	Size int64
	Dir  bool
}

// Unsafe is an entry refused by Inspect, with the reason (core/02 §3 step
// inspect): "path" (escapes the root, absolute, stream, reserved name) or
// "link".
type Unsafe struct {
	Raw    string
	Reason string
}

// Inspect normalises the listed entries. Any unsafe entry refuses the whole
// archive: nothing of it is extracted (INV-ID-04). Folders implied by file
// paths are added, and duplicated paths (same key) keep the last one, as
// extraction would.
func Inspect(raw []RawEntry) ([]Entry, []Unsafe) {
	var unsafe []Unsafe
	byKey := map[string]int{}
	var out []Entry
	add := func(e Entry) {
		if i, ok := byKey[e.Path.Key()]; ok {
			if !e.Dir {
				out[i] = e
			}
			return
		}
		byKey[e.Path.Key()] = len(out)
		out = append(out, e)
	}
	for _, r := range raw {
		if r.Link {
			unsafe = append(unsafe, Unsafe{Raw: r.Path, Reason: "link"})
			continue
		}
		p, err := relpath.Parse(r.Path)
		if err != nil {
			// A bare "./" or "/" folder entry is harmless noise of some
			// archivers; anything else is refused.
			if r.Dir && strings.Trim(strings.ReplaceAll(r.Path, `\`, "/"), "/.") == "" && !strings.Contains(r.Path, "..") {
				continue
			}
			unsafe = append(unsafe, Unsafe{Raw: r.Path, Reason: "path"})
			continue
		}
		if r.Size < 0 {
			unsafe = append(unsafe, Unsafe{Raw: r.Path, Reason: "path"})
			continue
		}
		segs := strings.Split(p.String(), "/")
		for i := 1; i < len(segs); i++ {
			add(Entry{Path: relpath.MustParse(strings.Join(segs[:i], "/")), Dir: true})
		}
		add(Entry{Path: p, Size: r.Size, Dir: r.Dir})
	}
	if len(unsafe) > 0 {
		return nil, unsafe
	}
	slices.SortFunc(out, func(a, b Entry) int { return strings.Compare(a.Path.Key(), b.Path.Key()) })
	return out, nil
}

// Totals returns the number of files and their total size.
func Totals(entries []Entry) (files int, size int64) {
	for _, e := range entries {
		if !e.Dir {
			files++
			size += e.Size
		}
	}
	return files, size
}

// Limits are the safety limits of core/02 §2.
type Limits struct {
	MaxEntries int
	MaxSize    int64
	// SuspiciousRatio is the extracted/compressed ratio above which the user
	// must confirm (zip bomb); 0 disables the check.
	SuspiciousRatio int64
}

// LimitError says which limit an archive exceeds.
type LimitError struct {
	Limit string // "entries" or "size"
	Value int64
	Max   int64
}

func (e *LimitError) Error() string {
	return fmt.Sprintf("installer: archive exceeds %s limit (%d > %d)", e.Limit, e.Value, e.Max)
}

// Check applies the hard limits. Suspicious reports whether the ratio needs
// the user's confirmation; compressed is the size of the archive file (0 for
// folders, which are never suspicious).
func (l Limits) Check(entries []Entry, compressed int64) (suspicious bool, err error) {
	_, size := Totals(entries)
	if l.MaxEntries > 0 && len(entries) > l.MaxEntries {
		return false, &LimitError{Limit: "entries", Value: int64(len(entries)), Max: int64(l.MaxEntries)}
	}
	if l.MaxSize > 0 && size > l.MaxSize {
		return false, &LimitError{Limit: "size", Value: size, Max: l.MaxSize}
	}
	return l.SuspiciousRatio > 0 && compressed > 0 && size/compressed > l.SuspiciousRatio, nil
}

// RootHints are the folders and extensions that mark the root of the
// default target layout (core/02 §4, declared by the adapter).
type RootHints struct {
	Dirs       []string
	Extensions []string
}

// Empty reports whether the adapter declared nothing to recognise.
func (h RootHints) Empty() bool { return len(h.Dirs) == 0 && len(h.Extensions) == 0 }

// Context is what an installer knows about the game (core/03 §2). F10 adds
// what FOMOD conditions need (active plugins, versions).
type Context struct {
	Definition game.Definition
	Hints      RootHints
}

// Options are the choices recorded in Installation.Options so a reinstall
// repeats them without asking (core/02 §4).
type Options map[string]string

// OptionRoot is the chosen root folder inside the archive; present with ""
// for the archive root ("install as is").
const OptionRoot = "root"

// Root returns the recorded root, if any.
func (o Options) Root() (string, bool) {
	r, ok := o[OptionRoot]
	return r, ok
}

// File is one file of the plan: the archive entry and where it lands,
// relative to the target of the mod type (it is also its path inside the
// mod's staging folder).
type File struct {
	Source relpath.Path
	Dest   relpath.Path
	Size   int64
}

// Plan is the pure result of an installer (core/03 §2).
type Plan struct {
	Installer string
	ModType   game.ModTypeID
	Files     []File
	Options   Options
	Warnings  []string
}

// Locations returns the plan destinations as locations of target.
func (p *Plan) Locations(target game.TargetID) []game.Location {
	out := make([]game.Location, len(p.Files))
	for i, f := range p.Files {
		out[i] = game.Location{Target: target, Path: f.Dest}
	}
	return out
}

// DecisionKind names what the user must decide.
type DecisionKind string

const (
	// DecisionRootAmbiguous: several folders could be the root.
	DecisionRootAmbiguous DecisionKind = "root_ambiguous"
	// DecisionRootUnrecognized: nothing looks like a mod for this game.
	DecisionRootUnrecognized DecisionKind = "root_unrecognized"
	// DecisionFomodPending: the archive has a FOMOD installer, which arrives
	// in F10; until then the user picks the folder (core/03 §7 fallback).
	DecisionFomodPending DecisionKind = "fomod_pending"
)

// Decision asks the user to choose the root (DLG-05).
type Decision struct {
	Kind DecisionKind
	// Candidates are the suggested roots ("" is the archive root).
	Candidates []string
	// Folders are every folder of the archive, for the tree.
	Folders []string
}

// Result is either a plan or a decision.
type Result struct {
	Plan     *Plan
	Decision *Decision
}

// Installer is the contract of core/03 §2.
type Installer interface {
	ID() string
	// Priority orders the stack: lower is asked first (core/03 §1).
	Priority() int
	// Supports reports whether this installer handles the archive and why.
	Supports(entries []Entry, ctx Context) (bool, string)
	Plan(entries []Entry, ctx Context, opts Options) (Result, error)
}

// Selection is the installer chosen for an archive and the reason.
type Selection struct {
	Installer Installer
	Reason    string
}

// Select asks every installer, lowest priority first (ties keep the given
// order), and returns the first that supports the archive. Forced picks an
// installer by id regardless of Supports (DLG-05 advanced).
func Select(installers []Installer, entries []Entry, ctx Context, forced string) (Selection, error) {
	sorted := slices.Clone(installers)
	slices.SortStableFunc(sorted, func(a, b Installer) int { return a.Priority() - b.Priority() })
	for _, in := range sorted {
		if forced != "" {
			if in.ID() == forced {
				return Selection{Installer: in, Reason: "forced"}, nil
			}
			continue
		}
		if ok, why := in.Supports(entries, ctx); ok {
			return Selection{Installer: in, Reason: why}, nil
		}
	}
	return Selection{}, fmt.Errorf("%w: no installer supports this archive", ErrUnsupported)
}

// Finish validates a plan: at least one file, no two files on the same
// destination (the later one wins, the FOMOD rule; INV-LIB-02), sorted by
// destination.
func Finish(p *Plan) (*Plan, error) {
	if len(p.Files) == 0 {
		return nil, ErrNoInstallableFiles
	}
	byKey := map[string]int{}
	var files []File
	for _, f := range p.Files {
		if i, dup := byKey[f.Dest.Key()]; dup {
			files[i] = f
			continue
		}
		byKey[f.Dest.Key()] = len(files)
		files = append(files, f)
	}
	slices.SortFunc(files, func(a, b File) int { return strings.Compare(a.Dest.Key(), b.Dest.Key()) })
	out := *p
	out.Files = files
	out.Options = maps.Clone(p.Options)
	return &out, nil
}

// folders lists every folder path of entries.
func folders(entries []Entry) []string {
	var out []string
	for _, e := range entries {
		if e.Dir {
			out = append(out, e.Path.String())
		}
	}
	return out
}
