package installer

import (
	"fmt"
	"path"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/relpath"
)

// BasicID is the id of the fallback installer.
const BasicID = "basic"

// maxWrapperDepth limits how far root resolution descends through wrapper
// folders (core/02 §4).
const maxWrapperDepth = 3

// fomodDir holds FOMOD metadata; it is never installed.
const fomodDir = "fomod"

// Basic installs the archive as is, after resolving its root (core/02 §4).
// It supports every archive and is the last one asked (priority 90).
type Basic struct{}

var _ Installer = Basic{}

func (Basic) ID() string    { return BasicID }
func (Basic) Priority() int { return 90 }

func (Basic) Supports([]Entry, Context) (bool, string) { return true, "fallback" }

// Plan resolves the root (or uses the recorded one) and installs every file
// below it, keeping relative paths. The mod type is detected from the
// resulting footprint (core/11 §2).
func (Basic) Plan(entries []Entry, ctx Context, opts Options) (Result, error) {
	root, chosen := opts.Root()
	if chosen {
		if root != "" && !isDir(entries, root) {
			return Result{}, fmt.Errorf("%w: root %q is not a folder of the archive", ErrInvalidOption, root)
		}
	} else {
		var d *Decision
		root, d = ResolveRoot(entries, ctx)
		if d != nil {
			return Result{Decision: d}, nil
		}
	}
	plan := &Plan{Installer: BasicID, Options: Options{OptionRoot: root}}
	var dests []string
	for _, e := range entries {
		if e.Dir {
			continue
		}
		rel, ok := below(e.Path.String(), root)
		if !ok || isFomodMeta(rel) {
			continue
		}
		dest, err := relpath.Parse(rel)
		if err != nil {
			return Result{}, err
		}
		plan.Files = append(plan.Files, File{Source: e.Path, Dest: dest, Size: e.Size})
		dests = append(dests, dest.String())
	}
	plan.ModType = ctx.Definition.DetectModType(dests)
	p, err := Finish(plan)
	if err != nil {
		return Result{}, err
	}
	return Result{Plan: p}, nil
}

// ResolveRoot applies the heuristics of core/02 §4: a recognised level is
// the root; a level with a single folder and nothing relevant is a wrapper
// and is descended (up to maxWrapperDepth); otherwise the recognised folders
// below are candidates: one is taken, several need a decision, none gives
// the "not for this game" decision. A game whose adapter recognises nothing
// (no hints, no detection rules) installs the unwrapped level as is.
func ResolveRoot(entries []Entry, ctx Context) (string, *Decision) {
	level := ""
	for depth := 0; ; depth++ {
		if recognized(entries, level, ctx) {
			return level, nil
		}
		dirs, files := children(entries, level)
		if depth < maxWrapperDepth && len(dirs) == 1 && !slices.ContainsFunc(files, relevant) {
			level = join(level, dirs[0])
			continue
		}
		break
	}
	cands := candidates(entries, level, ctx)
	switch {
	case len(cands) == 1:
		return cands[0], nil
	case len(cands) > 1:
		return "", &Decision{Kind: DecisionRootAmbiguous, Candidates: cands, Folders: folders(entries)}
	case !recognizes(ctx):
		return level, nil
	}
	return "", &Decision{Kind: DecisionRootUnrecognized, Candidates: []string{level}, Folders: folders(entries)}
}

// HasModuleConfig reports whether the archive carries a FOMOD installer
// (fomod/ModuleConfig.xml up to three levels deep, core/03 §1).
func HasModuleConfig(entries []Entry) bool {
	return slices.ContainsFunc(entries, func(e Entry) bool {
		segs := strings.Split(e.Path.Key(), "/")
		n := len(segs)
		return !e.Dir && n >= 2 && n <= 5 && segs[n-1] == "moduleconfig.xml" && segs[n-2] == fomodDir
	})
}

