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
	// Capabilities of the optional adapter contracts that had no id before
	// D112: installers, health checks and categories of the adapter, and the
	// processes of a running game.
	CapAdapterInstallers Capability = "adapter_installers"
	CapHealthChecks      Capability = "health_checks"
	CapDefaultCategories Capability = "default_categories"
	CapRunningDetection  Capability = "running_detection"
)

// Catalog lists the capabilities the core knows, in a stable order. The set
// stays open: a definition may declare others.
func Catalog() []Capability {
	out := []Capability{
		CapFilesystemTarget, CapModTypes, CapInstaller, CapPlugins, CapLoadOrder, CapSaveGames,
		CapGameSettings, CapTools, CapLaunch, CapExternalChanges, CapAdapterInstallers,
		CapHealthChecks, CapDefaultCategories, CapRunningDetection,
	}
	slices.Sort(out)
	return out
}

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
	// Layout says where the files of a mod of this type go inside Target
	// (D144): merged with every other mod (the default) or each mod in a
	// folder of its own.
	Layout ModLayout
}

// ModLayout is how the mods of one type share their target (D144).
type ModLayout string

const (
	// LayoutMerge puts the files of every mod straight into the target, so
	// mods dispute the same locations. The zero value means merge.
	LayoutMerge ModLayout = "merge"
	// LayoutModFolder puts the files of each mod under a folder of its own
	// (<target>/<mod folder>/...), named after the mod's id: stable across
	// reinstalls and renames, like the staging folder (INV-ID-03).
	LayoutModFolder ModLayout = "mod_folder"
)

// Valid reports whether l is a known layout ("" is merge).
func (l ModLayout) Valid() bool {
	return l == "" || l == LayoutMerge || l == LayoutModFolder
}

// PerMod reports whether each mod of the type has a folder of its own.
func (t ModType) PerMod() bool { return t.Layout == LayoutModFolder }

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
	// Support is how the game is served; SupportLevel answers for
	// definitions that leave it empty.
	Support Support
	// Discovery is how installations of the game are found.
	Discovery Discovery
	// CustomTargets means the user declares the targets of each instance
	// (generic adapter); Targets and ModTypes are then only a template and
	// the adapter builds the effective definition per instance.
	CustomTargets bool
	// CreatableTargets are the targets the app may create when the folder
	// does not exist yet (D118): a folder the game only gets with its first
	// mod. A missing target that is not listed blocks the deploy.
	CreatableTargets []TargetID
	// ToolOutputs are folders where tools generate files (core/09 §3):
	// they are searched for unexpected files, with their subfolders, even
	// when they hold no managed file.
	ToolOutputs []Location
	// UnmanagedHints are patterns of generated files suggested as "leave
	// unmanaged" (core/12 §9).
	UnmanagedHints []FilePattern
	// Accent is the game's accent color (#RRGGBB) used inside its workspace
	// (D122). Empty: the app's own accent. Only a seed for the theme engine,
	// which still guarantees contrast; never a status.
	Accent string
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
	for _, t := range d.CreatableTargets {
		if !slices.Contains(d.Targets, t) {
			return fmt.Errorf("%w: %s: creatable target %q is not declared", ErrInvalid, d.ID, t)
		}
	}
	switch d.Support {
	case "", SupportFull, SupportDeclared, SupportCustom:
	default:
		return fmt.Errorf("%w: %s has unknown support level %q", ErrInvalid, d.ID, d.Support)
	}
	if err := d.Discovery.validate(); err != nil {
		return fmt.Errorf("%s: %w", d.ID, err)
	}
	for _, c := range d.Capabilities.List() {
		for _, r := range Describe(c).Requires {
			if !d.Capabilities.Has(r) {
				return fmt.Errorf("%w: %s declares %q without %q", ErrInvalid, d.ID, c, r)
			}
		}
	}
	seen := map[ModTypeID]struct{}{}
	for _, t := range d.ModTypes {
		if t.ID == "" || !slices.Contains(d.Targets, t.Target) {
			return fmt.Errorf("%w: mod type %q needs an id and a declared target", ErrInvalid, t.ID)
		}
		if !t.Layout.Valid() {
			return fmt.Errorf("%w: mod type %q has unknown layout %q", ErrInvalid, t.ID, t.Layout)
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

// SupportLevel is Support, or the level implied by the definition when the
// adapter did not say: custom when the user declares the targets.
func (d Definition) SupportLevel() Support {
	switch {
	case d.Support != "":
		return d.Support
	case d.CustomTargets:
		return SupportCustom
	}
	return SupportFull
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
	// Executable is the game executable relative to Root of an instance
	// from before D117 that still belongs to the template game. A user
	// game keeps it in its entry manifest (D136); adapters that know their
	// executable declare it themselves.
	Executable string
	// Features holds the optional features the user turned on or off for
	// this instance (D115). A feature not listed keeps its default: on.
	Features map[Capability]bool
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

// CompareKeys orders two locations as their Keys sort, without building
// them (F14: plans and manifests of 500,000 locations).
func (l Location) CompareKeys(o Location) int {
	return CompareKeyParts(l.Target, l.Path.Key(), o.Target, o.Path.Key())
}

// CompareKeyParts orders "ta|pa" against "tb|pb" without joining them.
func CompareKeyParts(ta TargetID, pa string, tb TargetID, pb string) int {
	if ta == tb {
		return strings.Compare(pa, pb)
	}
	at, bt := string(ta)+"|", string(tb)+"|"
	n := min(len(at), len(bt))
	if c := strings.Compare(at[:n], bt[:n]); c != 0 {
		return c
	}
	// One target and its "|" is a prefix of the other: the rest decides.
	if len(at) < len(bt) {
		return strings.Compare(pa, bt[n:]+pb)
	}
	return strings.Compare(at[n:]+pa, pb)
}

// CompareKey orders a location against a Key without building its own.
func (l Location) CompareKey(key string) int {
	t, p, _ := strings.Cut(key, "|")
	return CompareKeyParts(l.Target, l.Path.Key(), TargetID(t), p)
}

// String renders the location for evidence and logs.
func (l Location) String() string { return string(l.Target) + ":" + l.Path.String() }
