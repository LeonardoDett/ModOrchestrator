package game

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"regexp"
	"strings"

	"modorchestrator/internal/core/domain/relpath"
)

// ManifestSchema is the version of the game manifest format this build
// reads and writes (D116).
const ManifestSchema = 1

// manifestMaxBytes bounds a manifest file: it is a description, not data.
const manifestMaxBytes = 256 << 10

// ErrManifestSchema is returned for a manifest of a format this build does
// not know. It is never read by halves.
var ErrManifestSchema = errors.New("game: unknown manifest schema")

// Manifest is a game described by data only (D116): how it is found, where
// its mods go and how it starts. It carries no code and no absolute path.
// Declared games and the games a user adds share this one format; what the
// app offers for the game is derived from it, never read from the file.
type Manifest struct {
	Schema  int    `json:"schema"`
	ID      ID     `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`

	Discovery ManifestDiscovery `json:"discovery"`
	Layout    ManifestLayout    `json:"layout"`
	Launch    []ManifestLaunch  `json:"launch,omitempty"`
}

// ManifestDiscovery is Discovery plus the process names of the running game.
type ManifestDiscovery struct {
	Stores      []ManifestStore    `json:"stores,omitempty"`
	Registry    []ManifestRegistry `json:"registry,omitempty"`
	Markers     []string           `json:"markers,omitempty"`
	VersionFile string             `json:"versionFile,omitempty"`
	Processes   []string           `json:"processes,omitempty"`
}

type ManifestStore struct {
	Store string `json:"store"`
	AppID string `json:"appId"`
}

type ManifestRegistry struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Value string `json:"value,omitempty"`
}

// ManifestLayout says where mods go. The first target is the default one.
type ManifestLayout struct {
	Targets        []ManifestTarget   `json:"targets"`
	ModTypes       []ManifestModType  `json:"modTypes,omitempty"`
	RootHints      ManifestRootHints  `json:"rootHints"`
	ToolOutputs    []ManifestLocation `json:"toolOutputs,omitempty"`
	UnmanagedHints []ManifestPattern  `json:"unmanagedHints,omitempty"`
}

// ManifestTarget is a folder relative to the game root ("" is the root).
// Creatable marks a folder the app may create when it does not exist yet
// (D118); the root itself never is.
type ManifestTarget struct {
	ID        TargetID `json:"id"`
	Path      string   `json:"path"`
	Creatable bool     `json:"creatable,omitempty"`
}

type ManifestModType struct {
	ID       ModTypeID          `json:"id"`
	Name     string             `json:"name"`
	Target   TargetID           `json:"target"`
	Methods  []DeploymentMethod `json:"methods,omitempty"`
	Priority int                `json:"priority,omitempty"`
	Detect   []ManifestDetect   `json:"detect,omitempty"`
}

type ManifestDetect struct {
	All []string `json:"all"`
}

type ManifestRootHints struct {
	Dirs       []string `json:"dirs,omitempty"`
	Extensions []string `json:"extensions,omitempty"`
}

type ManifestLocation struct {
	Target TargetID `json:"target"`
	Path   string   `json:"path"`
}

type ManifestPattern struct {
	Target TargetID `json:"target"`
	Glob   string   `json:"glob"`
}

// ManifestLaunch is one way to start the game; Exe and WorkDir are relative
// to the game root.
type ManifestLaunch struct {
	ID      string   `json:"id"`
	Exe     string   `json:"exe"`
	Args    []string `json:"args,omitempty"`
	WorkDir string   `json:"workDir,omitempty"`
	Default bool     `json:"default,omitempty"`
}

var manifestIDPattern = regexp.MustCompile(`^[a-z][a-z0-9]*([._-][a-z0-9]+)*$`)

