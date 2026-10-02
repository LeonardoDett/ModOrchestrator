// Package game models the logical game (Definition), its capabilities and a
// concrete installation (Instance). Game-specific behaviour enters the core
// only through capabilities, never through checks on the game identity.
package game

import (
	"errors"
	"fmt"
	"path"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/relpath"
)

// ID identifies a game definition (logical game).
type ID string

// InstanceID identifies a concrete installation of a game.
type InstanceID string

// TargetID names a deployment target inside an instance (e.g. "data",
// "root"). Target names are declared by the adapter.
type TargetID string

// Capability is something an adapter declares the game supports. The set is
// open: extensions may register their own capabilities.
type Capability string

const (
	CapFilesystemTarget Capability = "filesystem_mod_target"
	CapModTypes         Capability = "multiple_mod_types"
	CapInstaller        Capability = "installer"
	CapPlugins          Capability = "plugins"
	CapLoadOrder        Capability = "load_order"
	CapSaveGames        Capability = "save_games"
	CapGameSettings     Capability = "game_settings"
	CapTools            Capability = "tools"
	CapLaunch           Capability = "launch"
	CapExternalChanges  Capability = "external_change_strategy"
)

// ErrInvalid is returned when a game entity violates its invariants.
var ErrInvalid = errors.New("game: invalid")

// Capabilities is an immutable set of capabilities.
type Capabilities struct{ set map[Capability]struct{} }

// NewCapabilities builds a set, ignoring duplicates.
func NewCapabilities(caps ...Capability) Capabilities {
	set := make(map[Capability]struct{}, len(caps))
	for _, c := range caps {
		set[c] = struct{}{}
	}
	return Capabilities{set: set}
}

// Has reports whether the capability is declared.
func (c Capabilities) Has(cap Capability) bool {
	_, ok := c.set[cap]
	return ok
}

// List returns the declared capabilities in a stable order.
func (c Capabilities) List() []Capability {
	out := make([]Capability, 0, len(c.set))
	for cap := range c.set {
		out = append(out, cap)
	}
	slices.Sort(out)
	return out
}

// ModTypeID names a mod type declared by the adapter (e.g. "default",
// "root"). A mod type decides the target and the allowed deployment methods
// of every file of a mod (core/11 §2).
type ModTypeID string

// DefaultModType is the mod type every adapter must declare.
const DefaultModType ModTypeID = "default"

// ModType is a mod type declared by the adapter.
type ModType struct {
	ID     ModTypeID
	Name   string
	Target TargetID
	// Methods restricts deployment methods; empty means every method.
	Methods []DeploymentMethod
	// Priority orders detection when several types match a footprint: the
	// highest wins. Detect is empty for types chosen only by the user.
	Priority int
	Detect   []DetectRule
}

// Allows reports whether files of this type may be deployed with m.
func (t ModType) Allows(m DeploymentMethod) bool {
	return len(t.Methods) == 0 || slices.Contains(t.Methods, m)
}

// Definition is the logical identity of a game and what it supports.
type Definition struct {
	ID           ID
	Name         string
	Capabilities Capabilities
	// Targets are the target ids every instance of the game has.
	Targets []TargetID
	// ModTypes always contains DefaultModType.
	ModTypes []ModType
	// CustomTargets means the user declares the targets of each instance
	// (generic adapter); Targets and ModTypes are then only a template and
	// the adapter builds the effective definition per instance.
	CustomTargets bool
	// ToolOutputs are folders where tools generate files (core/09 §3):
	// they are searched for unexpected files, with their subfolders, even
	// when they hold no managed file.
	ToolOutputs []Location
	// UnmanagedHints are patterns of generated files suggested as "leave
	// unmanaged" (core/12 §9).
	UnmanagedHints []FilePattern
}

// FilePattern matches the locations of one target whose path (case
// insensitive, "/" separators) matches Glob as in path.Match.
type FilePattern struct {
	Target TargetID
	Glob   string
}

