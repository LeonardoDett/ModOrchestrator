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
	},
	"core/application": {
		module + "internal/infrastructure",
		module + "internal/adapters",
		module + "internal/bridge",
		module + "internal/bootstrap",
		"github.com/wailsapp/",
		"database/sql",
		"modernc.org/",
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

func TestLayerDependencies(t *testing.T) {
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
		for layer, banned := range forbidden {
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