// ParseManifest reads a manifest. A file of another schema, with a field
// this build does not know, or that fails Validate is refused whole.
func ParseManifest(data []byte) (Manifest, error) {
	if len(data) > manifestMaxBytes {
		return Manifest{}, fmt.Errorf("%w: manifest larger than %d bytes", ErrInvalid, manifestMaxBytes)
	}
	var probe struct {
		Schema int `json:"schema"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return Manifest{}, fmt.Errorf("%w: manifest is not valid JSON: %v", ErrInvalid, err)
	}
	if probe.Schema != ManifestSchema {
		return Manifest{}, fmt.Errorf("%w: %d (this version reads %d)", ErrManifestSchema, probe.Schema, ManifestSchema)
	}
	var m Manifest
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&m); err != nil {
		return Manifest{}, fmt.Errorf("%w: manifest: %v", ErrInvalid, err)
	}
	if dec.More() {
		return Manifest{}, fmt.Errorf("%w: manifest has content after the document", ErrInvalid)
	}
	if err := m.Validate(); err != nil {
		return Manifest{}, err
	}
	return m, nil
}

// Marshal writes the manifest as indented JSON, the form exported to a file.
func (m Manifest) Marshal() ([]byte, error) {
	if err := m.Validate(); err != nil {
		return nil, err
	}
	return json.MarshalIndent(m, "", "  ")
}

// Validate checks everything a manifest promises: a known schema, relative
// paths only, and a definition that holds together.
func (m Manifest) Validate() error {
	if m.Schema != ManifestSchema {
		return fmt.Errorf("%w: %d (this version reads %d)", ErrManifestSchema, m.Schema, ManifestSchema)
	}
	if len(m.ID) > 64 || !manifestIDPattern.MatchString(string(m.ID)) {
		return fmt.Errorf("%w: manifest id %q must be lower-case letters and digits separated by . _ or -", ErrInvalid, m.ID)
	}
	if strings.TrimSpace(m.Name) == "" || len(m.Name) > 120 {
		return fmt.Errorf("%w: manifest %s needs a name of at most 120 characters", ErrInvalid, m.ID)
	}
	if _, err := ResolveCustomTargets(`C:\game`, m.TargetSpecs()); err != nil {
		return fmt.Errorf("manifest %s: %w", m.ID, err)
	}
	for _, f := range m.Discovery.Processes {
		if f == "" || strings.ContainsAny(f, `/\:`) {
			return fmt.Errorf("%w: manifest %s: process %q must be a file name", ErrInvalid, m.ID, f)
		}
	}
	for _, t := range m.Layout.ModTypes {
		if strings.TrimSpace(t.Name) == "" {
			return fmt.Errorf("%w: manifest %s: mod type %q needs a name", ErrInvalid, m.ID, t.ID)
		}
		for _, r := range t.Detect {
			if len(r.All) == 0 {
				return fmt.Errorf("%w: manifest %s: mod type %q has an empty detection rule", ErrInvalid, m.ID, t.ID)
			}
			for _, e := range r.All {
				if err := relative(strings.TrimSuffix(e, "/")); err != nil {
					return fmt.Errorf("manifest %s: mod type %q: %w", m.ID, t.ID, err)
				}
			}
		}
	}
	for _, d := range m.Layout.RootHints.Dirs {
		if d == "" || strings.ContainsAny(d, `/\:`) {
			return fmt.Errorf("%w: manifest %s: root hint %q must be a folder name", ErrInvalid, m.ID, d)
		}
	}
	for _, e := range m.Layout.RootHints.Extensions {
		if len(e) < 2 || e[0] != '.' || strings.ContainsAny(e, `/\:*?`) {
			return fmt.Errorf("%w: manifest %s: root hint %q must be an extension like .pak", ErrInvalid, m.ID, e)
		}
	}
	known := map[TargetID]bool{}
	for _, t := range m.Layout.Targets {
		known[t.ID] = true
	}
	for _, o := range m.Layout.ToolOutputs {
		if !known[o.Target] {
			return fmt.Errorf("%w: manifest %s: tool output in unknown target %q", ErrInvalid, m.ID, o.Target)
		}
		if err := relative(o.Path); err != nil {
			return fmt.Errorf("manifest %s: tool output: %w", m.ID, err)
		}
	}
	for _, p := range m.Layout.UnmanagedHints {
		if !known[p.Target] {
			return fmt.Errorf("%w: manifest %s: pattern in unknown target %q", ErrInvalid, m.ID, p.Target)
		}
		if _, err := path.Match(p.Glob, ""); err != nil || p.Glob == "" || strings.ContainsAny(p.Glob, `\:`) || strings.Contains(p.Glob, "..") {
			return fmt.Errorf("%w: manifest %s: invalid pattern %q", ErrInvalid, m.ID, p.Glob)
		}
	}
	defaults, ids := 0, map[string]bool{}
	for _, l := range m.Launch {
		if l.ID == "" || ids[l.ID] {
			return fmt.Errorf("%w: manifest %s: launch options need distinct ids", ErrInvalid, m.ID)
		}
		ids[l.ID] = true
		if err := relative(l.Exe); err != nil {
			return fmt.Errorf("manifest %s: launch %q: %w", m.ID, l.ID, err)
		}
		if l.WorkDir != "" {
			if err := relative(l.WorkDir); err != nil {
				return fmt.Errorf("manifest %s: launch %q: %w", m.ID, l.ID, err)
			}
		}
		if l.Default {
			defaults++
		}
	}
	if len(m.Launch) > 0 && defaults != 1 {
		return fmt.Errorf("%w: manifest %s: exactly one launch option is the default", ErrInvalid, m.ID)
	}
	_, err := m.definition(SupportDeclared)
	return err
}

func relative(p string) error {
	if _, err := relpath.Parse(p); err != nil {
		return fmt.Errorf("%w: %q must be a path inside the game folder: %v", ErrInvalid, p, err)
	}
	return nil
}

// TargetSpecs returns the targets as declared, relative to the game root.
func (m Manifest) TargetSpecs() []TargetSpec {
	out := make([]TargetSpec, 0, len(m.Layout.Targets))
	for _, t := range m.Layout.Targets {
		out = append(out, TargetSpec{ID: t.ID, Path: t.Path})
	}
	return out
}

// Definition builds the game definition the manifest describes. support
// says where the manifest came from (declared with the app, or written by
// the user); a file never decides that by itself. The capabilities are
// derived: a manifest cannot claim a process that needs code.
func (m Manifest) Definition(support Support) (Definition, error) {
	if err := m.Validate(); err != nil {
		return Definition{}, err
	}
	return m.definition(support)
}

func (m Manifest) definition(support Support) (Definition, error) {
	d := Definition{ID: m.ID, Name: strings.TrimSpace(m.Name), Support: support}
	for _, t := range m.Layout.Targets {
		d.Targets = append(d.Targets, t.ID)
		if t.Creatable {
			if strings.TrimSpace(t.Path) == "" {
				return Definition{}, fmt.Errorf("%w: manifest %s: the game folder itself cannot be creatable", ErrInvalid, m.ID)
			}
			d.CreatableTargets = append(d.CreatableTargets, t.ID)
		}
	}
	if len(d.Targets) == 0 {
		return Definition{}, fmt.Errorf("%w: manifest %s declares no target", ErrInvalid, m.ID)
	}
	hasDefault := false
	for _, t := range m.Layout.ModTypes {
		mt := ModType{ID: t.ID, Name: t.Name, Target: t.Target, Methods: t.Methods, Priority: t.Priority}
		for _, r := range t.Detect {
			mt.Detect = append(mt.Detect, DetectRule{All: r.All})
		}
		hasDefault = hasDefault || t.ID == DefaultModType
		d.ModTypes = append(d.ModTypes, mt)
	}
	if !hasDefault {
		// The default type serves the first target, as in a game the user
		// declares by hand.
		d.ModTypes = append([]ModType{{ID: DefaultModType, Name: "Default", Target: d.Targets[0]}}, d.ModTypes...)
	}
	for _, s := range m.Discovery.Stores {
		d.Discovery.Stores = append(d.Discovery.Stores, StoreRef{Store: s.Store, AppID: s.AppID})
	}
	for _, h := range m.Discovery.Registry {
		d.Discovery.Registry = append(d.Discovery.Registry, RegistryHint{ID: h.ID, Key: h.Key, Value: h.Value})
	}
	d.Discovery.Markers = m.Discovery.Markers
	d.Discovery.VersionFile = m.Discovery.VersionFile
	for _, o := range m.Layout.ToolOutputs {
		p, err := relpath.Parse(o.Path)
		if err != nil {
			return Definition{}, fmt.Errorf("%w: manifest %s: tool output %q: %v", ErrInvalid, m.ID, o.Path, err)
		}
		d.ToolOutputs = append(d.ToolOutputs, Location{Target: o.Target, Path: p})
	}
	for _, p := range m.Layout.UnmanagedHints {
		d.UnmanagedHints = append(d.UnmanagedHints, FilePattern{Target: p.Target, Glob: p.Glob})
	}
	caps := []Capability{CapFilesystemTarget, CapInstaller}
	if len(d.ModTypes) > 1 {
		caps = append(caps, CapModTypes)
	}
	if len(m.Launch) > 0 {
		caps = append(caps, CapLaunch)
	}
	if len(m.Discovery.Processes) > 0 {
		caps = append(caps, CapRunningDetection)
	}
	if len(d.ToolOutputs) > 0 || len(d.UnmanagedHints) > 0 {
		caps = append(caps, CapExternalChanges)
	}
	d.Capabilities = NewCapabilities(caps...)
	if err := d.Validate(); err != nil {
		return Definition{}, fmt.Errorf("manifest %s: %w", m.ID, err)
	}
	return d, nil
}
