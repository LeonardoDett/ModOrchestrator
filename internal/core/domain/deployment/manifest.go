// Package deployment models what the manager actually applied to a game
// instance (core/04). State category: applied. The manifest is the only
// evidence that the manager owns a deployed file; anything not in it is
// unmanaged and protected (INV-DEP-01/02). The journal records a plan being
// executed so an interrupted deploy is recovered by reconciliation (D035).
package deployment

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/relpath"
)

// ErrInvalid is returned when applied state violates its invariants.
var ErrInvalid = errors.New("deployment: invalid")

// ProfileID mirrors profile.ID without importing the desired-state package
// (applied state never depends on desired state packages).
type ProfileID string

// Fingerprint is a content hash of a desired state (package deployplan).
type Fingerprint string

// EntryKind is what the manager placed at a location.
type EntryKind string

const (
	// KindLink is a mod file materialised by hardlink, symlink or copy.
	KindLink EntryKind = "link"
	// KindBackup is an unmanaged original moved to the BackupStore (D034).
	KindBackup EntryKind = "backup"
	// KindDir is a folder the manager created (removed only when empty,
	// INV-DEP-09).
	KindDir EntryKind = "dir"
)

// Evidence is what proves an observed file is the one the manager placed.
type Evidence struct {
	// FileID is volume serial + file index (hardlink identity).
	FileID string
	// LinkTarget is the symlink target.
	LinkTarget string
	Size       int64
	ModTime    time.Time
	// Hash is optional ("" when not computed).
	Hash string
}

// Matches reports whether observed evidence confirms the recorded one for
// the given method (core/04 §3).
func (e Evidence) Matches(observed Evidence, method game.DeploymentMethod) bool {
	switch method {
	case game.MethodHardlink:
		return e.FileID != "" && e.FileID == observed.FileID
	case game.MethodSymlink:
		return e.LinkTarget != "" && strings.EqualFold(e.LinkTarget, observed.LinkTarget)
	case game.MethodCopy:
		if e.Size != observed.Size || !e.ModTime.Equal(observed.ModTime) {
			return false
		}
		return e.Hash == "" || observed.Hash == "" || e.Hash == observed.Hash
	}
	return false
}

// SameOriginal reports whether observed is the unmanaged original recorded
// as e: a move inside a volume keeps the file identity, so the file id
// decides when both sides have one; otherwise size and time must match.
func (e Evidence) SameOriginal(observed Evidence) bool {
	if e.FileID != "" && observed.FileID != "" {
		return e.FileID == observed.FileID
	}
	return e.Size == observed.Size && e.ModTime.Equal(observed.ModTime)
}

// Entry is one thing the manager put in a target.
type Entry struct {
	Location game.Location
	Kind     EntryKind
	// Link entries: origin in the staging and how it was materialised.
	Mod          mod.ID
	Installation mod.InstallationID
	Source       relpath.Path
	Method       game.DeploymentMethod
	Evidence     Evidence
	// Backup entries: where the original lives inside the BackupStore.
	BackupPath relpath.Path
}

