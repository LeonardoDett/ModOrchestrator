// Package generic is the adapter for games the user defines: a root folder
// and one or more targets, no plugins (D031, core/11 §4).
package generic

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// Name is the adapter id stored in every instance it serves.
const Name = "generic"

// GameID is the only game the adapter defines.
const GameID game.ID = "generic"

// Version is bumped when the adapter changes how it builds instances.
const Version = "1"

// defaultTarget is the placeholder target of the template definition; real
// instances always come with user-declared targets.
const defaultTarget game.TargetID = "main"

// Adapter implements ports.GameAdapter.
type Adapter struct{}

var _ ports.GameAdapter = Adapter{}

func (Adapter) Name() string    { return Name }
func (Adapter) Version() string { return Version }

// Definitions returns the template definition (CustomTargets): it passes
// validation, but its target is replaced by the ones of each instance.
func (Adapter) Definitions() []game.Definition {
	return []game.Definition{{
		ID:   GameID,
		Name: "Generic game",
		Capabilities: game.NewCapabilities(
			game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller,
		),
		Targets:       []game.TargetID{defaultTarget},
		ModTypes:      []game.ModType{{ID: game.DefaultModType, Name: "Default", Target: defaultTarget}},
		CustomTargets: true,
	}}
}

// InstanceDefinition declares one mod type per target: the first target is
// served by the default type, the others by a type named after the target.
func (a Adapter) InstanceDefinition(id game.ID, targets []game.Target) (game.Definition, error) {
	if id != GameID {
		return game.Definition{}, fmt.Errorf("%w: %s does not define %q", game.ErrInvalid, Name, id)
	}
	if len(targets) == 0 {
		return game.Definition{}, fmt.Errorf("%w: generic games need at least one target", game.ErrInvalid)
	}
	def := a.Definitions()[0]
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

func (Adapter) Markers(game.ID) []string                   { return nil }
func (Adapter) RegistryHints(game.ID) []ports.RegistryHint { return nil }
func (Adapter) VersionFile(game.ID) string                 { return "" }

// Detect finds nothing: generic games are always added by hand.
func (Adapter) Detect(context.Context, []ports.StoreInstall, ports.FileReader) ([]ports.Candidate, error) {
	return nil, nil
}

// ValidateRoot only requires an existing folder: the adapter cannot know
// what the game looks like.
func (Adapter) ValidateRoot(ctx context.Context, fs ports.FileReader, _ game.ID, root string) error {
	info, err := fs.Stat(ctx, root)
	switch {
	case err != nil:
		return &game.RootError{Reason: game.RootUnreadable}
	case !info.Exists:
		return &game.RootError{Reason: game.RootNotFound}
	case !info.IsDir:
		return &game.RootError{Reason: game.RootNotDirectory}
	}
	return nil
}

func (Adapter) Targets(_ game.ID, root string, custom []game.TargetSpec) ([]game.Target, error) {
	targets, err := game.ResolveCustomTargets(root, custom)
	if err != nil {
		return nil, err
	}
	if slices.ContainsFunc(targets, func(t game.Target) bool { return t.Path == "" }) {
		return nil, errors.New("generic: empty target path")
	}
	return targets, nil
}

// RootHints is empty: the basic installer falls back to the archive layout.
func (Adapter) RootHints(game.ID) ports.RootHints { return ports.RootHints{} }

func (Adapter) ContentFlags(game.ID, []game.Location) []mod.ContentFlag { return nil }
