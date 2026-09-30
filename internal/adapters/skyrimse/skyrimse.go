// Package skyrimse is the adapter for The Elder Scrolls V: Skyrim Special
// Edition / Anniversary Edition (D031, core/12). Every Skyrim-specific fact
// lives here and nowhere else in the program (anti-pattern 3).
package skyrimse

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

const (
	Name    = "skyrimse"
	Version = "1"

	GameID game.ID = "skyrimse"

	// Executable identifies an installation folder (core/12 §1).
	Executable = "SkyrimSE.exe"

	TargetData game.TargetID = "data"
	TargetRoot game.TargetID = "root"

	ModTypeRoot game.ModTypeID = "root"
	ModTypeSKSE game.ModTypeID = "skse"
	ModTypeENB  game.ModTypeID = "enb"
)

// Store identifiers, confirmed against Vortex's game-skyrimse extension
// (Nexus-Mods/vortex-games) and GOG DB on 2026-09-30 (core/12 §1).
const (
	steamAppID  = "489830"
	gogGameID   = "1711230643"
	epicAppName = "ac82db5035584c7f8a2c548d98c86b2c"
	registryID  = "bethesda"
)

// Content flags (core/12 §4).
const (
	FlagPlugin      mod.ContentFlag = "plugin"
	FlagArchive     mod.ContentFlag = "archive"
	FlagTextures    mod.ContentFlag = "textures"
	FlagMeshes      mod.ContentFlag = "meshes"
	FlagScripts     mod.ContentFlag = "scripts"
	FlagInterface   mod.ContentFlag = "interface"
	FlagSounds      mod.ContentFlag = "sounds"
	FlagSKSEPlugin  mod.ContentFlag = "skse_plugin"
	FlagSKSERuntime mod.ContentFlag = "skse_runtime"
	FlagENB         mod.ContentFlag = "enb"
	FlagBodySlide   mod.ContentFlag = "bodyslide"
	FlagAnimations  mod.ContentFlag = "animations"
	FlagStrings     mod.ContentFlag = "strings"
	FlagINI         mod.ContentFlag = "ini"
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
		Name: "The Elder Scrolls V: Skyrim Special Edition",
		Capabilities: game.NewCapabilities(
			game.CapFilesystemTarget, game.CapModTypes, game.CapInstaller,
			game.CapPlugins, game.CapLoadOrder, game.CapLaunch, game.CapExternalChanges,
		),
		Targets: []game.TargetID{TargetData, TargetRoot},
		ModTypes: []game.ModType{
			{ID: game.DefaultModType, Name: "Default", Target: TargetData},
			{
				ID: ModTypeRoot, Name: "Root", Target: TargetRoot, Methods: hardlinkOrCopy, Priority: 10,
				Detect: []game.DetectRule{{All: []string{"root/"}}},
			},
			{
				ID: ModTypeENB, Name: "ENB", Target: TargetRoot, Methods: hardlinkOrCopy, Priority: 20,
				Detect: []game.DetectRule{
					{All: []string{"d3d11.dll", "enbseries.ini"}},
					{All: []string{"d3d11.dll", "enbseries/"}},
				},
			},
			// SKSE's binaries go to the game root and its scripts to Data/:
			// both are below the root target, so one type with the root
			// target serves it (archive paths keep their "Data/" prefix).
			{
				ID: ModTypeSKSE, Name: "SKSE", Target: TargetRoot, Methods: hardlinkOrCopy, Priority: 30,
				Detect: []game.DetectRule{{All: []string{"skse64_loader.exe"}}},
			},
		},
	}}
}

func (a Adapter) InstanceDefinition(id game.ID, _ []game.Target) (game.Definition, error) {
	if id != GameID {
		return game.Definition{}, fmt.Errorf("%w: %s does not define %q", game.ErrInvalid, Name, id)
	}
	return a.Definitions()[0], nil
}

func (Adapter) Markers(game.ID) []string { return []string{Executable} }

