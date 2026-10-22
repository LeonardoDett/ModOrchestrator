package mod

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// InstallationID identifies one installation of a mod. A reinstall produces a
// new ID, which is how desired state notices that mod content changed.
type InstallationID string

// File is one installed file: where it lives inside the mod's staging folder
// and where it must be deployed.
type File struct {
	Source relpath.Path
	Dest   game.Location
	Size   int64
	// Hash is optional ("" when not computed).
	Hash string
}

// Installation is the resolved result of installing an archive into a game
// instance: the installer used, the options chosen and the files produced.
type Installation struct {
	ID        InstallationID
	Mod       ID
	Instance  game.InstanceID
	Installer string
	Options   map[string]string
	Files     []File
	CreatedAt time.Time
}

// NewInstallation validates an installer result. Every file must have a safe
// source and destination, and no two files may target the same location.
func NewInstallation(id InstallationID, mod ID, instance game.InstanceID, installer string, options map[string]string, files []File, now time.Time) (*Installation, error) {
	if id == "" || mod == "" || instance == "" {
		return nil, fmt.Errorf("%w: installation needs id, mod and instance", ErrInvalid)
	}
	if strings.TrimSpace(installer) == "" {
		return nil, fmt.Errorf("%w: installation needs the installer that produced it", ErrInvalid)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("%w: installation produced no files", ErrInvalid)
	}
	seen := make(map[string]struct{}, len(files))
	for _, f := range files {
		if f.Source.IsZero() {
			return nil, fmt.Errorf("%w: file without source", ErrInvalid)
		}
		if err := f.Dest.Validate(); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
		}
		if f.Size < 0 {
			return nil, fmt.Errorf("%w: negative size for %s", ErrInvalid, f.Dest)
		}
		if _, dup := seen[f.Dest.Key()]; dup {
			return nil, fmt.Errorf("%w: two files target %s", ErrInvalid, f.Dest)
		}
		seen[f.Dest.Key()] = struct{}{}
	}
	return &Installation{
		ID: id, Mod: mod, Instance: instance, Installer: installer,
		Options: maps.Clone(options), Files: slices.Clone(files), CreatedAt: now,
	}, nil
}

// Footprint returns the deployment locations this installation provides,
// ordered by identity.
func (i *Installation) Footprint() []game.Location {
	out := make([]game.Location, len(i.Files))
	for n, f := range i.Files {
		out[n] = f.Dest
	}
	slices.SortFunc(out, func(a, b game.Location) int { return strings.Compare(a.Key(), b.Key()) })
	return out
}

// FileAt returns the file deployed to loc, if any.
func (i *Installation) FileAt(loc game.Location) (File, bool) {
	for _, f := range i.Files {
		if f.Dest.Key() == loc.Key() {
			return f, true
		}
	}
	return File{}, false
}

// ContentFootprint is Footprint with the mod's own folder taken off the
// paths that start with it (D144): what the mod holds relative to its root,
// as content detection must see it whatever the layout of its type.
func (i *Installation) ContentFootprint() []game.Location {
	out := i.Footprint()
	for n := range out {
		out[n].Path = Unplace(i.Mod, out[n].Path)
	}
	return out
}

// Folder is the name of a mod's folder inside the target of a mod type
// with a folder per mod (D144): its id, like its staging folder
// (INV-ID-03), so neither a rename nor a reinstall moves it.
func Folder(id ID) string { return string(id) }

// Place returns where a file at p, relative to the root of mod id, is
// deployed with mod type t: straight into the target when the type merges,
// under the mod's folder when each mod has its own (D144).
func Place(t game.ModType, id ID, p relpath.Path) (game.Location, error) {
	if !t.PerMod() {
		return game.Location{Target: t.Target, Path: p}, nil
	}
	q, err := relpath.Parse(Folder(id) + "/" + p.String())
	if err != nil {
		return game.Location{}, fmt.Errorf("%w: folder of mod %q: %v", ErrInvalid, id, err)
	}
	return game.Location{Target: t.Target, Path: q}, nil
}

// Unplace is the inverse of Place for one path: p without the folder of
// mod id when it starts with it, p itself otherwise.
func Unplace(id ID, p relpath.Path) relpath.Path {
	prefix, s := Folder(id)+"/", p.String()
	if id == "" || len(s) <= len(prefix) || !strings.EqualFold(s[:len(prefix)], prefix) {
		return p
	}
	q, err := relpath.Parse(s[len(prefix):])
	if err != nil {
		return p
	}
	return q
}

// Relocate moves the files of mod id to the locations of mod type t: each
// keeps its path relative to the mod's root and gets the target and the
// layout of t (a change of mod type, core/02 §9).
func Relocate(t game.ModType, id ID, files []File) ([]File, error) {
	out := make([]File, len(files))
	for i, f := range files {
		loc, err := Place(t, id, Unplace(id, f.Dest.Path))
		if err != nil {
			return nil, err
		}
		f.Dest = loc
		out[i] = f
	}
	return out, nil
}
