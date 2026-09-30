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
	"modorchestrator/internal/core/domain/plugin"
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

func (e Entry) key() string { return string(e.Kind) + "|" + e.Location.Key() }

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
	seen := make(map[string]struct{}, len(entries))
	for _, e := range entries {
		if err := e.validate(); err != nil {
			return nil, err
		}
		if _, dup := seen[e.key()]; dup {
			return nil, fmt.Errorf("%w: %s %s recorded twice", ErrInvalid, e.Kind, e.Location)
		}
		seen[e.key()] = struct{}{}
	}
	sorted := slices.Clone(entries)
	slices.SortFunc(sorted, func(a, b Entry) int {
		return strings.Compare(a.Location.Key()+"|"+string(a.Kind), b.Location.Key()+"|"+string(b.Kind))
	})
	return &Manifest{Instance: instance, Profile: prof, Fingerprint: fp, Operation: op, AppliedAt: at, entries: sorted}, nil
}

// Purged reports whether this manifest records a purge.
func (m *Manifest) Purged() bool { return m.Fingerprint == "" }

// Entries returns every entry ordered by location.
func (m *Manifest) Entries() []Entry { return slices.Clone(m.entries) }

// Owns returns the link entry at loc. A false result means the file at loc
// is not the manager's and must be protected.
func (m *Manifest) Owns(loc game.Location) (Entry, bool) { return m.find(KindLink, loc) }

// Backup returns the backup of the original that lived at loc.
func (m *Manifest) Backup(loc game.Location) (Entry, bool) { return m.find(KindBackup, loc) }

// Dirs returns the folders the manager created.
func (m *Manifest) Dirs() []Entry {
	return slices.DeleteFunc(m.Entries(), func(e Entry) bool { return e.Kind != KindDir })
}

func (m *Manifest) find(kind EntryKind, loc game.Location) (Entry, bool) {
	i := slices.IndexFunc(m.entries, func(e Entry) bool { return e.Kind == kind && e.Location.Key() == loc.Key() })
	if i < 0 {
		return Entry{}, false
	}
	return m.entries[i], true
}

// AppliedLoadOrder is what the adapter last wrote to the game's load order
// file (D040). FileHash is the evidence used to detect external edits.
type AppliedLoadOrder struct {
	Instance  game.InstanceID
	Profile   ProfileID
	Order     []plugin.Name
	Enabled   []plugin.Name
	FileHash  string
	Operation operation.ID
	AppliedAt time.Time
}

// Observation is what a scan found at a location (observed state, D033).
type Observation struct {
	Exists bool
	// Unreadable means the location could not be inspected (permission,
	// lock); it is never treated as absent.
	Unreadable bool
	Evidence   Evidence
}
