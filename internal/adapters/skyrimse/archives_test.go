package skyrimse

import (
	"context"
	"encoding/binary"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/testutil/memfs"
)

func header(magic string, version uint32) string {
	return string(binary.LittleEndian.AppendUint32([]byte(magic), version)) + "rest of the header"
}

func TestArchiveChecksReportArchivesOfAnotherGame(t *testing.T) {
	ctx := context.Background()
	fs := memfs.New("C:")
	files := []ports.TargetFile{}
	add := func(name, content string) {
		path := `C:\Staging\m1\` + name
		fs.AddFile(path, content)
		files = append(files, ports.TargetFile{Name: name, Mod: "m1", ModName: "Old Mod", Source: path})
	}
	add("Mod.bsa", header("BSA\x00", ArchiveVersion))
	add("Mod - Textures.bsa", header("BSA\x00", ArchiveVersionLE))
	add("Oblivion.bsa", header("BSA\x00", 103))
	add("Fallout4 - Main.bsa", header("BTDX", 1)) // not a BSA header
	add("Short.bsa", "BSA")                       // truncated
	add("Unloaded.bsa", header("BSA\x00", ArchiveVersionLE))
	add("Mod.esp", "")
	files = append(files, ports.TargetFile{Name: "Gone.bsa", Mod: "m1", Source: `C:\Staging\m1\Gone.bsa`})
	active := []plugin.Name{"Mod.esp", "Oblivion.esm", "Fallout4.esm", "Short.esp", "Gone.esp"}

	specs, err := Adapter{}.ArchiveChecks(ctx, fs, game.Instance{ID: "i1"}, files, active)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, s := range specs {
		if _, err := diagnostic.New(s); err != nil {
			t.Fatalf("invalid diagnostic (INV-OPS-06): %v", err)
		}
		if s.Code != CodeArchiveWrongGame || s.Severity != diagnostic.SeverityError || s.Actions[0].Target.ID != "m1" || s.Params["mod"] != "Old Mod" {
			t.Errorf("spec %+v", s)
		}
		got[s.Params["archive"]] = s.Params["version"]
	}
	want := map[string]string{"Mod - Textures.bsa": "104", "Oblivion.bsa": "103"}
	if len(got) != len(want) || got["Mod - Textures.bsa"] != "104" || got["Oblivion.bsa"] != "103" {
		t.Fatalf("reported %v, want %v", got, want)
	}
	if specs, _ := (Adapter{}).ArchiveChecks(ctx, fs, game.Instance{}, files, nil); len(specs) != 0 {
		t.Fatal("without active plugins no archive loads")
	}
}

func TestArchiveCodeIsDeclaredWithTexts(t *testing.T) {
	c := Adapter{}.Catalog()
	if len(c.Diagnostics) != 1 || c.Diagnostics[0].Code != CodeArchiveWrongGame || c.Diagnostics[0].Module != diagnostic.ModulePlugins {
		t.Fatalf("declared %+v", c.Diagnostics)
	}
	for _, lang := range []string{"en", "pt-BR"} {
		for _, k := range []string{"diag.code.archive_wrong_game", "diag.impact.archive_wrong_game", "diag.evidence.archive_version"} {
			if c.Messages[lang][k] == "" {
				t.Errorf("%s: %s missing", lang, k)
			}
		}
	}
}
