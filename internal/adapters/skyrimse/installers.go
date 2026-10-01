package skyrimse

import (
	"path"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/relpath"
)

var (
	_ ports.InstallerProvider = Adapter{}
	_ ports.CategoryProvider  = Adapter{}
)

// Installers registers the adapter's own installers (core/03 §6).
func (Adapter) Installers(game.ID) []installer.Installer {
	return []installer.Installer{SKSERuntime{}}
}

// SKSERuntimeID names the script extender installer.
const SKSERuntimeID = "skse-runtime"

// skseLoader identifies a script extender runtime archive.
const skseLoader = "skse64_loader.exe"

// SKSERuntime installs the script extender: the loader and its DLLs go to
// the game root and its Data/ folder keeps its prefix, all under the skse
// mod type (root target). Sources, readmes and the rest are left out, as
// Vortex's script-extender installer does. It only produces a plan.
type SKSERuntime struct{}

func (SKSERuntime) ID() string    { return SKSERuntimeID }
func (SKSERuntime) Priority() int { return 20 }

func loaderDir(entries []installer.Entry) (string, bool) {
	for _, e := range entries {
		p := e.Path.String()
		if e.Dir || !strings.EqualFold(path.Base(p), skseLoader) || strings.Count(p, "/") > 3 {
			continue
		}
		if dir := path.Dir(p); dir != "." {
			return dir, true
		}
		return "", true
	}
	return "", false
}

func (SKSERuntime) Supports(entries []installer.Entry, _ installer.Context) (bool, string) {
	if _, ok := loaderDir(entries); ok {
		return true, skseLoader
	}
	return false, ""
}

func (SKSERuntime) Plan(entries []installer.Entry, _ installer.Context, _ installer.Options) (installer.Result, error) {
	root, ok := loaderDir(entries)
	if !ok {
		return installer.Result{}, installer.ErrUnsupported
	}
	plan := &installer.Plan{Installer: SKSERuntimeID, ModType: ModTypeSKSE, Options: installer.Options{installer.OptionRoot: root}}
	for _, e := range entries {
		if e.Dir {
			continue
		}
		rel := e.Path.String()
		if root != "" {
			if len(rel) <= len(root) || !strings.EqualFold(rel[:len(root)], root) || rel[len(root)] != '/' {
				continue
			}
			rel = rel[len(root)+1:]
		}
		var dest string
		switch low := strings.ToLower(rel); {
		case !strings.Contains(low, "/") && (strings.HasSuffix(low, ".exe") || strings.HasSuffix(low, ".dll")):
			dest = rel
		case strings.HasPrefix(low, "data/"):
			dest = "Data/" + rel[len("data/"):]
		default:
			continue
		}
		d, err := relpath.Parse(dest)
		if err != nil {
			return installer.Result{}, err
		}
		plan.Files = append(plan.Files, installer.File{Source: e.Path, Dest: d, Size: e.Size})
	}
	p, err := installer.Finish(plan)
	if err != nil {
		return installer.Result{}, err
	}
	return installer.Result{Plan: p}, nil
}

// DefaultCategories is a lean tree inspired by the Nexus categories; the
// user renames or deletes freely and nothing is fetched (core/02 §10).
func (Adapter) DefaultCategories(game.ID) []ports.DefaultCategory {
	return []ports.DefaultCategory{
		{Key: "fixes", Name: "Bug Fixes"},
		{Key: "patches", Name: "Patches"},
		{Key: "ui", Name: "User Interface"},
		{Key: "gameplay", Name: "Gameplay"},
		{Key: "combat", Name: "Combat", Parent: "gameplay"},
		{Key: "magic", Name: "Magic", Parent: "gameplay"},
		{Key: "immersion", Name: "Immersion"},
		{Key: "quests", Name: "Quests and Adventures"},
		{Key: "locations", Name: "Locations"},
		{Key: "followers", Name: "Followers and Companions"},
		{Key: "npc", Name: "NPC"},
		{Key: "creatures", Name: "Creatures"},
		{Key: "items", Name: "Items"},
		{Key: "armour", Name: "Armour", Parent: "items"},
		{Key: "weapons", Name: "Weapons", Parent: "items"},
		{Key: "clothing", Name: "Clothing and Accessories", Parent: "items"},
		{Key: "body", Name: "Body, Face and Hair"},
		{Key: "animation", Name: "Animation"},
		{Key: "audio", Name: "Audio"},
		{Key: "visuals", Name: "Visuals and Graphics"},
		{Key: "textures", Name: "Models and Textures", Parent: "visuals"},
		{Key: "enb", Name: "ENB Presets", Parent: "visuals"},
		{Key: "lighting", Name: "Lighting and Weather", Parent: "visuals"},
		{Key: "overhauls", Name: "Overhauls"},
		{Key: "utilities", Name: "Utilities"},
		{Key: "skse", Name: "SKSE Plugins", Parent: "utilities"},
	}
}
