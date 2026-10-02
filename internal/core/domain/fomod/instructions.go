package fomod

import (
	"path"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/relpath"
)

// Phases of the instructions. A later phase wins a destination collision
// whatever the priorities; inside a phase the higher priority wins, and on
// equal priority the later declared one (D085).
const (
	PhaseRequired    = 0
	PhaseOptions     = 1
	PhaseConditional = 2
)

// Instruction is a file or folder element the selection installs.
type Instruction struct {
	FileInstall
	Phase int
	// Seq is the declaration order inside the phase.
	Seq int
}

// ArchiveFile is an entry of the archive (path relative to the archive
// root). Folders only tell that an empty folder exists.
type ArchiveFile struct {
	Path relpath.Path
	Size int64
	Dir  bool
}

// Resolved is one file of the plan: the archive entry and its destination
// relative to the mod.
type Resolved struct {
	Source relpath.Path
	Dest   relpath.Path
	Size   int64
}

// Resolve turns instructions into files. root is the folder of the archive
// that holds fomod/ ("" for the archive root); sources are relative to it
// and matched without case. Folders expand to the files below them. A
// source the archive does not have, or a destination that is not a valid
// relative path, is skipped with a warning: real FOMODs have these defects
// (core/03 §4). Collisions keep one file per destination (INV-LIB-02), by
// phase, then priority, then declaration order. The result is sorted by
// destination.
func Resolve(ins []Instruction, root string, files []ArchiveFile) ([]Resolved, []Warning) {
	type cand struct {
		r                Resolved
		phase, prio, seq int
	}
	byKey := make(map[string]ArchiveFile, len(files))
	dirs := map[string]bool{}
	var only []ArchiveFile
	for _, f := range files {
		if f.Dir {
			dirs[f.Path.Key()] = true
			continue
		}
		byKey[f.Path.Key()] = f
		only = append(only, f)
	}
	files = only
	prefix := ""
	if root != "" {
		prefix = strings.ToLower(root) + "/"
	}
	var warnings []Warning
	warned := map[string]bool{}
	warn := func(code, key, value string) {
		if !warned[code+"|"+value] {
			warned[code+"|"+value] = true
			warnings = append(warnings, Warning{Code: code, Params: map[string]string{key: value}})
		}
	}
	var cands []cand
	for _, in := range ins {
		src := strings.ToLower(in.Source)
		var below []ArchiveFile
		if f, ok := byKey[prefix+src]; ok && !in.Folder {
			below = []ArchiveFile{f}
		} else {
			// A folder (or a file element naming a folder): every file below.
			dir := prefix + src
			if src != "" {
				dir += "/"
			}
			for _, f := range files {
				if strings.HasPrefix(f.Path.Key(), dir) {
					below = append(below, f)
				}
			}
			if f, ok := byKey[prefix+src]; ok && len(below) == 0 {
				below = []ArchiveFile{f}
			}
			slices.SortFunc(below, func(a, b ArchiveFile) int { return strings.Compare(a.Path.Key(), b.Path.Key()) })
		}
		if len(below) == 0 {
			// An empty folder of the archive installs nothing, silently.
			if !dirs[prefix+src] {
				warn(WarnMissingSource, "source", in.Source)
			}
			continue
		}
		single := !in.Folder && len(below) == 1 && below[0].Path.Key() == prefix+src
		for _, f := range below {
			var dest string
			if single {
				switch {
				case !in.HasDestination:
					dest = in.Source
				case in.Destination == "":
					dest = path.Base(f.Path.String())
				default:
					dest = in.Destination
				}
			} else {
				base := in.Source
				if in.HasDestination {
					base = in.Destination
				}
				segs := strings.Split(f.Path.String(), "/")
				rel := strings.Join(segs[depth(root)+depth(in.Source):], "/")
				dest = strings.Trim(base+"/"+rel, "/")
			}
			d, err := relpath.Parse(dest)
			if err != nil || isFomodMeta(d) {
				if err != nil {
					warn(WarnInvalidDestination, "destination", dest)
				}
				continue
			}
			cands = append(cands, cand{Resolved{Source: f.Path, Dest: d, Size: f.Size}, in.Phase, in.Priority, in.Seq})
		}
	}
	slices.SortStableFunc(cands, func(a, b cand) int {
		if a.phase != b.phase {
			return a.phase - b.phase
		}
		if a.prio != b.prio {
			if a.prio < b.prio {
				return -1
			}
			return 1
		}
		return a.seq - b.seq
	})
	byDest := map[string]int{}
	var out []Resolved
	for _, c := range cands {
		if i, ok := byDest[c.r.Dest.Key()]; ok {
			out[i] = c.r
			continue
		}
		byDest[c.r.Dest.Key()] = len(out)
		out = append(out, c.r)
	}
	slices.SortFunc(out, func(a, b Resolved) int { return strings.Compare(a.Dest.Key(), b.Dest.Key()) })
	return out, warnings
}

// depth counts the segments of a "/" path ("" has none).
func depth(p string) int {
	if p == "" {
		return 0
	}
	return strings.Count(p, "/") + 1
}

// isFomodMeta reports whether a destination falls inside a "fomod" folder at
// the mod root: installer metadata is never installed.
func isFomodMeta(p relpath.Path) bool {
	top, _, nested := strings.Cut(p.Key(), "/")
	return nested && top == "fomod"
}
