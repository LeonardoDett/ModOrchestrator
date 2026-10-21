package tool

import (
	"path"
	"strings"
)

// Known is a tool an adapter knows for one of its games (contract
// ports.ToolSupport, D146): what it is called, the executable files that
// identify it and the defaults of a new tool. The core shows it as a
// suggestion; nothing is registered until the user adds it.
type Known struct {
	// ID is stable for the game (it stays in Tool.Known).
	ID   string
	Name string
	// Executables are the files that identify the tool, in order of
	// preference, each with the arguments it needs for this game.
	Executables []Executable
	// Paths are folders, relative to the game root with "/", where the
	// tool is usually installed; "" is the root. A tool installed
	// elsewhere is located by the user.
	Paths     []string
	Exclusive bool
	// DeployBefore is the default of Tool.DeployBefore.
	DeployBefore bool
}

// Executable is one file name of a known tool and the arguments it needs.
type Executable struct {
	File string
	Args string
}

// Match returns the executable of a known tool with the file name of exe
// (without case).
func (k Known) Match(exe string) (Executable, bool) {
	name := strings.ToLower(path.Base(strings.ReplaceAll(exe, `\`, "/")))
	for _, e := range k.Executables {
		if strings.ToLower(e.File) == name {
			return e, true
		}
	}
	return Executable{}, false
}

// Valid reports whether the declaration can be offered: an id, a name and
// executables with the tool extension, and relative paths.
func (k Known) Valid() bool {
	if k.ID == "" || k.Name == "" || len(k.Executables) == 0 {
		return false
	}
	for _, e := range k.Executables {
		if e.File == "" || strings.ContainsAny(e.File, `/\`) || !strings.HasSuffix(strings.ToLower(e.File), Extension) {
			return false
		}
	}
	for _, p := range k.Paths {
		if strings.HasPrefix(p, "/") || strings.Contains(p, `\`) || strings.Contains(p, ":") || strings.Contains("/"+p+"/", "/../") {
			return false
		}
	}
	return true
}
