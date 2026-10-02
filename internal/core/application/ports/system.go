package ports

import (
	"context"
	"errors"
	"io"
	"time"

	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/ordering"
	"modorchestrator/internal/core/domain/plugin"
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
	// Created is the creation time when the platform reports one (zero
	// otherwise). A file moved into a folder keeps its modification time
	// but gets a new creation time there (core/09 §2 `unexpected`).
	Created time.Time
	FileID  string
}

// Failure kinds of filesystem writes. Implementations wrap the platform
// error with one of these so the deploy engine reports a stable code per
// location (core/04 §12) without knowing the platform.
var (
	ErrFileLocked  = errors.New("ports: file in use by another program")
	ErrDiskFull    = errors.New("ports: disk full")
	ErrPathTooLong = errors.New("ports: path too long")
	ErrPermission  = errors.New("ports: permission denied")
)

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
	// VolumeFormat names the filesystem of the volume holding path ("NTFS",
	// "FAT32"...), using its closest existing ancestor.
	VolumeFormat(ctx context.Context, path string) (string, error)
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

// Hasher computes content hashes (SHA-256, lowercase hex; D063).
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

// Archive formats the extractor reports (mod.ArchiveKind values).
const (
	FormatZip    = "zip"
	Format7z     = "7z"
	FormatRar    = "rar"
	FormatFolder = "folder"
)

// Extractor errors. Implementations wrap them so callers map them to the
// stable codes of core/02 §11.
var (
	ErrArchiveUnsupported = errors.New("ports: unsupported archive format")
	ErrArchiveCorrupt     = errors.New("ports: corrupt archive")
	ErrArchiveEncrypted   = errors.New("ports: encrypted archive")
	// ErrArchiveUnsafe means an entry would be written outside the
	// destination or is a link (INV-ID-04). The domain refuses these before
	// extracting; the extractor refuses them again (defence in depth).
	ErrArchiveUnsafe = errors.New("ports: unsafe archive entry")
	// ErrArchiveTooLarge means more bytes were produced than allowed.
	ErrArchiveTooLarge = errors.New("ports: archive larger than allowed")
)

// ExtractOptions bound an extraction.
type ExtractOptions struct {
	// MaxBytes stops the extraction as soon as more bytes are written (0 =
	// no limit); bytes are counted as written, never taken from headers.
	MaxBytes int64
	// Progress receives the bytes written so far.
	Progress func(written int64)
}

