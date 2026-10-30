package integration_test

import (
	"slices"
	"testing"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/relpath"
)

type hintedFolderGame struct{ folderGame }

func (hintedFolderGame) RootHints(game.ID) ports.RootHints {
	return ports.RootHints{Dirs: []string{"meshes"}}
}

// Keep the installed fixture's source and lifecycle, replacing only the
// resolved destinations. Importing a wrapper would otherwise strip it.
func contentFixture(t *testing.T, e *env, path string, content []mod.ContentFlag, typ game.ModTypeID, elsewhere bool) mod.ID {
	t.Helper()
	id := e.installFiles(map[string][]string{"Wrapped": {"meshes/seed.nif", "seed"}}, "Wrapped")[0]
	m, err := e.mods.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	old, err := e.lib.Installations.Get(ctx, m.Installation)
	if err != nil {
		t.Fatal(err)
	}
	def, err := ports.InstanceDefinition(hintedFolderGame{}, e.inst)
	if err != nil {
		t.Fatal(err)
	}
	mt, ok := def.ModType(game.DefaultModType)
	if !ok {
		t.Fatal("missing default mod type")
	}
	loc, err := mod.Place(mt, id, relpath.MustParse(path))
	if err != nil {
		t.Fatal(err)
	}
	files := []mod.File{{Source: old.Files[0].Source, Dest: loc, Size: old.Files[0].Size}}
	if elsewhere {
		files = append(files, mod.File{Source: old.Files[0].Source, Dest: game.Location{Target: "other", Path: relpath.MustParse("extra.txt")}})
	}
	installation, err := mod.NewInstallation(mod.InstallationID(string(old.ID)+"-content"), id, e.inst.ID, old.Installer, old.Options, files, old.CreatedAt)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.lib.Installations.Save(ctx, installation); err != nil {
		t.Fatal(err)
	}
	m.Installation, m.Content, m.Type = installation.ID, content, typ
	if err := e.mods.Save(ctx, m); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestUnrecognizedContent(t *testing.T) {
	for _, tt := range []struct {
		name, path      string
		content         []mod.ContentFlag
		typ             game.ModTypeID
		elsewhere, want bool
	}{
		{"wrapper", "Wrapper/meshes/x.nif", nil, game.DefaultModType, false, true},
		{"recognized", "meshes/x.nif", nil, game.DefaultModType, false, false},
		{"detected content", "Wrapper/meshes/x.nif", []mod.ContentFlag{"meshes"}, game.DefaultModType, false, false},
		{"other mod type", "Wrapper/meshes/x.nif", nil, looseType, false, false},
		{"other target", "Wrapper/meshes/x.nif", nil, game.DefaultModType, true, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e, _ := folderEnv(t)
			registry, err := games.NewRegistry(hintedFolderGame{})
			if err != nil {
				t.Fatal(err)
			}
			e.lib.Registry, e.diag.Registry = registry, registry
			id := contentFixture(t, e, tt.path, tt.content, tt.typ, tt.elsewhere)
			got, err := e.lib.UnrecognizedContent(ctx, e.inst.ID)
			if err != nil {
				t.Fatal(err)
			}
			if tt.want {
				if len(got) != 1 || got[0].Mod != id || got[0].Name != "Wrapped" || !slices.Equal(got[0].Top, []string{"Wrapper"}) {
					t.Fatalf("unrecognized = %+v", got)
				}
			} else if len(got) != 0 {
				t.Fatalf("unrecognized = %+v", got)
			}
		})
	}
}

func TestUnrecognizedContentWithoutHints(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	e.installFiles(map[string][]string{"Wrapped": {"Wrapper/meshes/x.nif", "mesh"}}, "Wrapped")
	got, err := e.lib.UnrecognizedContent(ctx, e.inst.ID)
	if err != nil || got != nil {
		t.Fatalf("without hints = %+v, %v", got, err)
	}
}

func TestEvaluateUnrecognizedContent(t *testing.T) {
	e, _ := folderEnv(t)
	registry, err := games.NewRegistry(hintedFolderGame{})
	if err != nil {
		t.Fatal(err)
	}
	e.lib.Registry, e.diag.Registry = registry, registry
	id := contentFixture(t, e, "Wrapper/meshes/x.nif", nil, game.DefaultModType, false)
	ds, _, err := e.diag.Evaluate(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range ds {
		if d.Code != diagnostic.CodeModContentUnrecognized {
			continue
		}
		if d.Severity != diagnostic.SeverityWarning || len(d.Related) == 0 || d.Related[0].Kind != "mod" || d.Related[0].ID != string(id) {
			t.Fatalf("diagnostic = %+v", d)
		}
		var actions []string
		for _, a := range d.Actions {
			actions = append(actions, a.ID)
		}
		if !slices.Contains(actions, "mod.folder.open") || !slices.Contains(actions, "library.reinstall") {
			t.Fatalf("actions = %v", actions)
		}
		return
	}
	t.Fatalf("missing mod_content_unrecognized: %+v", ds)
}
