package installer

import (
	"errors"
	"fmt"
	"strings"

	"modorchestrator/internal/core/domain/fomod"
	"modorchestrator/internal/core/domain/relpath"
)

// FomodID is the id of the FOMOD XML installer.
const FomodID = "fomod"

// Options of the FOMOD installer.
const (
	// OptionFomod is the recorded selection (fomod.Encode). With it the
	// installer plans without asking.
	OptionFomod = "fomod"
	// OptionFomodPrevious carries the selection of the previous
	// installation to preselect in the wizard on reinstall (D030); it is
	// never recorded.
	OptionFomodPrevious = "fomod.previous"
)

// Errors of the FOMOD installer (core/03 §8).
var (
	// ErrInvalidFomod is a ModuleConfig.xml that cannot be read
	// (fomod_invalid_xml).
	ErrInvalidFomod = fomod.ErrInvalidXML
	// ErrModuleDependencies: the moduleDependencies are not met
	// (fomod_module_dependencies_failed).
	ErrModuleDependencies = errors.New("installer: fomod module dependencies not met")
	// ErrInvalidSelection: a selection breaks a group type
	// (fomod_invalid_selection).
	ErrInvalidSelection = errors.New("installer: invalid fomod selection")
)

// ModuleDependenciesError lists the unmet terms ("file:X:Active", ...).
type ModuleDependenciesError struct{ Unmet []string }

func (e *ModuleDependenciesError) Error() string {
	return fmt.Sprintf("%v: %s", ErrModuleDependencies, strings.Join(e.Unmet, ", "))
}
func (e *ModuleDependenciesError) Unwrap() error { return ErrModuleDependencies }

// InvalidSelectionError lists the groups whose selection is invalid.
type InvalidSelectionError struct{ Groups []fomod.GroupKey }

func (e *InvalidSelectionError) Error() string {
	return fmt.Sprintf("%v: %d group(s)", ErrInvalidSelection, len(e.Groups))
}
func (e *InvalidSelectionError) Unwrap() error { return ErrInvalidSelection }

// FomodPackage is the FOMOD installer of an archive.
type FomodPackage struct {
	// Root is the archive folder holding fomod/ ("" is the archive root).
	Root   string
	Module *fomod.Module
}

// ImagePath returns the archive path of an image the module references,
// when it is a file of the archive below the FOMOD root.
func (p *FomodPackage) ImagePath(entries []Entry, image string) (relpath.Path, bool) {
	if image == "" {
		return relpath.Path{}, false
	}
	key := strings.ToLower(join(p.Root, image))
	for _, e := range entries {
		if !e.Dir && e.Path.Key() == key {
			return e.Path, true
		}
	}
	return relpath.Path{}, false
}

// FomodRequest is the wizard a FOMOD decision shows.
type FomodRequest struct {
	Package *FomodPackage
	// Previous is the selection of the previous installation (reinstall),
	// nil when there is none.
	Previous fomod.Selection
	Warnings []Warning
}

// Fomod is the FOMOD XML installer (core/03 §3–5, D030). It is asked first
// (priority 10) and supports archives with fomod/ModuleConfig.xml or with a
// scripted installer, which it never runs: the user may then pick a folder
// to install with the basic installer (core/03 §7).
type Fomod struct{}

var _ Installer = Fomod{}

func (Fomod) ID() string    { return FomodID }
func (Fomod) Priority() int { return 10 }

func (Fomod) Supports(entries []Entry, _ Context) (bool, string) {
	if _, ok := fomodFile(entries, "moduleconfig.xml"); ok {
		return true, "fomod/ModuleConfig.xml"
	}
	if HasFomodScript(entries) {
		return true, "fomod/script.cs"
	}
	return false, ""
}

// HasFomodScript reports whether the archive carries a C# FOMOD script.
func HasFomodScript(entries []Entry) bool {
	_, ok := fomodFile(entries, "script.cs")
	return ok
}

// LoadFomod reads and parses the ModuleConfig.xml of the archive through
// ctx.Content. It returns nil without error when the archive has none (a
// scripted installer).
func LoadFomod(entries []Entry, ctx Context) (*FomodPackage, error) {
	p, ok := fomodFile(entries, "moduleconfig.xml")
	if !ok {
		return nil, nil
	}
	if ctx.Content == nil {
		return nil, fmt.Errorf("%w: archive content not available", ErrInvalidFomod)
	}
	data, err := ctx.Content(p)
	if err != nil {
		return nil, errors.Join(ErrInvalidFomod, err)
	}
	m, err := fomod.Parse(data)
	if err != nil {
		return nil, err
	}
	root := ""
	if segs := strings.Split(p.String(), "/"); len(segs) > 2 {
		root = strings.Join(segs[:len(segs)-2], "/")
	}
	return &FomodPackage{Root: root, Module: m}, nil
}

