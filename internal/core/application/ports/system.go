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

// FileReader is the read-only part of the filesystem. Adapters and
// discovery receive only this, so they cannot write to a game folder
// (anti-pattern 24).
type FileReader interface {
	Stat(ctx context.Context, path string) (FileInfo, error)
	ReadDir(ctx context.Context, path string) ([]DirEntry, error)
	Open(ctx context.Context, path string) (io.ReadCloser, error)
}

// FileSystem is every disk access of the core (absolute paths, long-path
// aware, D039). Domain code never touches the disk (anti-pattern 23); the
// deploy engine is the only writer to game targets (anti-pattern 24).
type FileSystem interface {
	FileReader
	MkdirAll(ctx context.Context, path string) error
	// WriteFile writes data atomically (temp file + rename) into an
	// existing folder. It is used for the markers of folders the manager
	// owns, never for game files.
	WriteFile(ctx context.Context, path string, data []byte) error
	Hardlink(ctx context.Context, src, dst string) error
	Symlink(ctx context.Context, target, link string) error
	Copy(ctx context.Context, src, dst string) error
	// Rename moves within a volume, replacing dst atomically when allowed.
	Rename(ctx context.Context, src, dst string) error
	Remove(ctx context.Context, path string) error
	// RemoveEmptyDir removes path only if it is an empty directory
	// (INV-DEP-09); a non-empty directory is not an error.
	RemoveEmptyDir(ctx context.Context, path string) error
	// RemoveAll deletes a folder and everything below it. Callers must have
	// proven ownership first (marker of the instance); implementations
	// refuse drive roots.
	RemoveAll(ctx context.Context, path string) error
	// SameVolume works for paths that do not exist yet by using their
	// closest existing ancestor.
	SameVolume(ctx context.Context, a, b string) (bool, error)
	FreeSpace(ctx context.Context, path string) (int64, error)
}

// DriveLister lists the local fixed drives for the full game search.
type DriveLister interface {
	Drives(ctx context.Context) ([]string, error)
}

// VersionReader reads the version resource of an executable ("1.6.1170.0").
// It returns "" without error when the file has no version information.
type VersionReader interface {
	FileVersion(ctx context.Context, path string) (string, error)
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

// StoreInstall is a game installation found by a store scanner. AppID is the
// identifier of the game in that store (Steam app id, GOG game id, Epic app
// name) or, for the registry, the id of the hint that matched.
type StoreInstall struct {
	Store string // steam, gog, epic, registry
	AppID string
	Path  string
}

// RegistryHint is a registry value an adapter declares as the install path
// of a game (core/11 §3). ID identifies the hint in StoreInstall.AppID.
type RegistryHint struct {
	ID    string
	Key   string // "HKLM\SOFTWARE\..." (64-bit view of the machine hive)
	Value string
}

// StoreScanner discovers installations (core/11 §3). Scanning is read-only
// and returns every installation it finds; adapters pick theirs.
type StoreScanner interface {
	Scan(ctx context.Context, hints []RegistryHint) ([]StoreInstall, error)
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
// declares and answers; it never deploys and never writes (anti-pattern 24):
// it only receives a FileReader. Plugin and load order support are added as
// separate optional interfaces in F11.
type GameAdapter interface {
	Name() string
	Version() string
	Definitions() []game.Definition
	// InstanceDefinition is the effective definition of one instance: the
	// static one for fixed games, built from the instance targets for games
	// with Definition.CustomTargets. Capabilities are adapter + instance.
	InstanceDefinition(id game.ID, targets []game.Target) (game.Definition, error)
	// Markers are the files whose presence in a folder identify the game
	// (used by the full search and by ValidateRoot).
	Markers(id game.ID) []string
	RegistryHints(id game.ID) []RegistryHint
	// VersionFile is the executable, relative to the root, whose version
	// resource is the game version; "" when the game has none.
	VersionFile(id game.ID) string
	Detect(ctx context.Context, stores []StoreInstall, fs FileReader) ([]Candidate, error)
	// ValidateRoot returns a *game.RootError when root is not an installation.
	ValidateRoot(ctx context.Context, fs FileReader, id game.ID, root string) error
	// Targets resolves the targets of an installation; custom holds the
	// user-declared targets and is only used by CustomTargets games.
	Targets(id game.ID, root string, custom []game.TargetSpec) ([]game.Target, error)
	RootHints(id game.ID) RootHints
	ContentFlags(id game.ID, footprint []game.Location) []mod.ContentFlag
}

// AppState persists small application-level facts that are not settings of
// the catalog (core/13): the active instance and the hidden games.
type AppState interface {
	// Get returns ErrNotFound when the key was never set.
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key, value string) error
	Delete(ctx context.Context, key string) error
}

// DeploymentState answers whether an instance has anything deployed. Until
// the deploy engine (F7) owns the manifest repository this is the only
// question the games service asks about applied state.
type DeploymentState interface {
	Deployed(ctx context.Context, instance game.InstanceID) (bool, error)
}

// SystemLocale reports the operating system preference that derived setting
// defaults depend on (core/13: "idioma do SO se suportado").
type SystemLocale interface {
	// Language returns the user's UI language as a BCP 47 tag ("pt-BR"),
	// or "" when unknown.
	Language() string
}