// candidates finds, below level, the shallowest recognised folder of each
// branch (level itself excluded), within maxWrapperDepth+1 levels of the
// archive root.
func candidates(entries []Entry, level string, ctx Context) []string {
	var out []string
	var walk func(dir string)
	walk = func(dir string) {
		if recognized(entries, dir, ctx) {
			out = append(out, dir)
			return
		}
		if depthOf(dir) > maxWrapperDepth {
			return
		}
		sub, _ := children(entries, dir)
		for _, d := range sub {
			walk(join(dir, d))
		}
	}
	if depthOf(level) <= maxWrapperDepth {
		sub, _ := children(entries, level)
		for _, d := range sub {
			walk(join(level, d))
		}
	}
	return out
}

// recognized reports whether dir looks like the root of the default target:
// a hinted folder or extension directly inside it, or a mod type detection
// rule matching the files below it.
func recognized(entries []Entry, dir string, ctx Context) bool {
	dirs, files := children(entries, dir)
	for _, d := range dirs {
		if slices.ContainsFunc(ctx.Hints.Dirs, func(h string) bool { return strings.EqualFold(h, d) }) {
			return true
		}
	}
	for _, f := range files {
		ext := strings.ToLower(path.Ext(f.Path.String()))
		if ext != "" && slices.ContainsFunc(ctx.Hints.Extensions, func(h string) bool { return strings.EqualFold(h, ext) }) {
			return true
		}
	}
	var inside []string
	for _, e := range entries {
		if rel, ok := below(e.Path.String(), dir); ok && !e.Dir {
			inside = append(inside, rel)
		}
	}
	for _, t := range ctx.Definition.ModTypes {
		if t.Matches(inside) {
			return true
		}
	}
	return false
}

// recognizes reports whether the context can recognise anything at all.
func recognizes(ctx Context) bool { return !ctx.Hints.Empty() || hasDetectRules(ctx) }

func hasDetectRules(ctx Context) bool {
	for _, t := range ctx.Definition.ModTypes {
		if len(t.Detect) > 0 {
			return true
		}
	}
	return false
}

// children returns the names of the folders and the file entries directly
// inside dir. The FOMOD metadata folder is not a content folder.
func children(entries []Entry, dir string) (dirs []string, files []Entry) {
	for _, e := range entries {
		rel, ok := below(e.Path.String(), dir)
		if !ok || strings.Contains(rel, "/") {
			continue
		}
		if e.Dir {
			if !strings.EqualFold(rel, fomodDir) {
				dirs = append(dirs, rel)
			}
			continue
		}
		files = append(files, e)
	}
	return dirs, files
}

// relevant reports whether a loose file matters for root resolution:
// readmes, text, markdown and images do not (core/02 §4).
func relevant(e Entry) bool {
	name := strings.ToLower(path.Base(e.Path.String()))
	if strings.HasPrefix(name, "readme") {
		return false
	}
	switch path.Ext(name) {
	case ".txt", ".md", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp":
		return false
	}
	return true
}

// below returns p relative to dir when p is inside it (dir "" is the root).
func below(p, dir string) (string, bool) {
	if dir == "" {
		return p, true
	}
	if len(p) > len(dir) && strings.EqualFold(p[:len(dir)], dir) && p[len(dir)] == '/' {
		return p[len(dir)+1:], true
	}
	return "", false
}

func isDir(entries []Entry, dir string) bool {
	return slices.ContainsFunc(entries, func(e Entry) bool { return e.Dir && strings.EqualFold(e.Path.String(), dir) })
}

func isFomodMeta(rel string) bool {
	top, _, nested := strings.Cut(rel, "/")
	return nested && strings.EqualFold(top, fomodDir)
}

func join(dir, name string) string {
	if dir == "" {
		return name
	}
	return dir + "/" + name
}

func depthOf(dir string) int {
	if dir == "" {
		return 0
	}
	return strings.Count(dir, "/") + 1
}
