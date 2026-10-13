// Package valheim is the adapter for Valheim (D114): a game whose mods are
// loaded by the BepInEx framework, with no plugin list and no load order
// file. Every Valheim and BepInEx fact lives here (anti-pattern 3).
package valheim

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

const (
	Name    = "valheim"
	Version = "1"

	GameID game.ID = "valheim"

	// Executable identifies an installation folder.
	Executable = "valheim.exe"

	// TargetBepInEx is the folder of the framework: plugins/, patchers/ and
	// config/ are below it. TargetRoot is the game folder, where the
	// framework itself is installed.
	TargetBepInEx game.TargetID = "bepinex"
	TargetRoot    game.TargetID = "root"

	// ModTypeLoader is the framework pack (game root).
	ModTypeLoader game.ModTypeID = "bepinex"
	ModTypeRoot   game.ModTypeID = "root"
)

// steamAppID was read from steamapps/appmanifest_892970.acf of a real
// installation on 2026-10-13.
const steamAppID = "892970"

// Folders of the framework, below TargetBepInEx.
const (
	dirFramework = "BepInEx"
	dirPlugins   = "plugins"
	dirPatchers  = "patchers"
	dirConfig    = "config"
	dirCore      = "core"
)

// Files of the framework in the game root: the Doorstop proxy that starts
// it and the preloader it runs (doorstop_config.ini `target_assembly`).
const (
	doorstopProxy = "winhttp.dll"
	preloader     = dirFramework + "/" + dirCore + "/BepInEx.Preloader.dll"
)

// Content flags.
const (
	FlagPlugin  mod.ContentFlag = "bepinex_plugin"
	FlagPatcher mod.ContentFlag = "bepinex_patcher"
	FlagConfig  mod.ContentFlag = "bepinex_config"
	FlagRuntime mod.ContentFlag = "bepinex_runtime"
)

// Adapter implements ports.GameAdapter.
type Adapter struct{}

var _ ports.GameAdapter = Adapter{}

func (Adapter) Name() string    { return Name }
func (Adapter) Version() string { return Version }

func (Adapter) Definitions() []game.Definition {
	hardlinkOrCopy := []game.DeploymentMethod{game.MethodHardlink, game.MethodCopy}
	return []game.Definition{{
		ID:   GameID,
		Name: "Valheim",
		// No plugins and no load_order: the framework orders what it loads
		// by the dependencies each mod declares in its own code.
		Capabilities: game.NewCapabilities(
			game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller,
			game.CapLaunch, game.CapExternalChanges,
			game.CapAdapterInstallers, game.CapHealthChecks, game.CapRunningDetection,
		),
		Support: game.SupportFull,
		Discovery: game.Discovery{
			Stores:  []game.StoreRef{{Store: game.StoreSteam, AppID: steamAppID}},
			Markers: []string{Executable},
		},
		Targets: []game.TargetID{TargetBepInEx, TargetRoot},
		ModTypes: []game.ModType{
			{ID: game.DefaultModType, Name: "Default", Target: TargetBepInEx},
			{
				ID: ModTypeRoot, Name: "Root", Target: TargetRoot, Methods: hardlinkOrCopy, Priority: 10,
				Detect: []game.DetectRule{{All: []string{"root/"}}},
			},
			{
				ID: ModTypeLoader, Name: "BepInEx", Target: TargetRoot, Methods: hardlinkOrCopy, Priority: 30,
				Detect: []game.DetectRule{{All: []string{doorstopProxy, dirFramework + "/" + dirCore + "/"}}},
			},
		},
		// The game writes each mod's settings to config/ on its first run.
		ToolOutputs: []game.Location{{Target: TargetBepInEx, Path: relpath.MustParse(dirConfig)}},
		UnmanagedHints: []game.FilePattern{
			{Target: TargetBepInEx, Glob: dirConfig + "/*.cfg"},
			{Target: TargetBepInEx, Glob: "*.log"},
		},
	}}
}

func (a Adapter) InstanceDefinition(id game.ID, _ []game.Target) (game.Definition, error) {
	if id != GameID {
		return game.Definition{}, fmt.Errorf("%w: %s does not define %q", game.ErrInvalid, Name, id)
	}
	return a.Definitions()[0], nil
}

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
	exe, err := fs.Stat(ctx, game.JoinPath(root, Executable))
	if err != nil {
		return &game.RootError{Reason: game.RootUnreadable}
	}
	if !exe.Exists || exe.IsDir {
		return &game.RootError{Reason: game.RootMarkerMissing, Marker: Executable}
	}
	return nil
}

func (Adapter) Targets(_ game.ID, root string, _ []game.TargetSpec) ([]game.Target, error) {
	return []game.Target{
		{ID: TargetBepInEx, Path: game.JoinPath(root, dirFramework)},
		{ID: TargetRoot, Path: root},
	}, nil
}

// RootHints lists the folders that mark the root of the framework layout.
// No extension is a hint: a loose DLL belongs in plugins/, which the
// adapter's own installer handles.
func (Adapter) RootHints(game.ID) ports.RootHints {
	return ports.RootHints{Dirs: []string{dirPlugins, dirPatchers, dirConfig, dirCore}}
}

// ContentFlags classifies a footprint. Paths are taken relative to the
// framework folder, whichever target the file sits in.
func (Adapter) ContentFlags(_ game.ID, footprint []game.Location) []mod.ContentFlag {
	set := map[mod.ContentFlag]bool{}
	for _, loc := range footprint {
		p := strings.ToLower(loc.Path.String())
		if loc.Target == TargetRoot {
			rest, ok := strings.CutPrefix(p, strings.ToLower(dirFramework)+"/")
			if !ok {
				if p == doorstopProxy {
					set[FlagRuntime] = true
				}
				continue
			}
			p = rest
		}
		top, _, nested := strings.Cut(p, "/")
		if !nested {
			continue
		}
		dll := strings.HasSuffix(p, ".dll")
		switch {
		case top == dirPlugins && dll:
			set[FlagPlugin] = true
		case top == dirPatchers && dll:
			set[FlagPatcher] = true
		case top == dirConfig:
			set[FlagConfig] = true
		case top == dirCore:
			set[FlagRuntime] = true
		}
	}
	out := make([]mod.ContentFlag, 0, len(set))
	for f := range set {
		out = append(out, f)
	}
	slices.Sort(out)
	return out
}
