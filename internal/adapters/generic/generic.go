// Package generic is the adapter for games described by data: the games the
// user adds (a root folder and one or more targets) and any game described
// by a manifest (D031, D117, core/11 §4). It has no process of its own.
package generic

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// Name is the adapter id stored in every instance it serves.
const Name = "generic"

// GameID is the template the "add any game" assistant starts from. Managing
// it creates a user entry with an id of its own (D117).
const GameID game.ID = "generic"

// Version is bumped when the adapter changes how it builds instances:
// 2 serves manifests (D117).
const Version = "2"

// defaultTarget is the placeholder target of the template definition; real
// instances always come with user-declared targets.
const defaultTarget game.TargetID = "main"

// Adapter implements ports.GameAdapter and ports.EntryHost. The zero value
// serves only the template; New returns one that also holds manifests.
type Adapter struct{ entries *entries }

type entries struct {
	mu   sync.RWMutex
	byID map[game.ID]game.Manifest
}

var (
	_ ports.EntryHost       = Adapter{}
	_ ports.LaunchSupport   = Adapter{}
	_ ports.ProcessDeclarer = Adapter{}
)

// New returns an adapter that can hold manifests.
func New() Adapter { return Adapter{entries: &entries{byID: map[game.ID]game.Manifest{}}} }

func (Adapter) Name() string    { return Name }
func (Adapter) Version() string { return Version }

// SetEntries replaces the manifests the adapter serves. Every manifest must
// be valid and none may take the id of the template.
func (a Adapter) SetEntries(list []game.Manifest) error {
	if a.entries == nil {
		if len(list) == 0 {
			return nil
		}
		return errors.New("generic: this adapter holds no manifests (use generic.New)")
	}
	byID := make(map[game.ID]game.Manifest, len(list))
	for _, m := range list {
		if err := m.Validate(); err != nil {
			return err
		}
		if _, dup := byID[m.ID]; dup || m.ID == GameID {
			return fmt.Errorf("%w: manifest id %q is taken", game.ErrInvalid, m.ID)
		}
		byID[m.ID] = m
	}
	a.entries.mu.Lock()
	a.entries.byID = byID
	a.entries.mu.Unlock()
	return nil
}

func (a Adapter) manifest(id game.ID) (game.Manifest, bool) {
	if a.entries == nil {
		return game.Manifest{}, false
	}
	a.entries.mu.RLock()
	defer a.entries.mu.RUnlock()
	m, ok := a.entries.byID[id]
	return m, ok
}

func template() game.Definition {
	return game.Definition{
		ID:   GameID,
		Name: "Generic game",
		Capabilities: game.NewCapabilities(
			game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller,
		),
		Targets:       []game.TargetID{defaultTarget},
		ModTypes:      []game.ModType{{ID: game.DefaultModType, Name: "Default", Target: defaultTarget}},
		CustomTargets: true,
		Support:       game.SupportCustom,
	}
}

// Definitions returns the template definition (CustomTargets: it passes
// validation, but its target is replaced by the ones of each instance; it
// declares no discovery) followed by one definition per manifest, by id.
func (a Adapter) Definitions() []game.Definition {
	out := []game.Definition{template()}
	if a.entries == nil {
		return out
	}
	a.entries.mu.RLock()
	defer a.entries.mu.RUnlock()
	ids := make([]game.ID, 0, len(a.entries.byID))
	for id := range a.entries.byID {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		if d, err := a.entries.byID[id].Definition(game.SupportCustom); err == nil {
			out = append(out, d)
		}
	}
	return out
}

