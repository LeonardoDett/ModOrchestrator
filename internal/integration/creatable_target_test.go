package integration_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"modorchestrator/internal/adapters/valheim"
	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
)

// frameworkEnv manages a game whose default target (the framework folder)
// does not exist in a fresh installation.
func frameworkEnv(t *testing.T) (*env, string) {
	t.Helper()
	var root string
	e := newEnvWith(t, envOptions{
		adapters: []ports.GameAdapter{valheim.Adapter{}},
		setup: func(dir string) games.Setup {
			root = filepath.Join(dir, "Game")
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
	return e, root
}

func (e *env) installPackage() mod.ID {
	e.t.Helper()
	zip := e.zipFile("Author-Some_Mod-1.2.3.zip",
		"manifest.json", `{"name":"Some_Mod","version_number":"1.2.3","description":"d","dependencies":[]}`,
		"icon.png", "png", "Some.dll", "dll")
	e.importAndWait(zip)
	row := e.only()
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{row.ID}, true); err != nil {
		e.t.Fatal(err)
	}
	return row.ID
}

// D118: the definition lists the target as creatable, so the first deploy
// creates the folder and the purge removes it again, empty.
func TestDeployCreatesADeclaredTargetAndPurgeRemovesIt(t *testing.T) {
	e, root := frameworkEnv(t)
	target := filepath.Join(root, "BepInEx")
	e.installPackage()
	// D118: the installer names the mod from the package manifest.
	if row := e.only(); row.Name != "Some Mod" || row.Version != "1.2.3" {
		t.Fatalf("mod named %q version %q", row.Name, row.Version)
	}
	if op := e.deploy("deploy"); op.Status != operation.StatusSucceeded {
		t.Fatalf("deploy: %+v", op)
	}
	if _, err := os.Stat(filepath.Join(target, "plugins", "Some_Mod", "Some.dll")); err != nil {
		t.Fatalf("deployed file: %v", err)
	}
	if op := e.deploy("purge"); op.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", op)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("the folder the manager created must be removed when empty: %v", err)
	}
	if got := tree(t, root); len(got) != 1 {
		t.Fatalf("game folder after purge: %v", got)
	}
}

// A created target that holds something the manager does not own (a file
// the game generated) is left alone; a target that was already there is
// never removed (INV-DEP-09).
func TestCreatedTargetWithOtherFilesAndExistingTargetStay(t *testing.T) {
	e, root := frameworkEnv(t)
	target := filepath.Join(root, "BepInEx")
	e.installPackage()
	e.deploy("deploy")
	e.write(filepath.Join(target, "LogOutput.log"), "generated")
	if op := e.deploy("purge"); op.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", op)
	}
	if _, err := os.Stat(filepath.Join(target, "LogOutput.log")); err != nil {
		t.Fatalf("a file of the game was removed: %v", err)
	}

	e2, root2 := frameworkEnv(t)
	target2 := filepath.Join(root2, "BepInEx")
	if err := os.Mkdir(target2, 0o755); err != nil {
		t.Fatal(err)
	}
	e2.installPackage()
	e2.deploy("deploy")
	if op := e2.deploy("purge"); op.Status != operation.StatusSucceeded {
		t.Fatalf("purge: %+v", op)
	}
	if _, err := os.Stat(target2); err != nil {
		t.Fatalf("a folder the manager did not create was removed: %v", err)
	}
}

// A missing target the definition does not list still blocks the deploy
// with nothing written: that is the protection against a folder (or a
// drive) that went away.
func TestMissingTargetThatIsNotCreatableStillBlocks(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	ids := e.installFiles(map[string][]string{"A": {"a.txt", "a"}}, "A")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	mods := filepath.Join(e.dir, "Game", "Mods")
	if err := os.RemoveAll(mods); err != nil {
		t.Fatal(err)
	}
	plan, err := e.dep.Preview(ctx, e.inst.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	if plan.BlockedCount != 1 || string(plan.Blocked[0].Reason) != "target_unavailable" {
		t.Fatalf("plan %+v", plan)
	}
	if _, err := os.Stat(mods); !os.IsNotExist(err) {
		t.Fatalf("the target must not be created: %v", err)
	}
	if strings.Contains(strings.Join(tree(t, filepath.Join(e.dir, "Game")), ","), "a.txt") {
		t.Fatal("nothing may be written")
	}
}