func (e Entry) validate() error {
	if err := e.Location.Validate(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	switch e.Kind {
	case KindLink:
		if e.Mod == "" || e.Installation == "" || e.Source.IsZero() || !e.Method.Valid() {
			return fmt.Errorf("%w: link %s needs mod, installation, source and method", ErrInvalid, e.Location)
		}
	case KindBackup:
		if e.BackupPath.IsZero() {
			return fmt.Errorf("%w: backup %s needs its path in the backup store", ErrInvalid, e.Location)
		}
	case KindDir:
	default:
		return fmt.Errorf("%w: unknown entry kind %q", ErrInvalid, e.Kind)
	}
	return nil
}

// EntryID identifies an entry: its kind and location, compared
// case-insensitively. A struct, not a joined string, so finding an entry
// builds nothing (F14: manifests of 500,000 entries).
type EntryID struct {
	Kind   EntryKind
	Target game.TargetID
	Path   string // relpath.Path.Key
}

// IDOf is the id of the entry of kind at loc.
func IDOf(kind EntryKind, loc game.Location) EntryID {
	return EntryID{Kind: kind, Target: loc.Target, Path: loc.Path.Key()}
}

// ID is the identity of the entry.
func (e Entry) ID() EntryID { return IDOf(e.Kind, e.Location) }

// Compare orders ids as a manifest orders its entries: by location, then
// kind.
func (a EntryID) Compare(b EntryID) int {
	if c := game.CompareKeyParts(a.Target, a.Path, b.Target, b.Path); c != 0 {
		return c
	}
	return strings.Compare(string(a.Kind), string(b.Kind))
}

// ByID returns the entry with the id.
func (m *Manifest) ByID(id EntryID) (Entry, bool) {
	i, ok := m.index[id]
	if !ok {
		return Entry{}, false
	}
	return m.entries[i], true
}

// Manifest is the applied state of a game instance: which profile and which
// desired fingerprint were applied, by which operation, and every entry
// placed. After a purge the manifest has no entries and no fingerprint.
type Manifest struct {
	Instance    game.InstanceID
	Profile     ProfileID
	Fingerprint Fingerprint
	Operation   operation.ID
	AppliedAt   time.Time
	entries     []Entry
	// index finds an entry by kind and location: Owns and Backup are asked
	// once per location of a plan (F14: linear search was quadratic).
	index map[EntryID]int
}

// NewManifest records a verified deploy (INV-DEP-05: only verified entries
// may be passed in).
func NewManifest(instance game.InstanceID, prof ProfileID, fp Fingerprint, op operation.ID, at time.Time, entries []Entry) (*Manifest, error) {
	if prof == "" || fp == "" {
		return nil, fmt.Errorf("%w: deploy manifest needs profile and fingerprint", ErrInvalid)
	}
	return build(instance, prof, fp, op, at, entries)
}

// NewPurged records that every managed entry was removed by op.
func NewPurged(instance game.InstanceID, op operation.ID, at time.Time) (*Manifest, error) {
	return build(instance, "", "", op, at, nil)
}

func build(instance game.InstanceID, prof ProfileID, fp Fingerprint, op operation.ID, at time.Time, entries []Entry) (*Manifest, error) {
	if instance == "" || op == "" {
		return nil, fmt.Errorf("%w: manifest needs instance and operation", ErrInvalid)
	}
	// Ids are compared field by field and the sort moves small records,
	// not entries: nothing is built per entry, which dominated loading and
	// saving a manifest of 500,000 entries (F14). Entries that come already
	// in order (a settled manifest) sort in about linear time.
	type keyed struct {
		id EntryID
		i  int
	}
	all := make([]keyed, len(entries))
	for i, e := range entries {
		if err := e.validate(); err != nil {
			return nil, err
		}
		all[i] = keyed{id: e.ID(), i: i}
	}
	slices.SortFunc(all, func(a, b keyed) int { return a.id.Compare(b.id) })
	sorted := make([]Entry, len(all))
	index := make(map[EntryID]int, len(all))
	for i, k := range all {
		if i > 0 && all[i-1].id == k.id {
			e := entries[k.i]
			return nil, fmt.Errorf("%w: %s %s recorded twice", ErrInvalid, e.Kind, e.Location)
		}
		sorted[i] = entries[k.i]
		index[k.id] = i
	}
	return &Manifest{Instance: instance, Profile: prof, Fingerprint: fp, Operation: op, AppliedAt: at, entries: sorted, index: index}, nil
}

// Purged reports whether this manifest records a complete purge.
func (m *Manifest) Purged() bool { return m.Fingerprint == "" }

// PartialPrefix marks the fingerprint of a manifest whose operation left
// locations untouched (external changes kept for triage, failures, skipped
// decisions): it never equals a desired fingerprint, so the status stays
// pending until a complete deploy (core/04 §5 "Falhas parciais").
const PartialPrefix = "partial:"

// Partial returns the fingerprint recorded after an incomplete operation.
func Partial(fp Fingerprint) Fingerprint { return PartialPrefix + fp }

// Header is the applied state without its entries, cheap enough for status
// queries.
type Header struct {
	Instance    game.InstanceID
	Profile     ProfileID
	Fingerprint Fingerprint
	Operation   operation.ID
	AppliedAt   time.Time
	Entries     int
}

// Purged reports whether the header records a complete purge.
func (h Header) Purged() bool { return h.Fingerprint == "" }

// Header returns the summary of the manifest.
func (m *Manifest) Header() Header {
	return Header{Instance: m.Instance, Profile: m.Profile, Fingerprint: m.Fingerprint, Operation: m.Operation, AppliedAt: m.AppliedAt, Entries: len(m.entries)}
}

// Links returns the link entries.
func (m *Manifest) Links() []Entry {
	return m.ofKind(KindLink)
}

// Backups returns the backup entries.
func (m *Manifest) Backups() []Entry {
	return m.ofKind(KindBackup)
}

// Targets returns the targets that hold at least one entry.
func (m *Manifest) Targets() []game.TargetID {
	var out []game.TargetID
	for _, e := range m.entries {
		if !slices.Contains(out, e.Location.Target) {
			out = append(out, e.Location.Target)
		}
	}
	slices.Sort(out)
	return out
}

// Entries returns every entry ordered by location.
func (m *Manifest) Entries() []Entry { return slices.Clone(m.entries) }

// View returns the entries ordered by location without copying them, for
// reading only: the manifest is immutable and a caller must not change the
// slice (F14: a copy of 500,000 entries per read).
func (m *Manifest) View() []Entry { return m.entries }

func (m *Manifest) ofKind(k EntryKind) []Entry {
	var out []Entry
	for _, e := range m.entries {
		if e.Kind == k {
			out = append(out, e)
		}
	}
	return out
}

// Owns returns the link entry at loc. A false result means the file at loc
// is not the manager's and must be protected.
func (m *Manifest) Owns(loc game.Location) (Entry, bool) { return m.find(KindLink, loc) }

// Backup returns the backup of the original that lived at loc.
func (m *Manifest) Backup(loc game.Location) (Entry, bool) { return m.find(KindBackup, loc) }

// Dirs returns the folders the manager created.
func (m *Manifest) Dirs() []Entry {
	return m.ofKind(KindDir)
}

func (m *Manifest) find(kind EntryKind, loc game.Location) (Entry, bool) {
	i, ok := m.index[IDOf(kind, loc)]
	if !ok {
		return Entry{}, false
	}
	return m.entries[i], true
}

// Observation is what a scan found at a location (observed state, D033).
type Observation struct {
	Exists bool
	// IsDir is set when the location is a folder.
	IsDir bool
	// Unreadable means the location could not be inspected (permission,
	// lock); it is never treated as absent.
	Unreadable bool
	Evidence   Evidence
}
