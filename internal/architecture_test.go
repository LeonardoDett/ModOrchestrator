// Package internal_test enforces the dependency rule of
// core/00-arquitetura-core.md: domain <- application <- infrastructure/adapters,
// with the UI bridge only transporting data.
package internal_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

const module = "modorchestrator/"

// forbidden maps a layer (path prefix under internal/) to import prefixes it
// must never use.
var forbidden = map[string][]string{
	"core/domain": {
		module + "internal/core/application",
		module + "internal/infrastructure",
		module + "internal/adapters",
		module + "internal/bridge",
		module + "internal/bootstrap",
		"github.com/wailsapp/",
		"database/sql",
		"modernc.org/",
		"os",
		"io/fs",
		"path/filepath",
	},
	"core/application": {
		module + "internal/infrastructure",
		module + "internal/adapters",
		module + "internal/bridge",
		module + "internal/bootstrap",
		"github.com/wailsapp/",
		"database/sql",
		"modernc.org/",
		"os",
		"io/fs",
		"path/filepath",
	},
	"infrastructure": {
		module + "internal/bridge",
		module + "internal/bootstrap",
		"github.com/wailsapp/",
	},
	"adapters": {
		module + "internal/bridge",
		module + "internal/bootstrap",
		"github.com/wailsapp/",
	},
}

// State categories inside the domain (D049, docs-ia/03-fontes-de-verdade.md):
// desired state must not embed calculated or applied state, and applied state
// must not embed desired or calculated state. Calculated packages may read
// both. The ordering engine is a pure algorithm and depends on no domain
// package, so desired and calculated packages can share it (D029).
var (
	desiredState = []string{
		"core/domain/game", "core/domain/mod", "core/domain/profile", "core/domain/rules",
		"core/domain/override", "core/domain/plugin", "core/domain/settings",
	}
	appliedState    = []string{"core/domain/deployment"}
	calculatedState = []string{
		"core/domain/conflict", "core/domain/deployplan", "core/domain/deploystate",
		"core/domain/externalchange", "core/domain/diagnostic", "core/domain/dependency",
	}
	pureAlgorithms = []string{"core/domain/ordering", "core/domain/relpath"}
)

func TestLayerDependencies(t *testing.T) {
	checkImports(t, forbidden)
}

func TestStateCategories(t *testing.T) {
	pkgs := func(groups ...[]string) []string {
		var out []string
		for _, g := range groups {
			for _, p := range g {
				out = append(out, module+"internal/"+p)
			}
		}
		return out
	}
	rules := map[string][]string{}
	for _, p := range desiredState {
		rules[p] = pkgs(appliedState, calculatedState)
	}
	for _, p := range appliedState {
		rules[p] = pkgs(desiredStateExceptBase(), calculatedState)
	}
	for _, p := range pureAlgorithms {
		rules[p] = []string{module + "internal/core/domain/"}
	}
	checkImports(t, rules)
}

// desiredStateExceptBase lists desired packages applied state may not use.
// Applied state records game locations, mod/installation ids and plugin
// names, so game, mod and plugin are shared vocabulary, not a dependency on
// intent.
func desiredStateExceptBase() []string {
	var out []string
	for _, p := range desiredState {
		switch p {
		case "core/domain/game", "core/domain/mod", "core/domain/plugin":
			continue
		}
		out = append(out, p)
	}
	return out
}

// checkImports fails for every Go file under a key of rules (a path prefix
// under internal/) that imports one of its banned prefixes.
func checkImports(t *testing.T, rules map[string][]string) {
	t.Helper()
	fset := token.NewFileSet()
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		rel := filepath.ToSlash(path)
		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for layer, banned := range rules {
			if !strings.HasPrefix(rel, layer+"/") {
				continue
			}
			for _, imp := range f.Imports {
				p := strings.Trim(imp.Path.Value, `"`)
				for _, b := range banned {
					if strings.HasPrefix(p, b) {
						t.Errorf("%s (layer %s) imports forbidden %s", rel, layer, p)
					}
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