// Extractor lists and extracts archives and imported folders (D048, D062).
// Nothing is ever executed. Extract writes only under destDir, which must
// exist; every entry path is checked again before it is joined.
type Extractor interface {
	// Detect returns the format of path (by content, not by extension) or
	// ErrArchiveUnsupported.
	Detect(ctx context.Context, path string) (string, error)
	List(ctx context.Context, path string) ([]ArchiveEntry, error)
	Extract(ctx context.Context, path, destDir string, opts ExtractOptions) error
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
// it only receives a FileReader. Plugin and load order support are the
// optional interfaces PluginSupport and LoadOrderSupport (F11).
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

// InstallerProvider is implemented by adapters that register installers of
// their own (core/03 §6, e.g. a script extender runtime). They produce only
// plans (anti-pattern 24).
type InstallerProvider interface {
	Installers(id game.ID) []installer.Installer
}

// DefaultCategory is a category an adapter proposes for new instances.
// Parent refers to another Key of the same list.
type DefaultCategory struct {
	Key    string
	Name   string
	Parent string
}

// CategoryProvider is implemented by adapters that seed the category tree
// of a new instance (core/02 §10). No network call is involved.
type CategoryProvider interface {
	DefaultCategories(id game.ID) []DefaultCategory
}

// ProcessProbe tells which of the given executable names are running
// (core/11 §6, `game_running`). Names compare without case.
type ProcessProbe interface {
	Running(ctx context.Context, names []string) ([]string, error)
}

// ProcessDeclarer is implemented by adapters that know the processes of a
// running game (core/11 §1 `launch()`: "como detectar jogo em execução").
type ProcessDeclarer interface {
	Processes(id game.ID) []string
}

// ModContent is what an adapter health check knows about a mod of the
// active profile.
type ModContent struct {
	ID      mod.ID
	Name    string
	Type    game.ModTypeID
	Content []mod.ContentFlag
	Enabled bool
}

// HealthCheckProvider is implemented by adapters with checks of their own
// (core/11 §1 `healthChecks()`, core/12 §7). The adapter reads, never
// writes (anti-pattern 24), and returns diagnostics as codes and
// parameters; the core validates them (INV-OPS-06).
type HealthCheckProvider interface {
	HealthChecks(ctx context.Context, fs FileReader, inst game.Instance, mods []ModContent) ([]diagnostic.Spec, error)
}

// PluginSupport is implemented by adapters with the `plugins` capability
// (core/11 §1, core/08 §1). The adapter recognises plugins, reads their
// headers and declares the hard constraints, the indexes and the limits;
// the core owns the model, the ordering engine (D029) and the flow. No
// Bethesda rule lives outside the adapter (anti-pattern 3).
type PluginSupport interface {
	// PluginTarget is the target whose top-level files are plugins.
	PluginTarget(id game.ID) game.TargetID
	// IsPlugin reports whether a file name (no folder) is a plugin.
	IsPlugin(id game.ID, name string) bool
	// ReadHeader reads the header of a plugin file. It reads only what it
	// needs from r.
	ReadHeader(id game.ID, name string, r io.Reader) (plugin.Header, error)
	// Implicit lists the plugins the game always loads, in their fixed
	// order at the top, among those that exist (names is the inventory).
	Implicit(ctx context.Context, fs FileReader, inst game.Instance, names []plugin.Name) ([]plugin.Name, error)
	// Constraints returns the hard constraints between the plugins (items
	// are plugin keys, refs start with plugin.RefAdapterPrefix).
	Constraints(id game.ID, plugins []plugin.Plugin) []ordering.Edge
	// Indexes gives the displayed load index of every active plugin (by
	// key), in load order, and the usage of each limit.
	Indexes(id game.ID, active []plugin.Plugin) (map[string]string, []plugin.LimitUsage)
}

// PluginArchives is implemented by adapters whose archives load only with
// an active plugin of the same base name (core/12 §5–7, Skyrim BSA). Given
// every file name at the top of the plugin target and the active plugins,
// it returns the archives no active plugin loads (bsa_without_plugin).
type PluginArchives interface {
	OrphanArchives(id game.ID, files []string, active []plugin.Name) []string
}

// Known folders an adapter can place files in, resolved by the platform.
const FolderLocalAppData = "local_app_data"

// FileLocation is a file below a known folder of the user.
type FileLocation struct {
	Folder string
	Path   string
}

// KnownFolders resolves the folders of FileLocation.
type KnownFolders interface {
	Folder(name string) (string, error)
}

// LoadOrderSupport is implemented by adapters with the `load_order`
// capability (core/11 §1, D040): where the game reads its load order and
// how it is written. The adapter only serializes; the core writes the file
// with evidence (anti-pattern 24).
type LoadOrderSupport interface {
	LoadOrderFile(inst game.Instance) FileLocation
	// ManualOrder reports whether the user may reorder by hand.
	ManualOrder(id game.ID) bool
	// Serialize turns the full load order (implicit plugins included) into
	// the file content.
	Serialize(id game.ID, entries []plugin.Entry) ([]byte, error)
	// Parse reads the file content back.
	Parse(id game.ID, data []byte) ([]plugin.Entry, error)
}

// HeaderCache keeps plugin headers by a content key (core/14 §1: a
// discardable cache below <dataDir>/cache/).
type HeaderCache interface {
	Get(key string) (plugin.Header, bool)
	Put(key string, h plugin.Header)
	// Flush persists what changed; Clear empties the cache ("Reconstruir
	// cache de cabeçalhos de plugins", core/13).
	Flush() error
	Clear() error
}