// Matches reports whether loc matches the pattern.
func (p FilePattern) Matches(loc Location) bool {
	if loc.Target != p.Target {
		return false
	}
	ok, err := path.Match(strings.ToLower(p.Glob), loc.Path.Key())
	return err == nil && ok
}

// HintsUnmanaged reports whether a generated file at loc is suggested as
// "leave unmanaged".
func (d Definition) HintsUnmanaged(loc Location) bool {
	return slices.ContainsFunc(d.UnmanagedHints, func(p FilePattern) bool { return p.Matches(loc) })
}

// Validate checks mod types against targets. NewDefinition only builds the
// identity; adapters complete Targets and ModTypes and call Validate.
func (d Definition) Validate() error {
	if d.ID == "" || strings.TrimSpace(d.Name) == "" {
		return fmt.Errorf("%w: definition needs id and name", ErrInvalid)
	}
	if len(d.Targets) == 0 {
		return fmt.Errorf("%w: %s declares no target", ErrInvalid, d.ID)
	}
	seen := map[ModTypeID]struct{}{}
	for _, t := range d.ModTypes {
		if t.ID == "" || !slices.Contains(d.Targets, t.Target) {
			return fmt.Errorf("%w: mod type %q needs an id and a declared target", ErrInvalid, t.ID)
		}
		for _, m := range t.Methods {
			if !m.Valid() {
				return fmt.Errorf("%w: mod type %q allows unknown method %q", ErrInvalid, t.ID, m)
			}
		}
		if _, dup := seen[t.ID]; dup {
			return fmt.Errorf("%w: mod type %q declared twice", ErrInvalid, t.ID)
		}
		seen[t.ID] = struct{}{}
	}
	if _, ok := seen[DefaultModType]; !ok {
		return fmt.Errorf("%w: %s must declare the %q mod type", ErrInvalid, d.ID, DefaultModType)
	}
	return nil
}

// ModType returns the declared mod type.
func (d Definition) ModType(id ModTypeID) (ModType, bool) {
	i := slices.IndexFunc(d.ModTypes, func(t ModType) bool { return t.ID == id })
	if i < 0 {
		return ModType{}, false
	}
	return d.ModTypes[i], true
}

// NewDefinition validates and builds a definition.
func NewDefinition(id ID, name string, caps ...Capability) (Definition, error) {
	if id == "" || strings.TrimSpace(name) == "" {
		return Definition{}, fmt.Errorf("%w: definition needs id and name", ErrInvalid)
	}
	for _, c := range caps {
		if c == "" {
			return Definition{}, fmt.Errorf("%w: empty capability", ErrInvalid)
		}
	}
	return Definition{ID: id, Name: name, Capabilities: NewCapabilities(caps...)}, nil
}

// DeploymentMethod is how a staged file is materialized in a target.
type DeploymentMethod string

const (
	MethodHardlink DeploymentMethod = "hardlink"
	MethodSymlink  DeploymentMethod = "symlink"
	// MethodCopy is an explicit fallback, never an implicit default.
	MethodCopy DeploymentMethod = "copy"
)

// Valid reports whether m is a known method.
func (m DeploymentMethod) Valid() bool {
	switch m {
	case MethodHardlink, MethodSymlink, MethodCopy:
		return true
	}
	return false
}

// Target is a deployment destination of an instance. Path is a location on
// disk, never an identity: entities refer to targets by TargetID.
type Target struct {
	ID   TargetID
	Path string
}

// Instance is a concrete installation: game root, deployment targets, the
// folders the manager owns (staging, archive store, backup store), preferred
// deployment method and the adapter serving it. The active profile is kept
// by the profile repository (ports.Profiles.Active), not here, so this
// package stays below profile.
type Instance struct {
	ID      InstanceID
	Game    ID
	Adapter string
	// DisplayName distinguishes several instances of the same game.
	DisplayName string
	Root        string
	Staging     string
	// ArchiveStore keeps imported archives (D032).
	ArchiveStore string
	// BackupStore keeps original files replaced by deploy (D034).
	BackupStore     string
	Hidden          bool
	Targets         []Target
	PreferredMethod DeploymentMethod
	// Store is where the installation was found (steam, gog, epic,
	// registry) or "manual"; informative only.
	Store string
	// AdapterVersion is the adapter version that created the instance, kept
	// for migrations (core/11 §1).
	AdapterVersion string
	// Executable is the optional game executable relative to Root (generic
	// games; adapters that know their executable declare it themselves).
	Executable string
}