func (Adapter) RegistryHints(game.ID) []ports.RegistryHint {
	return []ports.RegistryHint{{
		ID:    registryID,
		Key:   `HKLM\SOFTWARE\WOW6432Node\Bethesda Softworks\Skyrim Special Edition`,
		Value: "installed path",
	}}
}

func (Adapter) VersionFile(game.ID) string { return Executable }

// Detect keeps the installations of the stores that carry Skyrim SE and
// whose folder really holds the game executable.
func (a Adapter) Detect(ctx context.Context, stores []ports.StoreInstall, fs ports.FileReader) ([]ports.Candidate, error) {
	var out []ports.Candidate
	for _, s := range stores {
		if !isSkyrim(s) || s.Path == "" {
			continue
		}
		if a.ValidateRoot(ctx, fs, GameID, s.Path) != nil {
			continue
		}
		out = append(out, ports.Candidate{Game: GameID, Root: s.Path, Store: s.Store})
	}
	return out, nil
}

func isSkyrim(s ports.StoreInstall) bool {
	switch s.Store {
	case "steam":
		return s.AppID == steamAppID
	case "gog":
		return s.AppID == gogGameID
	case "epic":
		return s.AppID == epicAppName
	case "registry":
		return s.AppID == registryID
	}
	return false
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
		{ID: TargetData, Path: game.JoinPath(root, "Data")},
		{ID: TargetRoot, Path: root},
	}, nil
}

// RootHints lists what marks the root of the Data layout (core/12 §3).
func (Adapter) RootHints(game.ID) ports.RootHints {
	return ports.RootHints{
		Dirs: []string{
			"meshes", "textures", "scripts", "interface", "sound", "music", "seq", "strings",
			"skse", "shadersfx", "lodsettings", "grass", "video", "calientetools",
			"netscriptframework", "source",
		},
		Extensions: []string{".esp", ".esm", ".esl", ".bsa", ".ini"},
	}
}

// ContentFlags classifies a footprint (core/12 §4). Paths are taken
// relative to Data/, whichever target the file sits in.
func (Adapter) ContentFlags(_ game.ID, footprint []game.Location) []mod.ContentFlag {
	set := map[mod.ContentFlag]bool{}
	for _, loc := range footprint {
		p := strings.ToLower(loc.Path.String())
		inData := loc.Target == TargetData
		if loc.Target == TargetRoot {
			if rest, ok := strings.CutPrefix(p, "data/"); ok {
				p, inData = rest, true
			} else {
				switch {
				case p == "skse64_loader.exe", strings.HasPrefix(p, "skse64_") && strings.HasSuffix(p, ".dll") && !strings.Contains(p, "/"):
					set[FlagSKSERuntime] = true
				case p == "d3d11.dll", p == "enbseries.ini", strings.HasPrefix(p, "enbseries/"):
					set[FlagENB] = true
				}
			}
		}
		if !inData {
			continue
		}
		top, _, nested := strings.Cut(p, "/")
		if !nested {
			switch p[strings.LastIndex(p, ".")+1:] {
			case "esp", "esm", "esl":
				set[FlagPlugin] = true
			case "bsa":
				set[FlagArchive] = true
			case "ini":
				set[FlagINI] = true
			}
			continue
		}
		switch top {
		case "textures":
			set[FlagTextures] = true
		case "meshes":
			set[FlagMeshes] = true
			if strings.Contains(p, "/behaviors/") || strings.Contains(p, "/animations/") {
				set[FlagAnimations] = true
			}
		case "scripts":
			set[FlagScripts] = true
		case "interface":
			set[FlagInterface] = true
		case "sound", "music":
			set[FlagSounds] = true
		case "strings":
			set[FlagStrings] = true
		case "calientetools":
			set[FlagBodySlide] = true
		case "skse":
			if strings.HasPrefix(p, "skse/plugins/") && strings.HasSuffix(p, ".dll") {
				set[FlagSKSEPlugin] = true
			}
		}
	}
	out := make([]mod.ContentFlag, 0, len(set))
	for f := range set {
		out = append(out, f)
	}
	slices.Sort(out)
	return out
}