// InstanceDefinition is the definition of the manifest for a game described
// by one. For the template it declares one mod type per target: the first
// target is served by the default type, the others by a type named after
// the target.
func (a Adapter) InstanceDefinition(id game.ID, targets []game.Target) (game.Definition, error) {
	if m, ok := a.manifest(id); ok {
		return m.Definition(game.SupportCustom)
	}
	if id != GameID {
		return game.Definition{}, fmt.Errorf("%w: %s does not define %q", game.ErrInvalid, Name, id)
	}
	if len(targets) == 0 {
		return game.Definition{}, fmt.Errorf("%w: generic games need at least one target", game.ErrInvalid)
	}
	def := template()
	def.Targets = nil
	def.ModTypes = nil
	for i, t := range targets {
		def.Targets = append(def.Targets, t.ID)
		mt := game.ModType{ID: game.ModTypeID(t.ID), Name: string(t.ID), Target: t.ID}
		if i == 0 {
			mt = game.ModType{ID: game.DefaultModType, Name: "Default", Target: t.ID}
		}
		def.ModTypes = append(def.ModTypes, mt)
	}
	return def, def.Validate()
}

// ValidateRoot requires an existing folder and, for a manifest that names
// markers, each of them: without markers the adapter cannot know what the
// game looks like.
func (a Adapter) ValidateRoot(ctx context.Context, fs ports.FileReader, id game.ID, root string) error {
	info, err := fs.Stat(ctx, root)
	switch {
	case err != nil:
		return &game.RootError{Reason: game.RootUnreadable}
	case !info.Exists:
		return &game.RootError{Reason: game.RootNotFound}
	case !info.IsDir:
		return &game.RootError{Reason: game.RootNotDirectory}
	}
	m, _ := a.manifest(id)
	for _, marker := range m.Discovery.Markers {
		f, err := fs.Stat(ctx, game.JoinPath(root, marker))
		if err != nil {
			return &game.RootError{Reason: game.RootUnreadable}
		}
		if !f.Exists || f.IsDir {
			return &game.RootError{Reason: game.RootMarkerMissing, Marker: marker}
		}
	}
	return nil
}

// Targets resolves the targets of the manifest, or the ones the user
// declared for the template.
func (a Adapter) Targets(id game.ID, root string, custom []game.TargetSpec) ([]game.Target, error) {
	if m, ok := a.manifest(id); ok {
		custom = m.TargetSpecs()
	}
	targets, err := game.ResolveCustomTargets(root, custom)
	if err != nil {
		return nil, err
	}
	if slices.ContainsFunc(targets, func(t game.Target) bool { return t.Path == "" }) {
		return nil, errors.New("generic: empty target path")
	}
	return targets, nil
}

// RootHints come from the manifest; without them the basic installer falls
// back to the archive layout.
func (a Adapter) RootHints(id game.ID) ports.RootHints {
	m, _ := a.manifest(id)
	return ports.RootHints{Dirs: m.Layout.RootHints.Dirs, Extensions: m.Layout.RootHints.Extensions}
}

func (Adapter) ContentFlags(game.ID, []game.Location) []mod.ContentFlag { return nil }

// LaunchOptions are the ones the manifest declares.
func (a Adapter) LaunchOptions(_ context.Context, _ ports.FileReader, inst game.Instance) ([]ports.LaunchOption, error) {
	m, _ := a.manifest(inst.Game)
	out := make([]ports.LaunchOption, 0, len(m.Launch))
	for _, l := range m.Launch {
		out = append(out, ports.LaunchOption{ID: l.ID, Exe: l.Exe, Args: l.Args, WorkDir: l.WorkDir, Default: l.Default})
	}
	return out, nil
}

// Processes are the ones the manifest declares.
func (a Adapter) Processes(id game.ID) []string {
	m, _ := a.manifest(id)
	return m.Discovery.Processes
}

// Templates are the ready-made layouts offered when the user creates a
// game (D129, answer 8): a "Mods" folder in the game folder, and BepInEx,
// the loader most Unity games use for plugins.
func (Adapter) Templates() []ports.GameTemplate {
	return []ports.GameTemplate{
		{ID: "mods_folder", Targets: []game.TargetSpec{{ID: "mods", Path: "Mods"}}},
		{ID: "bepinex", Name: "BepInEx", Targets: []game.TargetSpec{{ID: "plugins", Path: "BepInEx/plugins"}, {ID: "config", Path: "BepInEx/config"}, {ID: "patchers", Path: "BepInEx/patchers"}}},
	}
}
