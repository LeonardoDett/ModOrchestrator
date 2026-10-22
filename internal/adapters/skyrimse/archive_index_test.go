package skyrimse

import (
	"context"
	"errors"
	"slices"
	"testing"

	"modorchestrator/internal/adapters/gamebryo"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/plugin"
	"modorchestrator/internal/testutil/memfs"
)

func TestLoadedArchivesFollowTheLoadOrder(t *testing.T) {
	files := []string{"B.bsa", "A - Textures.bsa", "A.bsa", "A - Animations.bsa", "Orphan.bsa", "A.esp", "B.esm", "b.BSA"}
	active := []plugin.Name{"A.esp", "B.esm"}
	got := Adapter{}.LoadedArchives(GameID, files, active)
	want := []string{"A.bsa", "A - Animations.bsa", "A - Textures.bsa", "B.bsa"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	// Moving B before A in the load order moves its archive first.
	if got := (Adapter{}).LoadedArchives(GameID, files, []plugin.Name{"B.esm", "A.esp"}); got[0] != "B.bsa" {
		t.Fatalf("got %v", got)
	}
	if got := (Adapter{}).LoadedArchives(GameID, files, nil); len(got) != 0 {
		t.Fatalf("no active plugin loads nothing: %v", got)
	}
}

func TestReadArchiveIndexReadsOnlySkyrimSEArchives(t *testing.T) {
	ctx := context.Background()
	fs := memfs.New("C:")
	fs.AddFile(`C:\S\se.bsa`, string(gamebryo.BuildBSA(ArchiveVersion, []string{`meshes\a.nif`, `textures\a.dds`})))
	fs.AddFile(`C:\S\le.bsa`, string(gamebryo.BuildBSA(ArchiveVersionLE, []string{`meshes\a.nif`})))
	fs.AddFile(`C:\S\junk.bsa`, "not an archive")
	got, err := Adapter{}.ReadArchiveIndex(ctx, fs, GameID, `C:\S\se.bsa`)
	if err != nil || len(got) != 2 {
		t.Fatalf("got %v, %v", got, err)
	}
	for _, p := range []string{`C:\S\le.bsa`, `C:\S\junk.bsa`} {
		if _, err := (Adapter{}).ReadArchiveIndex(ctx, fs, GameID, p); !errors.Is(err, ports.ErrArchiveUnreadable) {
			t.Errorf("%s: %v, want ErrArchiveUnreadable", p, err)
		}
	}
	if _, err := (Adapter{}).ReadArchiveIndex(ctx, fs, GameID, `C:\S\gone.bsa`); err == nil || errors.Is(err, ports.ErrArchiveUnreadable) {
		t.Errorf("a missing file is an error of the disk, not of the format: %v", err)
	}
}
