package ports

import (
	"context"
	"io"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// FileInfo is what the filesystem reports about a path. FileID (volume
// serial + file index) is the hardlink identity used as deploy evidence.
type FileInfo struct {
	Exists     bool
	IsDir      bool
	IsSymlink  bool
	LinkTarget string
	Size       int64
	ModTime    time.Time
	FileID     string
}

// DirEntry is one child of a directory.
type DirEntry struct {
	Name  string
	IsDir bool
}

// FileSystem is every disk access of the core (absolute paths, long-path
// aware, D039). Domain code never touches the disk (anti-pattern 23); the
// deploy engine is the only writer to game targets (anti-pattern 24).
type FileSystem interface {
	Stat(ctx context.Context, path string) (FileInfo, error)
	ReadDir(ctx context.Context, path string) ([]DirEntry, error)
	Open(ctx context.Context, path string) (io.ReadCloser, error)
	MkdirAll(ctx context.Context, path string) error
	Hardlink(ctx context.Context, src, dst string) error
	Symlink(ctx context.Context, target, link string) error
	Copy(ctx context.Context, src, dst string) error
	// Rename moves within a volume, replacing dst atomically when allowed.
	Rename(ctx context.Context, src, dst string) error
	Remove(ctx context.Context, path string) error
	// RemoveEmptyDir removes path only if it is an empty directory
	// (INV-DEP-09); a non-empty directory is not an error.
	RemoveEmptyDir(ctx context.Context, path string) error
	SameVolume(ctx context.Context, a, b string) (bool, error)
	FreeSpace(ctx context.Context, path string) (int64, error)
}

// Hasher computes content hashes (algorithm decided in F4, pendência P2).
type Hasher interface {
	Hash(ctx context.Context, r io.Reader) (string, error)
}

// ArchiveEntry is one entry of an archive, listed without extracting.
type ArchiveEntry struct {
	// Path is the raw path inside the archive; it is normalised and checked
	// by the domain (INV-ID-04) before anything is extracted.
	Path   string
	Size   int64
	IsDir  bool
	IsLink bool
}

// Extractor lists and extracts archives (implementation decided in F4,
// pendência P1). Extract writes only under destDir.
type Extractor interface {
	List(ctx context.Context, archivePath string) ([]ArchiveEntry, error)
	Extract(ctx context.Context, archivePath, destDir string) error
}

// StoreInstall is a game installation found by a store scanner.
type StoreInstall struct {
	Store string // steam, gog, epic, registry
	AppID string
	Path  string
}

// StoreScanner discovers installations (core/11 §3).
type StoreScanner interface {
	Scan(ctx context.Context) ([]StoreInstall, error)
}

// ProcessLauncher starts and watches the game (core/11 §6).
type ProcessLauncher interface {
	Launch(ctx context.Context, exe string, args []string, workDir string) error
	Running(ctx context.Context, exeName string) (bool, error)
}

// Candidate is an installation the adapter recognises; managing it is always
// a user decision.
type Candidate struct {
	Game    game.ID
	Root    string
	Store   string
	Version string
}

// RootHints tell the basic installer which folders and extensions indicate
// the root of the default target (core/02 §4).
type RootHints struct {
	Dirs       []string
	Extensions []string
}

// GameAdapter is the contract every adapter implements (core/11 §1). It
// declares and answers; it never deploys (anti-pattern 24). Plugin and load
// order support are added as separate optional interfaces in F11.
type GameAdapter interface {
	Name() string
	Version() string
	Definitions() []game.Definition
	Detect(ctx context.Context, stores []StoreInstall, fs FileSystem) ([]Candidate, error)
	ValidateRoot(ctx context.Context, fs FileSystem, id game.ID, root string) error
	Targets(id game.ID, root string) ([]game.Target, error)
	RootHints(id game.ID) RootHints
	ContentFlags(id game.ID, footprint []game.Location) []mod.ContentFlag
}
