package integration_test

import (
	"context"
	"maps"
	"os"
	"path/filepath"
	"testing"

	"modorchestrator/internal/adapters/valheim"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
)

// ownCheck is the Valheim adapter with a check of its own, whose code it
// declares or not.
type ownCheck struct {
	valheim.Adapter
	declare bool
}

const codeOwn diagnostic.Code = "framework_outdated"

func (o ownCheck) HealthChecks(_ context.Context, _ ports.FileReader, inst game.Instance, _ []ports.ModContent) ([]diagnostic.Spec, error) {
	return []diagnostic.Spec{{
		Code: codeOwn, Severity: diagnostic.SeverityWarning, Params: diagnostic.Params{"version": "5.4"},
		Evidence: []diagnostic.Evidence{{Kind: "file_version", Params: diagnostic.Params{"version": "5.4"}}},
		Related:  []event.EntityRef{{Kind: "instance", ID: string(inst.ID)}},
	}}, nil
}

func (o ownCheck) Catalog() ports.AdapterCatalog {
	c := valheim.Adapter{}.Catalog()
	if !o.declare {
		return c
	}
	c.Diagnostics = []diagnostic.CodeSpec{{Code: codeOwn, Module: diagnostic.ModuleGame}}
	c.Messages = map[string]map[string]string{
		"en":    maps.Clone(c.Messages["en"]),
		"pt-BR": maps.Clone(c.Messages["pt-BR"]),
	}
	c.Messages["en"]["diag.code."+string(codeOwn)] = "The framework is outdated ({version})"
	c.Messages["pt-BR"]["diag.code."+string(codeOwn)] = "O framework está desatualizado ({version})"
	return c
}

func ownCheckEnv(t *testing.T, declare bool) *env {
	t.Helper()
	return newEnvWith(t, envOptions{
		adapters: []ports.GameAdapter{ownCheck{declare: declare}},
		setup: func(dir string) games.Setup {
			root := filepath.Join(dir, "Game")
			if err := os.MkdirAll(root, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, valheim.Executable), []byte("exe"), 0o644); err != nil {
				t.Fatal(err)
			}
			return games.Setup{
				Game: valheim.GameID, Root: root, Method: game.MethodCopy,
				Folders: games.Folders{
					Staging: filepath.Join(dir, "mo", "staging"), ArchiveStore: filepath.Join(dir, "mo", "archives"),
					BackupStore: filepath.Join(dir, "mo", "backups"),
				},
			}
		},
	})
}

// D131: an adapter brings the code of its own check and its texts; the
// problem joins the module the adapter chose, without any change to the
// core or to the app catalog.
func TestAdapterDeclaresItsOwnDiagnostic(t *testing.T) {
	e := ownCheckEnv(t, true)
	v, err := e.diag.Problems(ctx, e.inst.ID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, it := range v.Items {
		if it.Code == codeOwn {
			found = true
			if it.Module != diagnostic.ModuleGame {
				t.Errorf("module = %q", it.Module)
			}
		}
	}
	if !found {
		t.Fatalf("own code not shown: %+v", v.Items)
	}
}

// A code the adapter does not declare would have no module and no text:
// the evaluation refuses it instead of showing an id.
func TestAdapterCodeMustBeDeclared(t *testing.T) {
	e := ownCheckEnv(t, false)
	v, err := e.diag.Problems(ctx, e.inst.ID)
	if err == nil && !v.Partial {
		for _, it := range v.Items {
			if it.Code == codeOwn {
				t.Fatalf("an undeclared code was shown: %+v", it)
			}
		}
		t.Fatal("an undeclared code must make the evaluation fail or be partial")
	}
}
