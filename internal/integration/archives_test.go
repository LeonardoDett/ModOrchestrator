package integration_test

import (
	"encoding/binary"
	"slices"
	"testing"

	"modorchestrator/internal/adapters/skyrimse"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/health"
	"modorchestrator/internal/core/domain/mod"
)

// bsa is the start of a BSA header: magic and version.
func bsa(version uint32) string {
	b := []byte("BSA\x00")
	b = binary.LittleEndian.AppendUint32(b, version)
	return string(append(b, make([]byte, 28)...))
}

// D141: an archive of Skyrim LE that an active plugin loads is an error with
// the mod it comes from and "Open mod folder"; a Special Edition archive,
// an archive no plugin loads and a disabled mod are not reported.
func TestArchiveOfAnotherGameIsAnError(t *testing.T) {
	e := pluginEnv(t)
	ids := e.installFiles(map[string][]string{
		"Old":    {"Old.esp", string(tes4(0, "Skyrim.esm")), "Old - Textures.bsa", bsa(skyrimse.ArchiveVersionLE)},
		"New":    {"New.esp", string(tes4(0, "Skyrim.esm")), "New.bsa", bsa(skyrimse.ArchiveVersion)},
		"Orphan": {"Lonely.bsa", bsa(skyrimse.ArchiveVersionLE)},
	}, "Old", "New", "Orphan")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	var found []string
	var target, nav string
	for _, d := range e.problems().Items {
		if d.Code != skyrimse.CodeArchiveWrongGame {
			continue
		}
		found = append(found, d.Params["archive"])
		if d.Severity != diagnostic.SeverityError || d.Params["mod"] != "Old" || d.Params["version"] != "104" {
			t.Errorf("diagnostic %+v", d)
		}
		target, nav = d.Actions[0].Target.ID, d.Actions[0].NavigateTo
	}
	if !slices.Equal(found, []string{"Old - Textures.bsa"}) {
		t.Fatalf("archive_wrong_game for %v, want only the LE archive an active plugin loads", found)
	}
	if target != string(ids[0]) || nav != health.NavigateModFolder || !slices.Contains(e.diag.PlaceTargets(), nav) {
		t.Fatalf("action leads to %q on %q", nav, target)
	}
	// Disabling the plugin's mod removes the archive from the game.
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, []mod.ID{ids[0]}, false); err != nil {
		t.Fatal(err)
	}
	if _, still := e.problem(skyrimse.CodeArchiveWrongGame); still {
		t.Fatal("a disabled mod loads no archive")
	}
}

// D112: the generic adapter has no plugins capability and checks no
// archive, whatever the files are.
func TestGenericAdapterChecksNoArchive(t *testing.T) {
	e := newEnvWith(t, envOptions{generic: true})
	ids := e.installFiles(map[string][]string{"Old": {"Old.esp", "x", "Old.bsa", bsa(skyrimse.ArchiveVersionLE)}}, "Old")
	if err := e.prof.SetModsEnabled(ctx, e.inst.ID, ids, true); err != nil {
		t.Fatal(err)
	}
	for _, d := range e.problems().Items {
		if d.Code == skyrimse.CodeArchiveWrongGame {
			t.Fatalf("generic adapter reported %+v", d)
		}
	}
}