// Plan applies a recorded selection, or asks for the wizard. A recorded
// root without selection means the user chose to install a folder with the
// basic installer.
func (Fomod) Plan(entries []Entry, ctx Context, opts Options) (Result, error) {
	if _, chosen := opts.Root(); chosen && opts[OptionFomod] == "" {
		return Basic{}.Plan(entries, ctx, Options{OptionRoot: opts[OptionRoot]})
	}
	pkg, err := LoadFomod(entries, ctx)
	if err != nil {
		return Result{}, err
	}
	if pkg == nil {
		return Result{Decision: &Decision{Kind: DecisionFomodScript, Candidates: candidates(entries, "", ctx), Folders: folders(entries)}}, nil
	}
	if st := fomod.Evaluate(pkg.Module, ctx.Fomod, nil); !st.DependenciesMet {
		return Result{}, &ModuleDependenciesError{Unmet: st.Unmet}
	}
	if s, ok := opts[OptionFomod]; ok {
		sel, dropped, err := fomod.Decode(pkg.Module, s)
		if err != nil || len(dropped) > 0 {
			return Result{}, fmt.Errorf("%w: recorded fomod choices no longer apply", ErrInvalidOption)
		}
		p, _, err := FomodPlan(pkg, entries, ctx, sel)
		if err != nil {
			return Result{}, err
		}
		return Result{Plan: p}, nil
	}
	req := &FomodRequest{Package: pkg}
	if s, ok := opts[OptionFomodPrevious]; ok {
		if sel, dropped, err := fomod.Decode(pkg.Module, s); err == nil {
			req.Previous, req.Warnings = sel, dropped
		}
	}
	return Result{Decision: &Decision{Kind: DecisionFomod, Fomod: req}}, nil
}

// FomodPlan evaluates a selection and turns it into a plan: the files to
// install, the recorded selection, warnings and detected requirements. It
// also returns the evaluated state (the wizard's summary uses both).
func FomodPlan(pkg *FomodPackage, entries []Entry, ctx Context, sel fomod.Selection) (*Plan, *fomod.State, error) {
	st := fomod.Evaluate(pkg.Module, ctx.Fomod, sel)
	if !st.DependenciesMet {
		return nil, st, &ModuleDependenciesError{Unmet: st.Unmet}
	}
	if bad := st.Problems(); len(bad) > 0 {
		return nil, st, &InvalidSelectionError{Groups: bad}
	}
	var files []fomod.ArchiveFile
	for _, e := range entries {
		files = append(files, fomod.ArchiveFile{Path: e.Path, Size: e.Size, Dir: e.Dir})
	}
	resolved, warnings := fomod.Resolve(st.Instructions, pkg.Root, files)
	plan := &Plan{
		Installer:    FomodID,
		Options:      Options{OptionFomod: fomod.Encode(pkg.Module, st.Effective())},
		Warnings:     append(append([]Warning{}, st.Warnings...), warnings...),
		Requirements: pkg.Module.RequiredFiles(),
	}
	var dests []string
	for _, r := range resolved {
		plan.Files = append(plan.Files, File{Source: r.Source, Dest: r.Dest, Size: r.Size})
		dests = append(dests, r.Dest.String())
	}
	plan.ModType = ctx.Definition.DetectModType(dests)
	p, err := Finish(plan)
	if err != nil {
		return nil, st, err
	}
	return p, st, nil
}

// fomodFile finds fomod/<name> (lower case) up to three levels deep,
// preferring the shallowest.
func fomodFile(entries []Entry, name string) (relpath.Path, bool) {
	var best relpath.Path
	found := false
	for _, e := range entries {
		segs := strings.Split(e.Path.Key(), "/")
		n := len(segs)
		if !e.Dir && n >= 2 && n <= 5 && segs[n-1] == name && segs[n-2] == fomodDir {
			if !found || n < depthOf(best.String()) {
				best, found = e.Path, true
			}
		}
	}
	return best, found
}
