package valheim

import (
	"encoding/json"
	"path"
	"regexp"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/installer"
	"modorchestrator/internal/core/domain/relpath"
)

var _ ports.InstallerProvider = Adapter{}

// Installers registers the adapter's own installers (core/03 §6): the
// framework pack, mod packages with a manifest, and loose DLLs.
func (Adapter) Installers(game.ID) []installer.Installer {
	return []installer.Installer{LoaderPack{}, Package{}, LoosePlugin{}}
}

// Installer ids.
const (
	LoaderPackID  = "bepinex-pack"
	PackageID     = "bepinex-package"
	LoosePluginID = "bepinex-loose"
)

// OptionFolder records the folder a mod's files were grouped under, so a
// reinstall lands in the same place.
const OptionFolder = "folder"

const manifestFile = "manifest.json"

func isDLL(p string) bool { return strings.HasSuffix(strings.ToLower(p), ".dll") }

// top returns the first segment of a path, lower case, and the rest.
func top(p string) (first, rest string) {
	first, rest, _ = strings.Cut(p, "/")
	return strings.ToLower(first), rest
}

func hasFile(entries []installer.Entry, name string) bool {
	for _, e := range entries {
		if !e.Dir && strings.EqualFold(e.Path.String(), name) {
			return true
		}
	}
	return false
}

// LoaderPack installs the framework itself: the folder of the archive that
// holds the Doorstop proxy next to BepInEx/core goes to the game root, under
// the bepinex mod type. It only produces a plan.
type LoaderPack struct{}

func (LoaderPack) ID() string    { return LoaderPackID }
func (LoaderPack) Priority() int { return 20 }

// packDir finds the folder holding the proxy and the framework core.
func packDir(entries []installer.Entry) (string, bool) {
	for _, e := range entries {
		p := e.Path.String()
		if e.Dir || !strings.EqualFold(path.Base(p), doorstopProxy) || strings.Count(p, "/") > 2 {
			continue
		}
		dir := path.Dir(p)
		if dir == "." {
			dir = ""
		}
		core := strings.ToLower(path.Join(dir, dirFramework, dirCore)) + "/"
		for _, o := range entries {
			if !o.Dir && strings.HasPrefix(strings.ToLower(o.Path.String()), core) {
				return dir, true
			}
		}
	}
	return "", false
}

func (LoaderPack) Supports(entries []installer.Entry, _ installer.Context) (bool, string) {
	if _, ok := packDir(entries); ok {
		return true, doorstopProxy
	}
	return false, ""
}

func (LoaderPack) Plan(entries []installer.Entry, _ installer.Context, _ installer.Options) (installer.Result, error) {
	root, ok := packDir(entries)
	if !ok {
		return installer.Result{}, installer.ErrUnsupported
	}
	plan := &installer.Plan{Installer: LoaderPackID, ModType: ModTypeLoader, Options: installer.Options{installer.OptionRoot: root}}
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
		if err := add(plan, e, rel); err != nil {
			return installer.Result{}, err
		}
	}
	return finish(plan)
}

// Package installs a mod package: an archive with manifest.json at its
// root, as the mod sites of the game publish them. Files are routed as the
// framework expects: plugins/ and patchers/ are grouped in a folder of the
// mod, config/ goes straight to config/, and everything else is the mod's
// plugin folder. A leading BepInEx/ is the framework folder itself.
type Package struct{}

func (Package) ID() string    { return PackageID }
func (Package) Priority() int { return 30 }

func (Package) Supports(entries []installer.Entry, _ installer.Context) (bool, string) {
	if hasFile(entries, manifestFile) {
		return true, manifestFile
	}
	return false, ""
}

var unsafeFolder = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)

// packageFolder is the folder of the mod: the recorded one on a reinstall,
// else the name the manifest declares, else the name of its first DLL.
func packageFolder(entries []installer.Entry, ctx installer.Context, opts installer.Options) string {
	if f, ok := opts[OptionFolder]; ok && f != "" {
		return f
	}
	if ctx.Content != nil {
		if p, err := relpath.Parse(manifestFile); err == nil {
			if data, err := ctx.Content(p); err == nil {
				var m struct {
					Name string `json:"name"`
				}
				// Manifests are often saved with a byte order mark.
				if json.Unmarshal([]byte(strings.TrimPrefix(string(data), "\xef\xbb\xbf")), &m) == nil {
					if n := strings.Trim(unsafeFolder.ReplaceAllString(m.Name, "_"), "._"); n != "" {
						return n
					}
				}
			}
		}
	}
	return dllFolder(entries)
}

