// Package mod models the library: the logical Mod and the result of
// installing it (Installation). Whether a mod is enabled is not library state;
// it belongs to each Profile (desired state).
package mod

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
)

// ID is the logical identity of a mod. It is never a filesystem path.
type ID string

// State is the library lifecycle of a mod.
type State string

const (
	StateImported   State = "imported"
	StateInstalling State = "installing"
	StateInstalled  State = "installed"
	// StateRemoved is terminal: the mod left the library.
	StateRemoved State = "removed"
)

// SourceKind tells where a mod came from. V1 only produces manual-file;
// providers (Nexus, Workshop...) add kinds later without changing the model.
type SourceKind string

const SourceManualFile SourceKind = "manual-file"

// Source is the origin of a mod. Ref is informative (e.g. the original
// archive name), never identity.
type Source struct {
	Kind SourceKind
	Ref  string
}

// Errors returned by mod transitions.
var (
	ErrInvalid           = errors.New("mod: invalid")
	ErrInvalidTransition = errors.New("mod: invalid state transition")
)

// Mod is a logical unit in the library of a game instance. Its staging
// folder name derives from ID, never from Name (INV-ID-03), so renaming never
// moves files.
type Mod struct {
	ID       ID
	Instance game.InstanceID
	// Name is the detected name (FOMOD info, archive name); Attributes.Name
	// overrides it for display when set.
	Name       string
	Source     Source
	Attributes Attributes
	Category   CategoryID
	// Type decides target and deployment methods (core/11 §2).
	Type game.ModTypeID
	// Archive references the source archive kept by the library, if any.
	Archive ArchiveID
	// VariantOf and VariantLabel link variants of the same mod (core/02 §6).
	VariantOf    ID
	VariantLabel string
	// Content is what the adapter detected in the footprint (plugins,
	// textures...). Calculated at install time and stored with the mod.
	Content []ContentFlag
	// Installation is the current valid installation. It stays set while a
	// reinstall runs, so a failed reinstall never leaves a half-installed mod.
	Installation InstallationID
	State        State
	CreatedAt    time.Time
	InstalledAt  time.Time
	UpdatedAt    time.Time
}

// Attributes are the user-editable metadata of a mod (core/02 §9). The user
// always wins over detected values.
type Attributes struct {
	Name        string
	Version     string
	Author      string
	Description string
	Notes       string
	Highlight   Highlight
	Tags        []string
}

// Highlight is the user's colour/icon mark. Colours come from a fixed
// semantic palette owned by the UI theme, never free values (ui/04 §2).
type Highlight struct {
	Color string
	Icon  string
}

// ContentFlag names a kind of content, declared by the adapter.
type ContentFlag string

// DisplayName is the name shown to the user.
func (m *Mod) DisplayName() string {
	if strings.TrimSpace(m.Attributes.Name) != "" {
		return m.Attributes.Name
	}
	return m.Name
}

// SetAttributes replaces the editable metadata.
func (m *Mod) SetAttributes(a Attributes, now time.Time) error {
	if m.State == StateRemoved {
		return m.invalid("edit")
	}
	a.Tags = slices.Clone(a.Tags)
	m.Attributes = a
	m.UpdatedAt = now
	return nil
}

// SetType changes the mod type. The caller validates it against the game
// definition; changing it changes destinations, so deployment is affected.
func (m *Mod) SetType(t game.ModTypeID, now time.Time) error {
	if t == "" {
		return fmt.Errorf("%w: empty mod type", ErrInvalid)
	}
	if m.State == StateRemoved {
		return m.invalid("change type of")
	}
	m.Type = t
	m.UpdatedAt = now
	return nil
}

// New registers an imported mod that is not installed yet.
func New(id ID, instance game.InstanceID, name string, source Source, now time.Time) (*Mod, error) {
	if id == "" || instance == "" {
		return nil, fmt.Errorf("%w: mod needs id and instance", ErrInvalid)
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("%w: mod needs a name", ErrInvalid)
	}
	if source.Kind == "" {
		return nil, fmt.Errorf("%w: mod needs a source kind", ErrInvalid)
	}
	return &Mod{ID: id, Instance: instance, Name: name, Source: source, Type: game.DefaultModType, State: StateImported, CreatedAt: now, UpdatedAt: now}, nil
}

// BeginInstall starts an install (from imported) or a reinstall (from
// installed).
func (m *Mod) BeginInstall(now time.Time) error {
	if m.State != StateImported && m.State != StateInstalled {
		return m.invalid("begin install")
	}
	m.State = StateInstalling
	m.UpdatedAt = now
	return nil
}

// CompleteInstall makes inst the current installation.
func (m *Mod) CompleteInstall(inst *Installation, now time.Time) error {
	if m.State != StateInstalling {
		return m.invalid("complete install")
	}
	if inst == nil || inst.Mod != m.ID || inst.Instance != m.Instance {
		return fmt.Errorf("%w: installation does not belong to mod %q", ErrInvalid, m.ID)
	}
	m.Installation = inst.ID
	m.State = StateInstalled
	m.InstalledAt = now
	m.UpdatedAt = now
	return nil
}

// AbortInstall ends a failed or cancelled install. The mod returns to the
// last consistent state: installed if a previous installation exists,
// imported otherwise. It is never considered partially installed.
func (m *Mod) AbortInstall(now time.Time) error {
	if m.State != StateInstalling {
		return m.invalid("abort install")
	}
	if m.Installation != "" {
		m.State = StateInstalled
	} else {
		m.State = StateImported
	}
	m.UpdatedAt = now
	return nil
}

// Remove takes the mod out of the library. An install in progress must be
// aborted first.
func (m *Mod) Remove(now time.Time) error {
	if m.State != StateImported && m.State != StateInstalled {
		return m.invalid("remove")
	}
	m.State = StateRemoved
	m.UpdatedAt = now
	return nil
}

func (m *Mod) invalid(action string) error {
	return fmt.Errorf("%w: cannot %s while %s", ErrInvalidTransition, action, m.State)
}

// SetCategory assigns a category ("" = none). The caller checks it exists
// in the instance tree.
func (m *Mod) SetCategory(c CategoryID, now time.Time) error {
	if m.State == StateRemoved {
		return m.invalid("categorize")
	}
	m.Category = c
	m.UpdatedAt = now
	return nil
}

// SetSource points the mod at another archive, as "replace" does for an
// update (core/02 §6); the next install uses it.
func (m *Mod) SetSource(a *Archive, now time.Time) error {
	if m.State == StateRemoved {
		return m.invalid("change source of")
	}
	if a == nil || a.Instance != m.Instance {
		return fmt.Errorf("%w: archive of another instance", ErrInvalid)
	}
	m.Archive = a.ID
	m.Source = Source{Kind: m.Source.Kind, Ref: a.OriginalName}
	m.UpdatedAt = now
	return nil
}

// MarkVariant links m to the mod it is a variant of, with its label.
func (m *Mod) MarkVariant(of ID, label string, now time.Time) error {
	if of == "" || of == m.ID || strings.TrimSpace(label) == "" {
		return fmt.Errorf("%w: variant needs another mod and a label", ErrInvalid)
	}
	m.VariantOf, m.VariantLabel = of, strings.TrimSpace(label)
	m.UpdatedAt = now
	return nil
}
