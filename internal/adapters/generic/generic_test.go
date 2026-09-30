package generic

import (
	"context"
	"errors"
	"testing"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/testutil/memfs"
)

func TestTemplateDefinitionIsValid(t *testing.T) {
	def := Adapter{}.Definitions()[0]
	if err := def.Validate(); err != nil || !def.CustomTargets {
		t.Fatalf("template: %v custom=%v", err, def.CustomTargets)
	}
	for _, c := range []game.Capability{game.CapPlugins, game.CapLoadOrder} {
		if def.Capabilities.Has(c) {
			t.Errorf("generic games have no %s (core/11 §4)", c)
		}
	}
}

func TestInstanceDefinitionHasOneModTypePerTarget(t *testing.T) {
	targets, err := Adapter{}.Targets(GameID, `C:\Games\Valheim`, []game.TargetSpec{{ID: "mods", Path: "Mods"}, {ID: "bepinex", Path: "BepInEx/plugins"}})
	if err != nil {
		t.Fatal(err)
	}
	def, err := Adapter{}.InstanceDefinition(GameID, targets)
	if err != nil {
		t.Fatal(err)
	}
	if def.ModTypes[0].ID != game.DefaultModType || def.ModTypes[0].Target != "mods" || def.ModTypes[1].Target != "bepinex" {
		t.Fatalf("mod types = %+v", def.ModTypes)
	}
	if _, err := (Adapter{}).InstanceDefinition(GameID, nil); !errors.Is(err, game.ErrInvalid) {
		t.Fatal("instance without targets must be refused")
	}
}

func TestValidateRootNeedsAFolder(t *testing.T) {
	fs := memfs.New("C:")
	fs.AddDir(`C:\G`)
	fs.AddFile(`C:\f.txt`, "")
	ctx := context.Background()
	if err := (Adapter{}).ValidateRoot(ctx, fs, GameID, `C:\G`); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]game.RootReason{`C:\nope`: game.RootNotFound, `C:\f.txt`: game.RootNotDirectory} {
		var re *game.RootError
		if err := (Adapter{}).ValidateRoot(ctx, fs, GameID, path); !errors.As(err, &re) || re.Reason != want {
			t.Errorf("%s: %v", path, err)
		}
	}
}
