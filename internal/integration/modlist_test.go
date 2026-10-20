package integration_test

import (
	"strings"
	"testing"

	"modorchestrator/internal/core/domain/rules"
)

// Mods › Mais ações › "Exportar a lista em texto" (board JogoModsMenus):
// the active profile in priority order, enabled ones marked.
func TestModListTextFollowsTheActiveProfile(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"Alpha": {"textures/a.dds", "a"},
		"Bravo": {"textures/b.dds", "b"},
	}, "Alpha", "Bravo")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids[1:], false); err != nil {
		t.Fatal(err)
	}
	text, err := e.lib.ModListText(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(text), "\r\n")
	if len(lines) != 3 || !strings.HasPrefix(lines[0], "# ") || lines[1] != "[x] Alpha" || lines[2] != "[ ] Bravo" {
		t.Fatalf("text:\n%s", text)
	}
}

// Mods › Filtros › Situação: a mod whose requirement is disabled is
// "Com requisito faltando", from the visible problems.
func TestModFlagsMarkMissingRequirement(t *testing.T) {
	e := newEnv(t)
	ids := e.installFiles(map[string][]string{
		"Alpha": {"textures/a.dds", "a"},
		"Bravo": {"textures/b.dds", "b"},
	}, "Alpha", "Bravo")
	if _, err := e.prof.AddDependency(ctx, e.inst.ID, ids[0], ids[1], rules.Requires); err != nil {
		t.Fatal(err)
	}
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids[1:], false); err != nil {
		t.Fatal(err)
	}
	flags, err := e.diag.ModFlags(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !flags[string(ids[0])].MissingRequirement || flags[string(ids[1])].MissingRequirement {
		t.Fatalf("flags: %+v", flags)
	}
}