func dllFolder(entries []installer.Entry) string {
	for _, e := range entries {
		if p := e.Path.String(); !e.Dir && isDLL(p) {
			base := path.Base(p)
			return strings.Trim(unsafeFolder.ReplaceAllString(base[:len(base)-len(".dll")], "_"), "._")
		}
	}
	return "mod"
}

func (Package) Plan(entries []installer.Entry, ctx installer.Context, opts installer.Options) (installer.Result, error) {
	if !hasFile(entries, manifestFile) {
		return installer.Result{}, installer.ErrUnsupported
	}
	folder := packageFolder(entries, ctx, opts)
	plan := &installer.Plan{Installer: PackageID, ModType: game.DefaultModType, Options: installer.Options{OptionFolder: folder}}
	for _, e := range entries {
		if e.Dir {
			continue
		}
		if err := add(plan, e, route(e.Path.String(), folder)); err != nil {
			return installer.Result{}, err
		}
	}
	return finish(plan)
}

// route maps a path of a mod archive to its place below the framework
// folder.
func route(rel, folder string) string {
	first, rest := top(rel)
	if first == strings.ToLower(dirFramework) && rest != "" {
		rel = rest
		first, rest = top(rel)
	}
	if rest != "" {
		switch first {
		case dirPlugins, dirPatchers:
			return first + "/" + folder + "/" + rest
		case dirConfig:
			return dirConfig + "/" + rest
		}
	}
	return dirPlugins + "/" + folder + "/" + rel
}

// LoosePlugin installs an archive that is just DLLs (no manifest and none
// of the framework folders): the framework only loads what is below
// plugins/, so the files are grouped in a folder there. A single wrapper
// folder is removed.
type LoosePlugin struct{}

func (LoosePlugin) ID() string    { return LoosePluginID }
func (LoosePlugin) Priority() int { return 40 }

func loose(entries []installer.Entry) bool {
	dll := false
	for _, e := range entries {
		if e.Dir {
			continue
		}
		p := strings.ToLower(e.Path.String())
		for _, seg := range strings.Split(path.Dir(p), "/") {
			switch seg {
			case strings.ToLower(dirFramework), dirPlugins, dirPatchers, dirConfig, dirCore:
				return false
			}
		}
		dll = dll || isDLL(p)
	}
	return dll
}

func (LoosePlugin) Supports(entries []installer.Entry, _ installer.Context) (bool, string) {
	if loose(entries) {
		return true, "dll"
	}
	return false, ""
}

// wrapper returns the single folder every file is below, if any.
func wrapper(entries []installer.Entry) string {
	w := ""
	for _, e := range entries {
		if e.Dir {
			continue
		}
		first, rest, nested := strings.Cut(e.Path.String(), "/")
		if !nested || rest == "" || (w != "" && !strings.EqualFold(w, first)) {
			return ""
		}
		w = first
	}
	return w
}

func (LoosePlugin) Plan(entries []installer.Entry, _ installer.Context, opts installer.Options) (installer.Result, error) {
	if !loose(entries) {
		return installer.Result{}, installer.ErrUnsupported
	}
	folder := opts[OptionFolder]
	if folder == "" {
		folder = dllFolder(entries)
	}
	w := wrapper(entries)
	plan := &installer.Plan{Installer: LoosePluginID, ModType: game.DefaultModType, Options: installer.Options{OptionFolder: folder}}
	for _, e := range entries {
		if e.Dir {
			continue
		}
		rel := e.Path.String()
		if w != "" {
			rel = rel[len(w)+1:]
		}
		if err := add(plan, e, dirPlugins+"/"+folder+"/"+rel); err != nil {
			return installer.Result{}, err
		}
	}
	return finish(plan)
}

func add(plan *installer.Plan, e installer.Entry, dest string) error {
	d, err := relpath.Parse(dest)
	if err != nil {
		return err
	}
	plan.Files = append(plan.Files, installer.File{Source: e.Path, Dest: d, Size: e.Size})
	return nil
}

func finish(plan *installer.Plan) (installer.Result, error) {
	p, err := installer.Finish(plan)
	if err != nil {
		return installer.Result{}, err
	}
	return installer.Result{Plan: p}, nil
}
