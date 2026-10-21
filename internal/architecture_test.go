// Package internal_test enforces the dependency rule of
// core/00-arquitetura-core.md: domain <- application <- infrastructure/adapters,
// with the UI bridge only transporting data.
package internal_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
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
	appliedState    = []string{"core/domain/deployment", "core/domain/loadorder", "core/domain/gamesettings"}
	calculatedState = []string{
		"core/domain/conflict", "core/domain/deployplan", "core/domain/deploystate",
		"core/domain/externalchange", "core/domain/diagnostic", "core/domain/dependency",
		"core/domain/installer", "core/domain/health", "core/domain/pluginhealth", "core/domain/savegame",
	}
	pureAlgorithms = []string{"core/domain/ordering", "core/domain/relpath", "core/domain/gameini"}
)

func TestLayerDependencies(t *testing.T) {
	checkImports(t, forbidden)
}

// The plugins module (N1) enters the core through contribution points
// (D133): no package that serves every game (N0) imports it. Its clients
// are its own packages, ports (adapter contracts until the SDK, phase C3)
// and imports (it brings the plugin parts of Vortex and MO2).
var (
	pluginModule = []string{
		"core/domain/plugin", "core/domain/pluginhealth", "core/domain/loadorder", "core/application/plugins",
		// The LOOT provider is a provider of the plugins module (D143).
		"core/application/loot",
	}
	pluginClients = []string{"core/application/ports", "core/application/imports"}
)

// D134: the built-in adapters import only the SDK (modorchestrator/sdk), the
// standard library and other adapters, so the contract a third party sees is
// the one the built-in adapters use. Tests may reach the core. The SDK
// itself only names the domain and the adapter contracts of ports.
func TestAdaptersImportOnlyTheSDK(t *testing.T) {
	fset := token.NewFileSet()
	check := func(root string, allowed func(imp string) bool) {
		t.Helper()
		files := 0
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return err
			}
			f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
			if err != nil {
				return err
			}
			files++
			for _, imp := range f.Imports {
				p := strings.Trim(imp.Path.Value, `"`)
				if strings.HasPrefix(p, module) && !allowed(p) {
					t.Errorf("%s imports %s", filepath.ToSlash(path), p)
				}
			}
			return nil
		})
		if err != nil || files == 0 {
			t.Fatalf("%s: %d files, %v", root, files, err)
		}
	}
	check("adapters", func(p string) bool {
		return p == module+"sdk" || strings.HasPrefix(p, module+"sdk/") || strings.HasPrefix(p, module+"internal/adapters/")
	})
	check(filepath.Join("..", "sdk"), func(p string) bool {
		return strings.HasPrefix(p, module+"internal/core/domain/") || p == module+"internal/core/application/ports"
	})
}

func TestCoreDoesNotImportThePluginsModule(t *testing.T) {
	var banned []string
	for _, p := range pluginModule {
		banned = append(banned, module+"internal/"+p)
	}
	rules := map[string][]string{}
	for _, layer := range []string{"core/domain", "core/application"} {
		entries, err := os.ReadDir(layer)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range entries {
			pkg := layer + "/" + e.Name()
			if e.IsDir() && !slices.Contains(pluginModule, pkg) && !slices.Contains(pluginClients, pkg) {
				rules[pkg] = banned
			}
		}
	}
	if len(rules) < 20 {
		t.Fatalf("expected the core packages, got %d", len(rules))
	}
	checkImports(t, rules)
}

// D142: the saves module enters like the plugins module; no other core
// package imports it, and it does not import the plugins module (the
// bootstrap bridges the two).
func TestCoreDoesNotImportTheSavesModule(t *testing.T) {
	banned := []string{module + "internal/core/application/saves"}
	rules := map[string][]string{}
	for _, layer := range []string{"core/domain", "core/application"} {
		entries, err := os.ReadDir(layer)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range entries {
			if pkg := layer + "/" + e.Name(); e.IsDir() && pkg != "core/application/saves" {
				rules[pkg] = banned
			}
		}
	}
	rules["core/application/saves"] = []string{module + "internal/core/application/plugins"}
	checkImports(t, rules)
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

// Game identity belongs to the adapters (D011, anti-pattern 3, core/11 §8):
// no string literal outside internal/adapters may name a specific game or
// one of its tools. Tests and the composition root are exempt.
var gameNames = []string{
	"skyrim", "skse", "fallout", "oblivion", "morrowind", "starfield", "witcher", "cyberpunk", "enbseries",
	// File names and extensions of one game family are game facts too
	// (D112): the adapter declares them.
	"plugins.txt", "loadorder.txt", ".esp", ".esm", ".esl", ".bsa",
}

func TestNoGameSpecificLiteralsOutsideAdapters(t *testing.T) {
	fset := token.NewFileSet()
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		rel := filepath.ToSlash(path)
		if strings.HasPrefix(rel, "adapters/") || strings.HasPrefix(rel, "bootstrap/") || strings.HasPrefix(rel, "testutil/") || strings.Contains(rel, "/testdata/") {
			return nil
		}
		f, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		ast.Inspect(f, func(n ast.Node) bool {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			low := strings.ToLower(lit.Value)
			for _, name := range gameNames {
				if strings.Contains(low, name) {
					t.Errorf("%s:%d names a specific game (%q) outside internal/adapters: %s",
						rel, fset.Position(lit.Pos()).Line, name, lit.Value)
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// D115: the definition in effect for an instance is asked in one place
// (ports.InstanceDefinition), which removes the features the user turned
// off. A direct call to the adapter would bring a turned-off feature back.
// The games service may call it to show what the game offers.
func TestInstanceDefinitionIsAskedThroughThePort(t *testing.T) {
	allowed := map[string]bool{
		"core/application/ports/system.go":   true,
		"core/application/games/features.go": true,
	}
	fset := token.NewFileSet()
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		rel := filepath.ToSlash(path)
		if allowed[rel] || strings.HasPrefix(rel, "adapters/") {
			return nil
		}
		f, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		ast.Inspect(f, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "InstanceDefinition" {
				return true
			}
			if pkg, ok := sel.X.(*ast.Ident); ok && pkg.Name == "ports" {
				return true
			}
			t.Errorf("%s:%d asks the adapter for the instance definition; use ports.InstanceDefinition", rel, fset.Position(call.Pos()).Line)
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
