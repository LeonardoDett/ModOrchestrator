package mod

import (
	"fmt"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// ArchiveID identifies an imported archive.
type ArchiveID string

// ArchiveKind is the container format of an import (D048: folders too).
type ArchiveKind string

const (
	ArchiveZip    ArchiveKind = "zip"
	Archive7z     ArchiveKind = "7z"
	ArchiveRar    ArchiveKind = "rar"
	ArchiveFolder ArchiveKind = "folder"
)

// Archive is what the user imported. It is not a mod: installing it produces
// one (D009). Retained archives live in the instance ArchiveStore (D032).
type Archive struct {
	ID           ArchiveID
	Instance     game.InstanceID
	OriginalName string
	Kind         ArchiveKind
	Size         int64
	// Hash identifies the content for duplicate detection (core/02 §6).
	Hash string
	// Stored is the path inside the ArchiveStore; zero when not retained.
	Stored     relpath.Path
	ImportedAt time.Time
}

// NewArchive validates an imported archive.
func NewArchive(id ArchiveID, instance game.InstanceID, originalName string, kind ArchiveKind, size int64, hash string, stored relpath.Path, now time.Time) (*Archive, error) {
	if id == "" || instance == "" || strings.TrimSpace(originalName) == "" {
		return nil, fmt.Errorf("%w: archive needs id, instance and original name", ErrInvalid)
	}
	switch kind {
	case ArchiveZip, Archive7z, ArchiveRar, ArchiveFolder:
	default:
		return nil, fmt.Errorf("%w: unsupported archive kind %q", ErrInvalid, kind)
	}
	if size < 0 || hash == "" {
		return nil, fmt.Errorf("%w: archive needs a size and a content hash", ErrInvalid)
	}
	return &Archive{ID: id, Instance: instance, OriginalName: originalName, Kind: kind, Size: size, Hash: hash, Stored: stored, ImportedAt: now}, nil
}

// Retained reports whether the archive is kept, which reinstall requires.
func (a *Archive) Retained() bool { return !a.Stored.IsZero() }
