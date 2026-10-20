package games

import (
	"strings"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
)

// described is an adapter that brings its own texts and a code (D131).
type described struct {
	bare
	name string
	cat  ports.AdapterCatalog
}

func (d described) Name() string { return d.name }
func (d described) Definitions() []game.Definition {
	def := d.bare.Definitions()[0]
	def.ID = game.ID(d.name)
	return []game.Definition{def}
}
func (d described) Catalog() ports.AdapterCatalog { return d.cat }

func loaderCatalog() ports.AdapterCatalog {
	return ports.AdapterCatalog{
		Diagnostics: []diagnostic.CodeSpec{{Code: "loader_outdated", Module: diagnostic.ModuleGame, WarnsBeforeLaunch: true}},
		Messages: map[string]map[string]string{
			"en":    {"diag.code.loader_outdated": "The loader is outdated", "mods.content.loader_plugin": "Loader plugin"},
			"pt-BR": {"diag.code.loader_outdated": "O carregador está desatualizado", "mods.content.loader_plugin": "Plugin do carregador"},
		},
	}
}

// An adapter's codes join the catalog in effect and its texts are served by
// language, with "en" for a language it does not translate. An adapter
// without a catalog (generic) changes nothing: the core codes, no texts.
func TestRegistryServesAdapterCatalogs(t *testing.T) {
	r, err := NewRegistry(bare{}, described{name: "loader", cat: loaderCatalog()})
	if err != nil {
		t.Fatal(err)
	}
	cat := r.Diagnostics()
	if cat.ModuleOf("loader_outdated") != diagnostic.ModuleGame || !cat.WarnsBeforeLaunch("loader_outdated") {
		t.Errorf("adapter code: module %q, warns %v", cat.ModuleOf("loader_outdated"), cat.WarnsBeforeLaunch("loader_outdated"))
	}
	if cat.ModuleOf(diagnostic.CodeDeployPending) != diagnostic.ModuleDeploy {
		t.Error("core codes stay in the catalog")
	}
	if got := r.Messages("pt-BR")["mods.content.loader_plugin"]; got != "Plugin do carregador" {
		t.Errorf("pt-BR = %q", got)
	}
	if got := r.Messages("fr")["diag.code.loader_outdated"]; got != "The loader is outdated" {
		t.Errorf("fallback = %q", got)
	}

	plain, err := NewRegistry(bare{})
	if err != nil {
		t.Fatal(err)
	}
	if len(plain.Messages("en")) != 0 || plain.Diagnostics().Has("loader_outdated") {
		t.Error("without a catalog the adapter adds nothing")
	}
	if !plain.Diagnostics().Has(diagnostic.CodeFrameworkMissing) {
		t.Error("the core codes are always in effect")
	}
}

func TestRegistryRefusesBadAdapterCatalogs(t *testing.T) {
	edit := func(f func(c *ports.AdapterCatalog)) ports.AdapterCatalog {
		c := loaderCatalog()
		f(&c)
		return c
	}
	cases := map[string]ports.AdapterCatalog{
		"no en": edit(func(c *ports.AdapterCatalog) { delete(c.Messages, "en") }),
		"key outside the namespaces": edit(func(c *ports.AdapterCatalog) {
			c.Messages["en"]["nav.title"], c.Messages["pt-BR"]["nav.title"] = "x", "x"
		}),
		"language missing a key": edit(func(c *ports.AdapterCatalog) { delete(c.Messages["pt-BR"], "mods.content.loader_plugin") }),
		"language with an extra key": edit(func(c *ports.AdapterCatalog) {
			c.Messages["pt-BR"]["mods.content.other"] = "Outro"
		}),
		"empty text":        edit(func(c *ports.AdapterCatalog) { c.Messages["pt-BR"]["mods.content.loader_plugin"] = " " }),
		"code without text": edit(func(c *ports.AdapterCatalog) { c.Diagnostics[0].Code = "loader_missing" }),
		"core code redefined": edit(func(c *ports.AdapterCatalog) {
			c.Diagnostics[0].Code = diagnostic.CodeFrameworkMissing
			c.Messages["en"]["diag.code.framework_missing"], c.Messages["pt-BR"]["diag.code.framework_missing"] = "x", "x"
		}),
		"unknown module": edit(func(c *ports.AdapterCatalog) { c.Diagnostics[0].Module = "saves" }),
	}
	for name, c := range cases {
		if _, err := NewRegistry(described{name: "loader", cat: c}); err == nil {
			t.Errorf("%s: must be refused", name)
		}
	}
}

// Two adapters may share a key only with the same text: neither changes
// the other's label, and a code is declared once.
func TestRegistryRefusesCatalogCollisions(t *testing.T) {
	same := described{name: "twin", cat: ports.AdapterCatalog{Messages: loaderCatalog().Messages}}
	if _, err := NewRegistry(described{name: "loader", cat: loaderCatalog()}, same); err != nil {
		t.Errorf("same texts: %v", err)
	}
	other := loaderCatalog()
	other.Diagnostics = nil
	other.Messages["pt-BR"]["mods.content.loader_plugin"] = "Outro texto"
	_, err := NewRegistry(described{name: "loader", cat: loaderCatalog()}, described{name: "twin", cat: other})
	if err == nil || !strings.Contains(err.Error(), "mods.content.loader_plugin") {
		t.Errorf("different texts: %v", err)
	}
	if _, err := NewRegistry(described{name: "loader", cat: loaderCatalog()}, described{name: "twin", cat: loaderCatalog()}); err == nil {
		t.Error("a code declared by two adapters must be refused")
	}
}