// Validate checks the structural invariants of an instance. Filesystem checks
// (existence, volumes, markers) belong to the games service; here only the
// textual placement of the folders is checked (INV-LIB-03): the staging is
// never the game folder nor inside/around a target, and the three folders the
// manager owns neither overlap each other nor the game.
func (i Instance) Validate() error {
	if i.ID == "" || i.Game == "" || i.Adapter == "" {
		return fmt.Errorf("%w: instance needs id, game and adapter", ErrInvalid)
	}
	if i.Root == "" || i.Staging == "" || i.ArchiveStore == "" || i.BackupStore == "" {
		return fmt.Errorf("%w: instance needs root, staging, archive store and backup store", ErrInvalid)
	}
	if SamePath(i.Staging, i.Root) {
		return fmt.Errorf("%w: staging cannot be the game folder (INV-LIB-03)", ErrInvalid)
	}
	if !i.PreferredMethod.Valid() {
		return fmt.Errorf("%w: unknown deployment method %q", ErrInvalid, i.PreferredMethod)
	}
	if len(i.Targets) == 0 {
		return fmt.Errorf("%w: instance needs at least one target", ErrInvalid)
	}
	seen := make(map[TargetID]struct{}, len(i.Targets))
	for _, t := range i.Targets {
		if t.ID == "" || t.Path == "" {
			return fmt.Errorf("%w: target needs id and path", ErrInvalid)
		}
		if _, dup := seen[t.ID]; dup {
			return fmt.Errorf("%w: duplicated target %q", ErrInvalid, t.ID)
		}
		if Overlaps(i.Staging, t.Path) {
			return fmt.Errorf("%w: staging cannot contain or be inside target %q (INV-LIB-03)", ErrInvalid, t.ID)
		}
		seen[t.ID] = struct{}{}
	}
	owned := []struct{ name, path string }{{"staging", i.Staging}, {"archive store", i.ArchiveStore}, {"backup store", i.BackupStore}}
	for a := range owned {
		if Overlaps(owned[a].path, i.Root) {
			return fmt.Errorf("%w: %s cannot contain or be inside the game folder", ErrInvalid, owned[a].name)
		}
		for _, t := range i.Targets {
			if Overlaps(owned[a].path, t.Path) {
				return fmt.Errorf("%w: %s cannot contain or be inside target %q", ErrInvalid, owned[a].name, t.ID)
			}
		}
		for b := a + 1; b < len(owned); b++ {
			if Overlaps(owned[a].path, owned[b].path) {
				return fmt.Errorf("%w: %s and %s cannot overlap", ErrInvalid, owned[a].name, owned[b].name)
			}
		}
	}
	return nil
}

// HasTarget reports whether the instance declares the target.
func (i Instance) HasTarget(id TargetID) bool {
	return slices.ContainsFunc(i.Targets, func(t Target) bool { return t.ID == id })
}

// Location is a file address inside a deployment target. It is the unit of
// footprints, conflicts, manifests and external changes.
type Location struct {
	Target TargetID
	Path   relpath.Path
}

// Validate checks that both parts are set.
func (l Location) Validate() error {
	if l.Target == "" || l.Path.IsZero() {
		return fmt.Errorf("%w: location needs target and path", ErrInvalid)
	}
	return nil
}

// Key is the identity of the location (case-insensitive path).
func (l Location) Key() string { return string(l.Target) + "|" + l.Path.Key() }

// String renders the location for evidence and logs.
func (l Location) String() string { return string(l.Target) + ":" + l.Path.String() }
